import math
import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from server.config.db import get_db
from server.models.location import Location
from server.models.patient import Patient
from server.schemas.location import LocationCreate, LocationResponse

router = APIRouter(tags=["Tracking"])

# Default fallback constants for Geofencing if patient home is not configured
DEFAULT_SAFE_RADIUS_METERS = 100

def haversine(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance in meters between two points."""
    R = 6371000 # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2.0)**2 + math.cos(phi1)*math.cos(phi2) * math.sin(delta_lambda/2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

@router.post("/tracking/locations", response_model=LocationResponse)
def record_location(payload: LocationCreate, db: Session = Depends(get_db)):
    now = datetime.datetime.utcnow()
    
    # Find last known location to calculate speed
    last_loc = db.query(Location)\
        .filter(Location.patient_id == payload.patient_id)\
        .order_by(Location.timestamp.desc())\
        .first()
    
    speed_mps = 0.0
    if last_loc:
        distance = haversine(last_loc.latitude, last_loc.longitude, payload.latitude, payload.longitude)
        time_diff = (now - last_loc.timestamp).total_seconds()
        if time_diff > 0:
            speed_mps = distance / time_diff # Speed in Meters per second
            
    # Calculate Distance from Home Geofence using patient profile
    patient = db.get(Patient, payload.patient_id)
    is_breached = False
    if patient and patient.home_latitude and patient.home_longitude:
        try:
            home_lat = float(patient.home_latitude)
            home_lon = float(patient.home_longitude)
            safe_radius = patient.safe_radius_meters if patient.safe_radius_meters is not None else DEFAULT_SAFE_RADIUS_METERS
            dist_from_home = haversine(home_lat, home_lon, payload.latitude, payload.longitude)
            is_breached = dist_from_home > safe_radius
        except (ValueError, TypeError):
            pass
    
    new_loc = Location(
        patient_id=payload.patient_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        timestamp=now
    )
    db.add(new_loc)
    db.commit()
    db.refresh(new_loc)
    
    # Return calculated data alongside db model 
    return LocationResponse(
        id=new_loc.id,
        patient_id=new_loc.patient_id,
        latitude=new_loc.latitude,
        longitude=new_loc.longitude,
        timestamp=new_loc.timestamp,
        speed_mps=speed_mps,
        geofence_alert=is_breached
    )

@router.get("/tracking/patients/{patient_id}/locations")
def get_patient_path(patient_id: int, db: Session = Depends(get_db)):
    """Fetch chronological path memory."""
    locations = db.query(Location)\
        .filter(Location.patient_id == patient_id)\
        .order_by(Location.timestamp.asc())\
        .all()
    return locations
