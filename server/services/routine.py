from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException

from server.models.patient import Patient
from server.models.routine import RoutineItem
from server.schemas.routine import CreateRoutineRequest, UpdateRoutineRequest


def _get_patient_or_404(patient_id: int, db: Session) -> Patient:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def _assert_owns_patient(patient: Patient, owner_id: int | None) -> None:
    if owner_id is not None and patient.owner_id != owner_id:
        raise HTTPException(status_code=403, detail="Access denied")


def create_routine(
    patient_id: int,
    owner_id: int | None,
    payload: CreateRoutineRequest,
    db: Session,
) -> RoutineItem:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    routine = RoutineItem(
        patient_id=patient_id,
        title=payload.title,
        category=payload.category,
        time=payload.time,
        dosage=payload.dosage,
        instructions=payload.instructions,
        days_of_week=payload.days_of_week or "daily",
        is_active=payload.is_active if payload.is_active is not None else True,
    )
    db.add(routine)
    db.commit()
    db.refresh(routine)
    return routine


def get_routines_for_patient(
    patient_id: int,
    owner_id: int | None,
    db: Session,
) -> list[RoutineItem]:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    return (
        db.query(RoutineItem)
        .filter(RoutineItem.patient_id == patient_id)
        .order_by(RoutineItem.time.asc())
        .all()
    )


def update_routine(
    patient_id: int,
    routine_id: int,
    owner_id: int | None,
    payload: UpdateRoutineRequest,
    db: Session,
) -> RoutineItem:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    routine = db.query(RoutineItem).filter(
        RoutineItem.id == routine_id,
        RoutineItem.patient_id == patient_id,
    ).first()

    if not routine:
        raise HTTPException(status_code=404, detail="Routine item not found")

    if payload.title is not None:
        routine.title = payload.title
    if payload.category is not None:
        routine.category = payload.category
    if payload.time is not None:
        routine.time = payload.time
    if payload.dosage is not None:
        routine.dosage = payload.dosage
    if payload.instructions is not None:
        routine.instructions = payload.instructions
    if payload.days_of_week is not None:
        routine.days_of_week = payload.days_of_week
    if payload.is_active is not None:
        routine.is_active = payload.is_active

    db.commit()
    db.refresh(routine)
    return routine


def delete_routine(
    patient_id: int,
    routine_id: int,
    owner_id: int | None,
    db: Session,
) -> None:
    patient = _get_patient_or_404(patient_id, db)
    _assert_owns_patient(patient, owner_id)

    routine = db.query(RoutineItem).filter(
        RoutineItem.id == routine_id,
        RoutineItem.patient_id == patient_id,
    ).first()

    if not routine:
        raise HTTPException(status_code=404, detail="Routine item not found")

    db.delete(routine)
    db.commit()


def complete_routine(
    patient_id: int,
    routine_id: int,
    db: Session,
) -> RoutineItem:
    _get_patient_or_404(patient_id, db)

    routine = db.query(RoutineItem).filter(
        RoutineItem.id == routine_id,
        RoutineItem.patient_id == patient_id,
    ).first()

    if not routine:
        raise HTTPException(status_code=404, detail="Routine item not found")

    # Toggle completion status
    if routine.last_completed_at:
        routine.last_completed_at = None
    else:
        routine.last_completed_at = datetime.utcnow()

    db.commit()
    db.refresh(routine)
    return routine
