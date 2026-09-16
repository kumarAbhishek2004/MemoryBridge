"""
transcription_service.py
========================
Manages per-session Deepgram live-transcription WebSocket connections.

Key design decision: every Conversation is linked to a Person (person_id).
This allows the system to retrieve past conversations when a face is recognised —
we look up conversations by person_id and show the patient what was discussed.

Flow:
  1. Face recognised in patient mode → person_id known
  2. Frontend emits start_transcription with { patient_id, patient_name, person_id }
  3. Conversation row created with person_id set
  4. Next time same face is recognised → /recognition/conversations-for-person/:person_id
     returns all past conversations with that person

Driver: Deepgram async WebSocket client (AsyncListenWebSocketClient)
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

from deepgram import (
    DeepgramClient,
    DeepgramClientOptions,
    LiveOptions,
    LiveTranscriptionEvents,
)
from sqlalchemy.orm import Session

from server.ai.summary_pipeline import (
    create_session as create_summary_session,
    close_session as close_summary_session,
    update_summary,
)
from server.config.env import DEEPGRAM_API_KEY
from server.config.db import SessionLocal
from server.models.conversation import Conversation, Transcript, Summary

if TYPE_CHECKING:
    import socketio

logger = logging.getLogger(__name__)


# ── Deepgram live options ─────────────────────────────────────────────────────
_LIVE_OPTIONS = LiveOptions(
    model="nova-2",
    language="en-US",
    smart_format=True,
    interim_results=False,
    endpointing=400,
)


# ── Per-session state ─────────────────────────────────────────────────────────
@dataclass
class TranscriptionSession:
    sid:             str
    conversation_id: int
    patient_id:      int
    patient_name:    str
    person_id:       int | None          # ← which recognised face triggered this session
    dg_connection:   object
    sio:             object
    started_at:      datetime = field(default_factory=datetime.utcnow)


_active: dict[str, TranscriptionSession] = {}

_dg_client = DeepgramClient(
    DEEPGRAM_API_KEY,
    config=DeepgramClientOptions(verbose=False),
)


# ── DB helpers ────────────────────────────────────────────────────────────────

def _create_conversation_in_db(patient_id: int, person_id: int | None) -> int:
    db: Session = SessionLocal()
    try:
        conv = Conversation(
            patient_id=patient_id,
            person_id=person_id,          # ← critical link
            started_at=datetime.utcnow(),
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)
        return conv.id
    except Exception as exc:
        logger.error("Failed to create conversation: %s", exc)
        db.rollback()
        raise
    finally:
        db.close()


def _save_transcript_to_db(conversation_id: int, text: str) -> None:
    db: Session = SessionLocal()
    try:
        db.add(Transcript(
            conversation_id=conversation_id,
            text=text,
            timestamp=datetime.utcnow(),
        ))
        db.commit()
    except Exception as exc:
        logger.error("Failed to save transcript: %s", exc)
        db.rollback()
    finally:
        db.close()


def _save_summary_to_db(conversation_id: int, summary_text: str) -> None:
    db: Session = SessionLocal()
    try:
        existing = db.query(Summary).filter(
            Summary.conversation_id == conversation_id
        ).first()
        if existing:
            existing.text = summary_text
            existing.generated_at = datetime.utcnow()
        else:
            db.add(Summary(
                conversation_id=conversation_id,
                text=summary_text,
                generated_at=datetime.utcnow(),
            ))
        db.commit()
    except Exception as exc:
        logger.error("Failed to save summary: %s", exc)
        db.rollback()
    finally:
        db.close()


def _close_conversation_in_db(conversation_id: int) -> None:
    db: Session = SessionLocal()
    try:
        conv = db.query(Conversation).filter(
            Conversation.id == conversation_id
        ).first()
        if conv:
            conv.ended_at = datetime.utcnow()
            db.commit()
    except Exception as exc:
        logger.error("Failed to close conversation: %s", exc)
        db.rollback()
    finally:
        db.close()


# ── Public API ────────────────────────────────────────────────────────────────

async def start_session(
    sid:          str,
    patient_id:   int,
    patient_name: str,
    sio:          "socketio.AsyncServer",
    person_id:    int | None = None,
) -> int:
    """
    Start a new transcription session.
    person_id links this conversation to a recognised face.
    Returns the conversation_id.
    """
    if sid in _active:
        logger.warning("Session already active for sid=%s, closing old one", sid)
        await stop_session(sid)

    conversation_id = _create_conversation_in_db(patient_id, person_id)
    create_summary_session(conversation_id, patient_name)

    # Use the ASYNC live client — avoids threading + asyncio conflicts
    dg_connection = _dg_client.listen.asynclive.v("1")

    # ── Event handlers (async) ────────────────────────────────────────────
    async def on_message(self_dg, result, **kwargs):
        """Called when Deepgram returns a transcription result."""
        try:
            # In SDK v3, `result` is a LiveResultResponse with .channel
            if not hasattr(result, "channel"):
                return
            alt = result.channel.alternatives
            if not alt:
                return
            sentence: str = alt[0].transcript
            if not sentence.strip():
                return
            # Only process final results
            if hasattr(result, "is_final") and not result.is_final:
                return

            logger.info("Transcript [sid=%s]: %s", sid, sentence)
            await _handle_final_transcript(sid, conversation_id, sentence, sio)
        except Exception as exc:
            logger.error("Deepgram on_message error: %s", exc)

    async def on_error(self_dg, error, **kwargs):
        logger.error("Deepgram error sid=%s: %s", sid, error)
        await sio.emit("transcription_error", {"message": f"Deepgram error: {error}"}, to=sid)

    async def on_close(self_dg, close, **kwargs):
        logger.info("Deepgram closed sid=%s", sid)

    dg_connection.on(LiveTranscriptionEvents.Transcript, on_message)
    dg_connection.on(LiveTranscriptionEvents.Error, on_error)
    dg_connection.on(LiveTranscriptionEvents.Close, on_close)

    started = await dg_connection.start(_LIVE_OPTIONS)
    if not started:
        raise RuntimeError("Failed to start Deepgram connection")

    _active[sid] = TranscriptionSession(
        sid=sid,
        conversation_id=conversation_id,
        patient_id=patient_id,
        patient_name=patient_name,
        person_id=person_id,
        dg_connection=dg_connection,
        sio=sio,
    )

    logger.info(
        "Transcription started: sid=%s patient=%s person_id=%s conversation=%d",
        sid, patient_name, person_id, conversation_id,
    )
    return conversation_id


async def send_audio(sid: str, audio_bytes: bytes) -> None:
    session = _active.get(sid)
    if not session:
        return
    try:
        await session.dg_connection.send(audio_bytes)
    except Exception as exc:
        logger.error("Failed to send audio sid=%s: %s", sid, exc)


async def stop_session(sid: str) -> dict | None:
    session = _active.pop(sid, None)
    if not session:
        return None

    cid = session.conversation_id

    try:
        await session.dg_connection.finish()
    except Exception as exc:
        logger.warning("Error finishing Deepgram: %s", exc)

    summary_state = close_summary_session(cid)
    final_summary = summary_state.current_summary if summary_state else ""

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _save_summary_to_db, cid, final_summary)
    await loop.run_in_executor(None, _close_conversation_in_db, cid)

    logger.info("Transcription stopped: sid=%s conversation=%d", sid, cid)
    return {
        "conversation_id": cid,
        "summary": final_summary,
        "person_id": session.person_id,
    }


def get_active_session(sid: str) -> TranscriptionSession | None:
    return _active.get(sid)


# ── REST-based helpers (client-side Deepgram) ─────────────────────────────────
# Used when the browser runs Deepgram directly and POSTs text to the backend.

async def rest_save_transcript_line(conversation_id: int, text: str) -> dict:
    """
    Save a single transcript line sent by the client.
    Returns the saved transcript row as a dict.
    """
    db: Session = SessionLocal()
    try:
        row = Transcript(
            conversation_id=conversation_id,
            text=text,
            timestamp=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        
        # Also try to update the live summary
        summary = ""
        try:
            from server.ai.summary_pipeline import update_summary
            summary = await update_summary(conversation_id, text)
        except Exception as e:
            logger.error(f"Live summary update failed: {e}")

        return {"id": row.id, "text": row.text, "timestamp": row.timestamp.isoformat(), "summary": summary}
    except Exception as exc:
        logger.error("rest_save_transcript_line failed: %s", exc)
        db.rollback()
        raise
    finally:
        db.close()


def rest_create_conversation(patient_id: int, patient_name: str, person_id: int | None) -> int:
    """
    Create a new conversation row (called when the client starts recording).
    Returns the new conversation_id.
    """
    cid = _create_conversation_in_db(patient_id, person_id)
    from server.ai.summary_pipeline import create_session as create_summary_session
    create_summary_session(cid, patient_name)
    return cid


async def rest_finish_conversation(
    conversation_id: int,
    patient_name:    str,
    full_transcript: str,
) -> str:
    """
    Retrieves the final Gemini summary and closes the memory session.
    If the summary is empty or missing, generates a new one from full_transcript.
    DB operations should be run in a background task by the caller.
    """
    from server.ai.summary_pipeline import (
        close_session as _close,
        get_session,
        generate_one_off_summary,
    )
    
    summary_text = ""
    sess = get_session(conversation_id)
    if sess:
        _close(conversation_id)

    # Always generate a fresh, comprehensive summary for the entire text
    if full_transcript.strip():
        summary_text = await generate_one_off_summary(patient_name, full_transcript)

    return summary_text


async def _handle_final_transcript(
    sid: str,
    conversation_id: int,
    sentence: str,
    sio: "socketio.AsyncServer",
) -> None:
    await sio.emit("transcript_line", {"text": sentence}, to=sid)

    loop = asyncio.get_running_loop()
    asyncio.create_task(
        loop.run_in_executor(
            None, _save_transcript_to_db, conversation_id, sentence
        )
    )

    try:
        new_summary = await update_summary(conversation_id, sentence)
        await sio.emit("summary_update", {"summary": new_summary}, to=sid)
    except KeyError:
        pass
    except Exception as exc:
        logger.error("Summary update failed conversation=%d: %s", conversation_id, exc)
