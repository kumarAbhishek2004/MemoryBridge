import sys
import os

# Add parent directory to path so absolute 'server.' imports work
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import socketio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from server.config.db import Base, engine
from server.core.api_error import ApiError
from server.core.exception_handler import api_error_handler
from server.config.socket_server import sio

# Register all models with SQLAlchemy before create_all
from server.models import User, Patient, Person, FaceEmbedding
from server.models import Conversation, Transcript, Summary
from server.models import Location, RoutineItem

# Routers
from server.routers.auth import router as auth_router
from server.routers.user import router as user_router
from server.routers.patient import router as patient_router
from server.routers.recognition import router as recognition_router
from server.routers.transcription import router as transcription_router
from server.routers.tracking import router as tracking_router
from server.routers.routine import router as routine_router

# Import transcription module so Socket.IO event handlers are registered
import server.routers.transcription  # noqa: F401

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MemoryBridge API",
    description="AI-assisted memory support system for Alzheimer's patients.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(ApiError, api_error_handler)

app.include_router(auth_router)
app.include_router(user_router)
app.include_router(patient_router)
app.include_router(recognition_router)
app.include_router(transcription_router)
app.include_router(tracking_router)
app.include_router(routine_router)

# ── Socket.IO + FastAPI ASGI app ──────────────────────────────────────────────
# Wrap the FastAPI app with Socket.IO so both HTTP and WS traffic go through
# a single ASGI application. Use this `application` as the Uvicorn target:
#   uvicorn server.main:application --reload
application = socketio.ASGIApp(sio, other_asgi_app=app)
