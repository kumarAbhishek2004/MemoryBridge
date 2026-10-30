import math
import datetime
import threading
import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from server.config.db import get_db
from server.models.location import Location
from server.models.patient import Patient
from server.models.person import Person
from server.schemas.location import LocationCreate, LocationResponse
from server.services.email_service import (
    send_geofence_alert,
    send_sos_alert,
    send_fall_alert,
)
from server.services.sms_service import dispatch_emergency_phone_alerts

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
    2. All registered family members with email or phone addresses
    """
    recipients: dict[str, dict] = {}

    # 1. Primary caretaker (patient's owner)
    if patient.owner and patient.owner.email and patient.owner.email.strip():
        em = patient.owner.email.strip().lower()
        recipients[em] = {
            "email": patient.owner.email.strip(),
            "name": patient.owner.name or "Caretaker",
            "phone": (patient.emergency_phone or "").strip(),
        }

    # 2. Registered family members
    family_members = (
        db.query(Person)
        .filter(
            Person.patient_id == patient.id,
            Person.is_family == True,
        )
        .all()
    )

    for member in family_members:
        em = (member.family_member_email or "").strip().lower()
        ph = (member.family_member_phone or "").strip()
        if em or ph:
            key = em if em else f"phone_{ph}_{member.id}"
            if key not in recipients:
                recipients[key] = {
                    "email": member.family_member_email.strip() if member.family_member_email else "",
                    "name": member.name or "Family Member",
                    "phone": ph,
                }
    return recipients

class CrisisPayload(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    details: str | None = None

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
                print(f"DEBUG: Geofence breach! Dispatching alert emails & SMS/WhatsApp to {len(recipients)} recipient(s) for patient {patient.name}")
                for rec in recipients.values():
                    if rec.get("email"):
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

                # Dispatch Instant SMS & WhatsApp notifications
                dispatch_emergency_phone_alerts(
                    patient_name=patient.name,
                    event_title="Safe Perimeter Breached",
                    event_description=f"Patient moved {dist_from_home:.0f}m from home (safe zone: {safe_radius}m).",
                    latitude=payload.latitude,
                    longitude=payload.longitude,
                    distance_meters=dist_from_home,
                    recipients=list(recipients.values()),
                )
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
        if rec.get("email"):
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

    # Dispatch SMS & WhatsApp test alert
    sms_count = dispatch_emergency_phone_alerts(
        patient_name=patient.name,
        event_title="Perimeter Buzzer Test Alert",
        event_description="Emergency buzzer test alert was triggered.",
        latitude=lat,
        longitude=lng,
        distance_meters=dist_meters,
        recipients=list(recipients.values()),
    )

    return {
        "success": True,
        "message": f"Test alerts dispatched to {len(recipients)} recipient(s) (Email, SMS & WhatsApp).",
        "recipients": [r["email"] for r in recipients.values() if r.get("email")],
        "phone_recipients_count": sms_count,
    }

@router.post("/tracking/patients/{patient_id}/sos")
def trigger_sos_alert(
    patient_id: int,
    payload: CrisisPayload = None,
    db: Session = Depends(get_db),
):
    """
    One-Touch Emergency SOS trigger:
    Immediately broadcasts urgent alerts via Email, SMS, and WhatsApp
    with live GPS coordinates to the caregiver and all registered family members.
    """
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    recipients = get_geofence_recipients(patient, db)

    latest_loc = (
        db.query(Location)
        .filter(Location.patient_id == patient.id)
        .order_by(Location.timestamp.desc())
        .first()
    )

    lat = (
        payload.latitude
        if payload and payload.latitude is not None
        else (latest_loc.latitude if latest_loc else (float(patient.home_latitude) if patient.home_latitude else 31.4685))
    )
    lng = (
        payload.longitude
        if payload and payload.longitude is not None
        else (latest_loc.longitude if latest_loc else (float(patient.home_longitude) if patient.home_longitude else 76.2708))
    )

    # Record emergency location point in database
    now = datetime.datetime.utcnow()
    emergency_loc = Location(
        patient_id=patient.id,
        latitude=lat,
        longitude=lng,
        timestamp=now,
    )
    db.add(emergency_loc)
    db.commit()

    # 1. Dispatch Email alerts to all recipients
    for rec in recipients.values():
        if rec.get("email"):
            threading.Thread(
                target=send_sos_alert,
                kwargs=dict(
                    to_email=rec["email"],
                    recipient_name=rec["name"],
                    patient_name=patient.name,
                    latitude=lat,
                    longitude=lng,
                ),
                daemon=True,
            ).start()

    # 2. Dispatch SMS and WhatsApp emergency alerts
    sms_count = dispatch_emergency_phone_alerts(
        patient_name=patient.name,
        event_title="ONE-TOUCH EMERGENCY SOS PRESSED",
        event_description="Patient pressed the Emergency Help Button requesting immediate assistance.",
        latitude=lat,
        longitude=lng,
        recipients=list(recipients.values()),
    )

    print(f"DEBUG: Emergency SOS broadcasted for {patient.name} to {len(recipients)} recipients ({sms_count} phone alerts)")
    return {
        "success": True,
        "message": f"Emergency SOS sent to {len(recipients)} recipient(s) via Email, SMS & WhatsApp.",
        "latitude": lat,
        "longitude": lng,
        "sms_count": sms_count,
    }

@router.post("/tracking/patients/{patient_id}/fall-detected")
def trigger_fall_alert(
    patient_id: int,
    payload: CrisisPayload = None,
    db: Session = Depends(get_db),
):
    """
    Sudden Fall & Inactivity Alert trigger:
    Broadcasts urgent fall notification via Email, SMS, and WhatsApp
    when a sudden impact/drop is detected and unconfirmed by the patient.
    """
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    recipients = get_geofence_recipients(patient, db)

    latest_loc = (
        db.query(Location)
        .filter(Location.patient_id == patient.id)
        .order_by(Location.timestamp.desc())
        .first()
    )

    lat = (
        payload.latitude
        if payload and payload.latitude is not None
        else (latest_loc.latitude if latest_loc else (float(patient.home_latitude) if patient.home_latitude else 31.4685))
    )
    lng = (
        payload.longitude
        if payload and payload.longitude is not None
        else (latest_loc.longitude if latest_loc else (float(patient.home_longitude) if patient.home_longitude else 76.2708))
    )

    # 1. Dispatch Email alerts
    for rec in recipients.values():
        if rec.get("email"):
            threading.Thread(
                target=send_fall_alert,
                kwargs=dict(
                    to_email=rec["email"],
                    recipient_name=rec["name"],
                    patient_name=patient.name,
                    latitude=lat,
                    longitude=lng,
                    response_timeout_seconds=20,
                ),
                daemon=True,
            ).start()

    # 2. Dispatch SMS and WhatsApp emergency alerts
    sms_count = dispatch_emergency_phone_alerts(
        patient_name=patient.name,
        event_title="CRITICAL: POTENTIAL FALL DETECTED",
        event_description="Sudden drop/impact detected; patient did not respond to safety check within 20s.",
        latitude=lat,
        longitude=lng,
        recipients=list(recipients.values()),
    )

    print(f"DEBUG: Fall detection alert broadcasted for {patient.name} ({sms_count} phone alerts)")
    return {
        "success": True,
        "message": f"Fall detection alert sent to {len(recipients)} recipient(s) via Email, SMS & WhatsApp.",
        "latitude": lat,
        "longitude": lng,
        "sms_count": sms_count,
    }

@router.get("/tracking/patients/{patient_id}/locations")
def get_patient_path(patient_id: int, db: Session = Depends(get_db)):
    """Fetch chronological path memory."""
    locations = db.query(Location)\
        .filter(Location.patient_id == patient_id)\
        .order_by(Location.timestamp.asc())\
        .all()
    return locations
