from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from server.config.db import Base

class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)

    patient = relationship("Patient", back_populates="locations")
    
    def __repr__(self):
        return f"<Location(id={self.id}, patient_id={self.patient_id})>"
