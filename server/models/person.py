from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from server.config.db import Base
from pgvector.sqlalchemy import Vector


class Person(Base):

    """
    Person represents an individual recognized by the system.

    Relationship:
    - One Patient can have many Persons around them.
    - One Person can have many FaceEmbeddings.
    Important:
    A Person can be either a KnownPerson or an UnknownFace.
    - KnownPerson: someone the caregiver has identified (e.g. "Alice, daughter")
    - UnknownFace: someone the system has seen but not identified (e.g. "Unknown #5")
    This allows the system to track and recognize faces even if they haven't been identified yet.
    Once a caregiver identifies an UnknownFace, it can be converted to a KnownPerson.
    """
    __tablename__ = "persons"

    id = Column(Integer, primary_key=True)

    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)

    name = Column(String, nullable=True)
    relation = Column(String, nullable=True)

    is_known = Column(Boolean, default=False)
    is_family = Column(Boolean, default=False)  # caregiver-designated family member
    family_member_email = Column(String, nullable=True)  # email to notify on visit
    family_member_phone = Column(String, nullable=True)  # phone for SMS / WhatsApp alerts
    image_url = Column(String, nullable=True)
    pending_verification = Column(Boolean, default=False)  # patient suggested name/relation, awaiting caregiver approval
    suggested_name = Column(String, nullable=True)
    suggested_relation = Column(String, nullable=True)

    first_seen = Column(DateTime, server_default=func.now())
    last_seen = Column(DateTime, server_default=func.now())

    patient = relationship("Patient", back_populates="persons")

    embeddings = relationship(
        "FaceEmbedding",
        back_populates="person",
        cascade="all, delete-orphan"
    )
    def __repr__(self):
        return f"Person(id={self.id}, patient_id={self.patient_id}, name={self.name}, relation={self.relation}, is_known={self.is_known}, first_seen={self.first_seen}, last_seen={self.last_seen})"



class FaceEmbedding(Base):
    """
    FaceEmbedding stores mathematical face vectors for recognition.

    Each embedding is a 512-dimensional vector generated from a face image.

    Why separate table?
    Because one person should have multiple embeddings:
    - front face
    - left angle
    - right angle
    - different lighting

    This improves recognition accuracy.

    Relationship:
    Many embeddings belong to one Person.
    """

    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True)

    person_id = Column(Integer, ForeignKey("persons.id"), nullable=False)

    embedding = Column(Vector(512), nullable=False)

    person = relationship("Person", back_populates="embeddings")

    def __repr__(self):
        return f"FaceEmbedding(id={self.id}, person_id={self.person_id})"