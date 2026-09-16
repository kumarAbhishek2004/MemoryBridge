"""
summary_pipeline.py
===================
Stateful, incremental conversation summariser powered by LangChain + Gemini.

Design
------
Each patient session maintains its own SummaryState in memory (keyed by
conversation_id).  As Deepgram produces final transcripts, they are fed to
`update_summary()` which:

  1. Appends the new sentence to the running transcript buffer.
  2. Calls the LLM to produce an updated summary from the accumulated text.
  3. Returns the new summary text.

The summary focuses on medically relevant facts:
  - People involved (name, relation)
  - Topics discussed (medication, symptoms, appointments)
  - Emotional tone (anxious, calm, confused)
  - Any important requests or reminders

This keeps the summary useful for Alzheimer caregivers reviewing a session.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from langchain_groq import ChatGroq
from server.config.env import GEMINI_API_KEY, GROQ_API_KEY

logger = logging.getLogger(__name__)

# ── LLM (shared, thread-safe) ─────────────────────────────────────────────────
# Primary model: Gemini 3.6 Flash
_gemini_llm = ChatGoogleGenerativeAI(
    model="gemini-3.6-flash",
    temperature=0.2,               # low temperature → consistent, factual output
    google_api_key=GEMINI_API_KEY,
)

# Fallback model: Groq OSS
_groq_llm = ChatGroq(
    model="llama-3.1-8b-instant",
    temperature=0.2,
    api_key=GROQ_API_KEY,
)

# Chain with fallback
_llm = _gemini_llm.with_fallbacks([_groq_llm])

# ── System prompt ──────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are an AI assistant helping Alzheimer's caregivers.
Your task is to maintain a concise, structured summary of an ongoing conversation
involving an Alzheimer's patient.

FOCUS ON:
- Who is present (names and their relation to the patient)
- Medical topics (medications, symptoms, appointments, dosages)
- Important reminders or requests made during the conversation
- Emotional tone (calm, anxious, confused, happy)
- Any key events or decisions

FORMAT:
Return a clean, easy-to-read summary in 3-6 bullet points.
Start each bullet with an emoji that fits the context:
  👤 for people, 💊 for medication, 📅 for appointments,
  ❤️ for emotional state, 📝 for reminders, ⚠️ for concerns.

Keep the language simple — the patient or a caregiver may read this.
Do NOT include irrelevant small talk or filler sentences.
If nothing medically relevant has been said yet, write "• Conversation just started."
"""


# ── Per-session state ─────────────────────────────────────────────────────────
@dataclass
class SummaryState:
    conversation_id: int
    patient_name: str
    sentences: list[str] = field(default_factory=list)
    current_summary: str = "• Conversation just started."
    last_updated: datetime = field(default_factory=datetime.utcnow)

    def add_sentence(self, text: str) -> None:
        self.sentences.append(text)
        self.last_updated = datetime.utcnow()

    @property
    def full_transcript(self) -> str:
        return "\n".join(self.sentences)


# ── In-memory session store ───────────────────────────────────────────────────
# conversation_id → SummaryState
_sessions: dict[int, SummaryState] = {}


# ── Public API ────────────────────────────────────────────────────────────────

def create_session(conversation_id: int, patient_name: str) -> SummaryState:
    """Create a fresh SummaryState for a new conversation."""
    state = SummaryState(
        conversation_id=conversation_id,
        patient_name=patient_name,
    )
    _sessions[conversation_id] = state
    logger.info("Summary session created for conversation %d", conversation_id)
    return state


def get_session(conversation_id: int) -> SummaryState | None:
    """Retrieve an existing session, or None if not found."""
    return _sessions.get(conversation_id)


def close_session(conversation_id: int) -> SummaryState | None:
    """Remove and return the session (called when conversation ends)."""
    return _sessions.pop(conversation_id, None)


async def update_summary(conversation_id: int, new_sentence: str) -> str:
    """
    Append `new_sentence` to the running transcript and regenerate the summary.

    Returns the updated summary string.
    Raises KeyError if the session doesn't exist.
    """
    state = _sessions.get(conversation_id)
    if state is None:
        logger.warning(f"No summary session in memory for conv {conversation_id}. Re-creating an empty one.")
        state = create_session(conversation_id, "Patient") # Fallback name

    state.add_sentence(new_sentence)

    # Build the LLM prompt
    user_content = (
        f"Patient name: {state.patient_name}\n\n"
        f"Conversation transcript so far:\n{state.full_transcript}\n\n"
        "Please produce an updated summary."
    )

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=user_content),
    ]

    try:
        logger.info("Calling Gemini for summary update (conv %d, %d sentences)", conversation_id, len(state.sentences))
        response = await _llm.ainvoke(messages)
        
        # Handle case where response.content is a list (e.g. multi-modal or newer Langchain versions)
        if isinstance(response.content, list):
            summary_text = "".join(
                str(part.get("text", "")) if isinstance(part, dict) else str(part)
                for part in response.content
            ).strip()
        else:
            summary_text = str(response.content).strip()
            
        logger.info("Gemini summary update successful for conv %d", conversation_id)
    except Exception as exc:
        logger.error("LLM summarisation failed for conversation %d: %s", conversation_id, exc)
        # Keep the old summary rather than breaking the session
        summary_text = state.current_summary

    state.current_summary = summary_text
    logger.debug(
        "Summary updated for conversation %d (%d sentences)",
        conversation_id,
        len(state.sentences),
    )
    return summary_text
