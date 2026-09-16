from sqlalchemy.orm import Session
from fastapi import HTTPException

from server.models.patient import Patient
from server.models.person import Person
from server.models.conversation import Conversation
from server.schemas.patient import (
    CreatePatientRequest,
    UpdatePatientRequest,
    CreatePersonRequest,
    UpdatePersonRequest,
)


# ── helpers ────────────────────────────────────────────────────────────────────

def _get_patient_or_404(patient_id: int, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def _assert_owns_patient(patient: Patient, owner_id: int) -> None:
    """Make sure the logged-in user actually owns this patient profile."""
    if patient.owner_id != owner_id:
        raise HTTPException(status_code=403, detail="Access denied")


def _get_person_or_404(person_id: int, db: Session) -> Person:
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


# ── patient service functions ──────────────────────────────────────────────────

def createPatient(db: Session, payload: CreatePatientRequest, owner_id: int) -> Patient:
    patient = Patient(
        name=payload.name,
        owner_id=owner_id,
        age=payload.age,
        diagnosis_level=payload.diagnosis_level,
        home_latitude=payload.home_latitude,
        home_longitude=payload.home_longitude,
        safe_radius_meters=payload.safe_radius_meters,
        show_history_on_moderate=payload.show_history_on_moderate or False,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


def getMyPatients(owner_id: int, db: Session) -> list[Patient]:
    return db.query(Patient).filter(Patient.owner_id == owner_id).all()


def getPatientById(patient_id: int, owner_id: int, db: Session) -> Patient:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)
    return patient


def updatePatient(
    patient_id: int,
    owner_id: int,
    payload: UpdatePatientRequest,
    db: Session,
) -> Patient:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    if payload.name is not None:
        patient.name = payload.name
    if payload.age is not None:
        patient.age = payload.age
    if payload.diagnosis_level is not None:
        patient.diagnosis_level = payload.diagnosis_level
    if payload.home_latitude is not None:
        patient.home_latitude = payload.home_latitude
    if payload.home_longitude is not None:
        patient.home_longitude = payload.home_longitude
    if payload.safe_radius_meters is not None:
        patient.safe_radius_meters = payload.safe_radius_meters
    if payload.show_history_on_moderate is not None:
        patient.show_history_on_moderate = payload.show_history_on_moderate

    db.commit()
    db.refresh(patient)
    return patient


def deletePatient(patient_id: int, owner_id: int, db: Session) -> None:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)
    db.delete(patient)
    db.commit()


# ── person service functions ───────────────────────────────────────────────────

def createPerson(
    patient_id: int,
    owner_id: int,
    payload: CreatePersonRequest,
    db: Session,
) -> Person:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    person = Person(
        patient_id=patient_id,
        name=payload.name,
        relation=payload.relation,
        is_known=payload.is_known,
        is_family=payload.is_family,
        family_member_email=payload.family_member_email,
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


def getPersonsForPatient(patient_id: int, owner_id: int, db: Session) -> list[Person]:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)
    return db.query(Person).filter(Person.patient_id == patient_id).all()


def getPersonById(
    patient_id: int,
    person_id: int,
    owner_id: int,
    db: Session,
) -> Person:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    person = _get_person_or_404(person_id, db)
    if person.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Person not found for this patient")
    return person


def updatePerson(
    patient_id: int,
    person_id: int,
    owner_id: int,
    payload: UpdatePersonRequest,
    db: Session,
) -> Person:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    person = _get_person_or_404(person_id, db)
    if person.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Person not found for this patient")

    if payload.name is not None:
        person.name = payload.name
    if payload.relation is not None:
        person.relation = payload.relation
    if payload.is_known is not None:
        person.is_known = payload.is_known
    if payload.is_family is not None:
        person.is_family = payload.is_family
    if payload.family_member_email is not None:
        person.family_member_email = payload.family_member_email
    if payload.pending_verification is not None:
        person.pending_verification = payload.pending_verification
    if payload.suggested_name is not None:
        person.suggested_name = payload.suggested_name
    if payload.suggested_relation is not None:
        person.suggested_relation = payload.suggested_relation

    db.commit()
    db.refresh(person)
    return person


def deletePerson(
    patient_id: int,
    person_id: int,
    owner_id: int,
    db: Session,
) -> None:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    person = _get_person_or_404(person_id, db)
    if person.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Person not found for this patient")

    db.query(Conversation).filter(Conversation.person_id == person_id).update(
        {Conversation.person_id: None}
    )
    db.delete(person)
    db.commit()
