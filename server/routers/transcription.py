"""
transcription.py  —  REST router + Socket.IO event handlers
============================================================

Socket.IO events
----------------
  Client → Server:
    start_transcription  { patient_id, patient_name, person_id? }
    audio_data           <binary bytes>
    stop_transcription   {}

  Server → Client:
    transcription_started  { conversation_id, person_id }
    transcript_line        { text }
    summary_update         { summary }
    transcription_stopped  { conversation_id, summary, person_id }
    transcription_error    { message }

REST endpoints
--------------
  GET /transcription/conversations/:patient_id
      All conversations for a patient (newest first), with person info attached.

  GET /transcription/conversations/:patient_id/:conversation_id
      Single conversation with full transcript + summary.

  GET /transcription/person/:person_id/conversations
      All conversations linked to a recognised person  ← KEY for face-triggered history.
"""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from server.config.db import get_db
from server.config.socket_server import sio
from server.core.api_error import ApiError
from server.core.api_response import ApiResponse
from server.dependencies.auth import verify_token
from server.models.conversation import Conversation
from server.models.person import Person
from server.models.patient import Patient
from server.services import transcription_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transcription", tags=["Transcription"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _serialise_conversation(conv: Conversation) -> dict:
    """Consistent shape for every conversation returned by REST endpoints."""
    person = None
    if conv.person:
        person = {
            "id":       conv.person.id,
            "name":     conv.person.name,
            "relation": conv.person.relation,
            "is_known": conv.person.is_known,
        }

    transcripts = [
        {"id": t.id, "text": t.text, "timestamp": t.timestamp.isoformat()}
        for t in sorted(conv.transcripts, key=lambda t: t.timestamp)
    ]

    return {
        "id":          conv.id,
        "patient_id":  conv.patient_id,
        "person_id":   conv.person_id,
        "person":      person,
        "started_at":  conv.started_at.isoformat(),
        "ended_at":    conv.ended_at.isoformat() if conv.ended_at else None,
        "summary":     conv.summary.text if conv.summary else None,
        "transcripts": transcripts,
    }


# ── REST routes ───────────────────────────────────────────────────────────────

# ── Pydantic request bodies for client-side Deepgram endpoints ────────────────

class StartConversationBody(BaseModel):
    patient_id:   int
    patient_name: str
    person_id:    int | None = None


class TranscriptLineBody(BaseModel):
    conversation_id: int
    text:            str


class FinishConversationBody(BaseModel):
    conversation_id: int
    patient_name:    str
    full_transcript: str   # entire joined transcript sent at the end


