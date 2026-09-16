from pydantic import BaseModel, Field
from typing import Optional, Annotated
from datetime import datetime
from pydantic.functional_validators import BeforeValidator


def _none_to_false(v):
    return v if v is not None else False


# ── Patient schemas ────────────────────────────────────────────────────────────

class CreatePatientRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, example="Ramesh Kumar")
    age: Optional[int] = Field(None, ge=0, le=120, example=72)
    diagnosis_level: Optional[str] = Field(
        None,
        example="moderate",
        description="mild | moderate | severe"
    )
    home_latitude: Optional[str] = Field(None, example="28.7041")
    home_longitude: Optional[str] = Field(None, example="77.1025")
    safe_radius_meters: Optional[int] = Field(100, example=100)
    show_history_on_moderate: Optional[bool] = Field(False)


class UpdatePatientRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    age: Optional[int] = Field(None, ge=0, le=120)
    diagnosis_level: Optional[str] = Field(None, example="severe")
    home_latitude: Optional[str] = None
    home_longitude: Optional[str] = None
    safe_radius_meters: Optional[int] = None
    show_history_on_moderate: Optional[bool] = None


class PatientResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    age: Optional[int]
    diagnosis_level: Optional[str]
    home_latitude: Optional[str] = None
    home_longitude: Optional[str] = None
    safe_radius_meters: Optional[int] = None
    show_history_on_moderate: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Person schemas ─────────────────────────────────────────────────────────────

class CreatePersonRequest(BaseModel):
    name: Optional[str] = Field(None, example="Rahul Singh")
    relation: Optional[str] = Field(None, example="son")
    is_known: bool = Field(True, example=True)
    is_family: bool = Field(False, example=False)
    family_member_email: Optional[str] = Field(None, example="rahul@gmail.com")


class UpdatePersonRequest(BaseModel):
    name: Optional[str] = Field(None, example="Rahul Singh")
    relation: Optional[str] = Field(None, example="son")
    is_known: Optional[bool] = None
    is_family: Optional[bool] = None
    family_member_email: Optional[str] = None
    pending_verification: Optional[bool] = None
    suggested_name: Optional[str] = None
    suggested_relation: Optional[str] = None


class PersonResponse(BaseModel):
    id: int
    patient_id: int
    name: Optional[str]
    relation: Optional[str]
    is_known: bool
    is_family: Annotated[bool, BeforeValidator(_none_to_false)] = False
    family_member_email: Optional[str] = None
    pending_verification: Annotated[bool, BeforeValidator(_none_to_false)] = False
    suggested_name: Optional[str] = None
    suggested_relation: Optional[str] = None
    first_seen: datetime
    last_seen: datetime
    image_url: Optional[str] = None

    class Config:
        from_attributes = True
