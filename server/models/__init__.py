# Import all models here so SQLAlchemy can register them
# and Alembic can detect them for migrations.

from server.models.user import User
from server.models.patient import Patient
from server.models.person import Person, FaceEmbedding
from server.models.conversation import Conversation, Transcript, Summary
from server.models.location import Location
from server.models.routine import RoutineItem

__all__ = [
    "User",
    "Patient",
    "Person",
    "FaceEmbedding",
    "Conversation",
    "Transcript",
    "Summary",
    "Location",
    "RoutineItem",
]