@router.post("/start", response_model=ApiResponse)
def start_conversation(
    body: StartConversationBody,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """
    Create a new Conversation row when the client starts recording.
    Returns { conversation_id } — the client stores this and passes it
    with every subsequent transcript-line POST.
    """
    conversation_id = transcription_service.rest_create_conversation(
        patient_id=body.patient_id,
        patient_name=body.patient_name,
        person_id=body.person_id,
    )
    return ApiResponse(
        success=True,
        message="Conversation started",
        data={"conversation_id": conversation_id},
    )


@router.post("/transcript-line", response_model=ApiResponse)
async def save_transcript_line(
    body: TranscriptLineBody,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """
    Save a single transcript line produced by the client-side Deepgram SDK.
    Called in real time as each final sentence arrives.
    """
    try:
        saved = await transcription_service.rest_save_transcript_line(
            conversation_id=body.conversation_id,
            text=body.text,
        )
    except Exception as exc:
        raise ApiError(500, f"Failed to save transcript line: {exc}")

    return ApiResponse(
        success=True,
        message="Transcript line saved",
        data=saved,
    )


from fastapi import BackgroundTasks
from server.services.transcription_service import _save_summary_to_db, _close_conversation_in_db

def _finalize_conversation_task(conversation_id: int, summary_text: str):
    try:
        _save_summary_to_db(conversation_id, summary_text)
        _close_conversation_in_db(conversation_id)
    except Exception as e:
        logger.error(f"Failed to finalize conversation in background: {e}")

@router.post("/finish", response_model=ApiResponse)
async def finish_conversation(
    body: FinishConversationBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """
    Called when the client stops recording.
    Retrieves summary from memory and triggers DB save in the background.
    """
    try:
        summary = await transcription_service.rest_finish_conversation(
            conversation_id=body.conversation_id,
            patient_name=body.patient_name,
            full_transcript=body.full_transcript,
        )
        background_tasks.add_task(_finalize_conversation_task, body.conversation_id, summary)
    except Exception as exc:
        raise ApiError(500, f"Failed to finish conversation: {exc}")

    return ApiResponse(
        success=True,
        message="Conversation finished",
        data={"summary": summary},
    )

@router.get("/conversations/{patient_id}", response_model=ApiResponse)
def get_conversations(
    patient_id: int,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """All conversations for a patient, newest first, with person context."""
    conversations = (
        db.query(Conversation)
        .filter(Conversation.patient_id == patient_id)
        .order_by(Conversation.started_at.desc())
        .all()
    )
    return ApiResponse(
        success=True,
        message="Conversations fetched",
        data=[_serialise_conversation(c) for c in conversations],
    )


@router.get("/conversations/{patient_id}/{conversation_id}", response_model=ApiResponse)
def get_conversation(
    patient_id: int,
    conversation_id: int,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """Single conversation with full transcript and summary."""
    conv = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.patient_id == patient_id,
        )
        .first()
    )
    if not conv:
        raise ApiError(404, "Conversation not found")
    return ApiResponse(
        success=True,
        message="Conversation fetched",
        data=_serialise_conversation(conv),
    )


@router.get("/person/{person_id}/conversations", response_model=ApiResponse)
def get_conversations_for_person(
    person_id: int,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """
    Return all conversations that were linked to a specific recognised person.

    Called by the frontend immediately after face recognition succeeds,
    so the patient can see what they talked about with this person before.
    """
    person = db.get(Person, person_id)
    if not person:
        raise ApiError(404, "Person not found")

    # Access Control for past conversations in patient mode
    patient = person.patient
    level = (patient.diagnosis_level or "mild").lower()
    
    if level == "mild":
        history_restricted = False
    elif level == "moderate":
        history_restricted = not patient.show_history_on_moderate
    else: # severe or any other
        history_restricted = True

    if history_restricted:
        conversations = []
        message = f"History restricted for {person.name or 'this person'} ({level.title()} Case Privacy)"
    else:
        conversations = (
            db.query(Conversation)
            .filter(Conversation.person_id == person_id)
            .order_by(Conversation.started_at.desc())
            .all()
        )
        message = f"Conversations with {person.name or 'this person'} fetched"

    return ApiResponse(
        success=True,
        message=message,
        data={
            "person": {
                "id":       person.id,
                "name":     person.name,
                "relation": person.relation,
                "is_known": person.is_known,
            },
            "conversations": [_serialise_conversation(c) for c in conversations],
            "history_restricted": history_restricted
        },
    )


# ── Socket.IO event handlers ──────────────────────────────────────────────────

@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None):
    logger.info("Socket connected: sid=%s", sid)


@sio.event
async def disconnect(sid: str):
    logger.info("Socket disconnected: sid=%s", sid)
    session = transcription_service.get_active_session(sid)
    if session:
        result = await transcription_service.stop_session(sid)
        if result:
            await sio.emit("transcription_stopped", result, to=sid)


@sio.event
async def start_transcription(sid: str, data: dict):
    """
    data = {
        "patient_id":   int,
        "patient_name": str,
        "person_id":    int | null   ← ID of the recognised person (may be None)
    }
    """
    patient_id   = data.get("patient_id")
    patient_name = data.get("patient_name", "Patient")
    person_id    = data.get("person_id")   # None = conversation with unknown/no face

    if not patient_id:
        await sio.emit("transcription_error", {"message": "patient_id is required"}, to=sid)
        return

    try:
        conversation_id = await transcription_service.start_session(
            sid=sid,
            patient_id=patient_id,
            patient_name=patient_name,
            sio=sio,
            person_id=person_id,
        )
        await sio.emit(
            "transcription_started",
            {"conversation_id": conversation_id, "person_id": person_id},
            to=sid,
        )
        logger.info(
            "Transcription started: sid=%s patient_id=%d person_id=%s conversation_id=%d",
            sid, patient_id, person_id, conversation_id,
        )
    except Exception as exc:
        logger.error("Failed to start transcription sid=%s: %s", sid, exc)
        await sio.emit(
            "transcription_error",
            {"message": f"Failed to start transcription: {exc}"},
            to=sid,
        )


@sio.event
async def audio_data(sid: str, data: bytes):
    await transcription_service.send_audio(sid, data)


@sio.event
async def stop_transcription(sid: str, data: dict | None = None):
    result = await transcription_service.stop_session(sid)
    if result:
        await sio.emit("transcription_stopped", result, to=sid)
    else:
        await sio.emit(
            "transcription_error",
            {"message": "No active transcription session to stop"},
            to=sid,
        )
