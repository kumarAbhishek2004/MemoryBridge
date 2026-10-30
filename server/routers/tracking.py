import math
import datetime
import threading
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from server.config.db import get_db
from server.models.location import Location
from server.models.patient import Patient
from server.models.person import Person
from server.schemas.location import LocationCreate, LocationResponse
from server.services.email_service import send_geofence_alert

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Tracking"])

# Default fallback constants for Geofencing if patient home is not configured
DEFAULT_SAFE_RADIUS_METERS = 100

# Track alert cooldowns to avoid spamming emails on rapid GPS updates
# patient_id -> last_alert_datetime (cooldown: 10 minutes while continuously outside)
_geofence_alert_cooldowns: dict[int, datetime.datetime] = {}
GEOFENCE_ALERT_COOLDOWN_SECONDS = 600

def haversine(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance in meters between two points."""
    R = 6371000 # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2.0)**2 + math.cos(phi1)*math.cos(phi2) * math.sin(delta_lambda/2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def get_geofence_recipients(patient: Patient, db: Session) -> dict[str, dict]:
    """
    Collect all emergency notification recipients:
    1. Primary caregiver (patient's owner)
    2. All registered family members with email addresses
    """
    recipients: dict[str, dict] = {}

    # 1. Primary caretaker email (patient's owner)
    if patient.owner and patient.owner.email and patient.owner.email.strip():
        em = patient.owner.email.strip().lower()
        recipients[em] = {
            "email": patient.owner.email.strip(),
            "name": patient.owner.name or "Caretaker",
        }

    # 2. Registered family members with emails
    family_members = (
        db.query(Person)
        .filter(
            Person.patient_id == patient.id,
            Person.is_family == True,
            Person.family_member_email != None,
            Person.family_member_email != "",
        )
        .all()
    )

    for member in family_members:
        if member.family_member_email and member.family_member_email.strip():
            em = member.family_member_email.strip().lower()
            if em not in recipients:
                recipients[em] = {
                    "email": member.family_member_email.strip(),
                    "name": member.name or "Family Member",
                }
    return recipients

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
    dist_from_home = 0.0
    safe_radius = DEFAULT_SAFE_RADIUS_METERS

    if patient and patient.home_latitude and patient.home_longitude:
        try:
            home_lat = float(patient.home_latitude)
            home_lon = float(patient.home_longitude)
            safe_radius = patient.safe_radius_meters if patient.safe_radius_meters is not None else DEFAULT_SAFE_RADIUS_METERS
            dist_from_home = haversine(home_lat, home_lon, payload.latitude, payload.longitude)
            is_breached = dist_from_home > safe_radius
        except (ValueError, TypeError):
            pass

    # ── Handle Geofence Breach Email Alerts ────────────────────────────────────
    if is_breached and patient:
        last_alert = _geofence_alert_cooldowns.get(patient.id)
        should_send_alert = last_alert is None or (now - last_alert).total_seconds() >= GEOFENCE_ALERT_COOLDOWN_SECONDS

        if should_send_alert:
            _geofence_alert_cooldowns[patient.id] = now
            recipients = get_geofence_recipients(patient, db)

            if recipients:
                print(f"DEBUG: Geofence breach! Dispatching alert emails to {len(recipients)} recipient(s) for patient {patient.name}")
                for rec in recipients.values():
                    kwargs = dict(
                        to_email=rec["email"],
                        recipient_name=rec["name"],
                        patient_name=patient.name,
                        distance_meters=dist_from_home,
                        safe_radius_meters=float(safe_radius),
                        latitude=payload.latitude,
                        longitude=payload.longitude,
                        is_test=False,
                    )
                    threading.Thread(
                        target=send_geofence_alert,
                        kwargs=kwargs,
                        daemon=True,
                    ).start()
            else:
                print(f"DEBUG: Geofence breach detected for patient {patient.name}, but no caretaker or family emails are registered.")
    elif not is_breached and patient and patient.id in _geofence_alert_cooldowns:
        # Patient is back within safe perimeter — clear cooldown so the next exit will alert immediately
        del _geofence_alert_cooldowns[patient.id]
    
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

@router.post("/tracking/patients/{patient_id}/test-alert")
def trigger_test_geofence_alert(patient_id: int, db: Session = Depends(get_db)):
    """
    Explicitly test the buzzer & dispatch alert emails to both the caregiver
    and all registered family members.
    """
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    recipients = get_geofence_recipients(patient, db)
    if not recipients:
        return {
            "success": False,
            "message": "No registered caregiver or family member emails found for this patient.",
            "recipients": [],
        }

    # Retrieve patient's latest location or fallback coordinates
    latest_loc = (
        db.query(Location)
        .filter(Location.patient_id == patient.id)
        .order_by(Location.timestamp.desc())
        .first()
    )

    try:
        home_lat = float(patient.home_latitude) if patient.home_latitude is not None else None
        home_lng = float(patient.home_longitude) if patient.home_longitude is not None else None
    except (ValueError, TypeError):
        home_lat, home_lng = None, None

    lat = latest_loc.latitude if latest_loc else (home_lat or 31.4685)
    lng = latest_loc.longitude if latest_loc else (home_lng or 76.2708)
    safe_radius = float(patient.safe_radius_meters if patient.safe_radius_meters is not None else DEFAULT_SAFE_RADIUS_METERS)

    # Use actual distance or a simulated 2.5km breach distance for realistic alert preview
    dist_meters = 2500.0
    if home_lat is not None and home_lng is not None and latest_loc:
        calc_dist = haversine(home_lat, home_lng, lat, lng)
        dist_meters = max(calc_dist, safe_radius + 50.0)

    print(f"DEBUG: Dispatching test buzzer alerts to {len(recipients)} recipient(s) for patient {patient.name}: {list(recipients.keys())}")
    for rec in recipients.values():
        kwargs = dict(
            to_email=rec["email"],
            recipient_name=rec["name"],
            patient_name=patient.name,
            distance_meters=dist_meters,
            safe_radius_meters=safe_radius,
            latitude=lat,
            longitude=lng,
            is_test=True,
        )
        threading.Thread(
            target=send_geofence_alert,
            kwargs=kwargs,
            daemon=True,
        ).start()

    return {
        "success": True,
        "message": f"Test alert emails dispatched to {len(recipients)} recipient(s).",
        "recipients": [r["email"] for r in recipients.values()],
    }

@router.get("/tracking/patients/{patient_id}/locations")
def get_patient_path(patient_id: int, db: Session = Depends(get_db)):
    """Fetch chronological path memory."""
    locations = db.query(Location)\
        .filter(Location.patient_id == patient_id)\
        .order_by(Location.timestamp.asc())\
        .all()
    return locations
