from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.config.db import get_db
from server.core.api_response import ApiResponse
from server.dependencies.auth import verify_token
from server.schemas.routine import (
    CreateRoutineRequest,
    UpdateRoutineRequest,
    RoutineResponse,
)
from server.services.routine import (
    create_routine,
    get_routines_for_patient,
    update_routine,
    delete_routine,
    complete_routine,
)

router = APIRouter(tags=["Routines & Medications"])


def _extract_access_context(patient_id: int, token_data: dict) -> int | None:
    if token_data.get("role") == "patient_viewer":
        if token_data.get("patient_id") != patient_id:
            raise HTTPException(status_code=403, detail="Patient session mismatch")
        return None
    return token_data.get("user_id")


@router.post("/patients/{patient_id}/routines", response_model=ApiResponse)
def add_routine(
    patient_id: int,
    payload: CreateRoutineRequest,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """Caregiver creates a scheduled routine/medication for a patient."""
    owner_id = _extract_access_context(patient_id, token_data)
    routine = create_routine(patient_id, owner_id, payload, db)
    return ApiResponse(
        success=True,
        message="Routine item created successfully",
        data=RoutineResponse.model_validate(routine).model_dump(),
    )


@router.get("/patients/{patient_id}/routines", response_model=ApiResponse)
def list_routines(
    patient_id: int,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """Get all routine and medication schedules for a patient."""
    owner_id = _extract_access_context(patient_id, token_data)
    routines = get_routines_for_patient(patient_id, owner_id, db)
    return ApiResponse(
        success=True,
        message="Routines fetched successfully",
        data=[RoutineResponse.model_validate(r).model_dump() for r in routines],
    )


@router.patch("/patients/{patient_id}/routines/{routine_id}", response_model=ApiResponse)
def modify_routine(
    patient_id: int,
    routine_id: int,
    payload: UpdateRoutineRequest,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """Caregiver updates a routine/medication item."""
    owner_id = _extract_access_context(patient_id, token_data)
    routine = update_routine(patient_id, routine_id, owner_id, payload, db)
    return ApiResponse(
        success=True,
        message="Routine item updated successfully",
        data=RoutineResponse.model_validate(routine).model_dump(),
    )


@router.delete("/patients/{patient_id}/routines/{routine_id}", response_model=ApiResponse)
def remove_routine(
    patient_id: int,
    routine_id: int,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """Caregiver deletes a routine/medication item."""
    owner_id = _extract_access_context(patient_id, token_data)
    delete_routine(patient_id, routine_id, owner_id, db)
    return ApiResponse(
        success=True,
        message="Routine item deleted successfully",
    )


@router.post("/patients/{patient_id}/routines/{routine_id}/complete", response_model=ApiResponse)
def mark_routine_completed(
    patient_id: int,
    routine_id: int,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """Mark a routine/medication item as completed for today (usable by patient or caregiver)."""
    _extract_access_context(patient_id, token_data)
    routine = complete_routine(patient_id, routine_id, db)
    return ApiResponse(
        success=True,
        message="Routine marked as completed",
        data=RoutineResponse.model_validate(routine).model_dump(),
    )
