from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from server.config.db import Base


class RoutineItem(Base):
    """
    RoutineItem represents scheduled daily routines for an Alzheimer's patient:
    - Medications (pill name, dosage, instructions)
    - Meals (breakfast, lunch, dinner, snack)
    - Daily Activities & General Routines (walking, doctor visit, drinking water, bedtime)
    """

    __tablename__ = "patient_routines"

    id = Column(Integer, primary_key=True, index=True)

    patient_id = Column(
        Integer,
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(String, nullable=False)
    category = Column(String, nullable=False, default="medication")  # medication | meal | activity | general
    time = Column(String, nullable=False)  # HH:MM format (24-hour e.g. "08:30")
    dosage = Column(String, nullable=True)  # e.g. "5mg", "1 tablet"
    instructions = Column(String, nullable=True)  # e.g. "Take after breakfast with water"
    days_of_week = Column(String, nullable=False, default="daily")  # "daily" or "mon,tue,wed,thu,fri,sat,sun"
    is_active = Column(Boolean, default=True, nullable=False)

    last_completed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )

    patient = relationship("Patient", back_populates="routines")

    def __repr__(self):
        return f"<RoutineItem(id={self.id}, patient_id={self.patient_id}, title='{self.title}', time='{self.time}')>"
