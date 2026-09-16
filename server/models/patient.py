from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from server.config.db import Base


class Patient(Base):
    """
    Patient represents the Alzheimer patient profile.

    Core entity of MemoryBridge.

    Everything important belongs to a patient:
    - known persons
    - unknown faces
    - embeddings
    - conversations
    """

    __tablename__ = "patients"

    id = Column(Integer, primary_key=True)

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    name = Column(String, nullable=False)

    age = Column(Integer, nullable=True)

    diagnosis_level = Column(String, nullable=True)

    home_latitude = Column(String, nullable=True)
    home_longitude = Column(String, nullable=True)
    safe_radius_meters = Column(Integer, nullable=True, default=100)

    show_history_on_moderate = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, server_default=func.now())

    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    owner = relationship("User", back_populates="patients")

    persons = relationship(
        "Person",
        back_populates="patient",
        cascade="all, delete-orphan",
    )

    conversations = relationship(
        "Conversation",
        back_populates="patient",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Patient(name={self.name}, user_id={self.owner_id})>"