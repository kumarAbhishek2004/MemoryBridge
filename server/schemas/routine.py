from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CreateRoutineRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=150, example="Donepezil")
    category: str = Field("medication", example="medication", description="medication | meal | activity | general")
    time: str = Field(..., example="08:30", description="24-hour time HH:MM")
    dosage: Optional[str] = Field(None, example="5mg - 1 tablet")
    instructions: Optional[str] = Field(None, example="Take after breakfast with water")
    days_of_week: Optional[str] = Field("daily", example="daily")
    is_active: Optional[bool] = Field(True)


class UpdateRoutineRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)
    category: Optional[str] = Field(None, description="medication | meal | activity | general")
    time: Optional[str] = Field(None, description="24-hour time HH:MM")
    dosage: Optional[str] = None
    instructions: Optional[str] = None
    days_of_week: Optional[str] = None
    is_active: Optional[bool] = None


class RoutineResponse(BaseModel):
    id: int
    patient_id: int
    title: str
    category: str
    time: str
    dosage: Optional[str] = None
    instructions: Optional[str] = None
    days_of_week: str
    is_active: bool
    last_completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
