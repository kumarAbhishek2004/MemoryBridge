"""
sms_service.py
--------------
Dispatches instant emergency SMS and WhatsApp notifications using Twilio REST API
(or simulated console logging if credentials are not configured).
"""

import os
import logging
import threading
from datetime import datetime
import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "").strip()
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER", "").strip()
DEFAULT_EMERGENCY_PHONE = os.getenv("DEFAULT_EMERGENCY_PHONE", "").strip()


def _safe_print(msg: str) -> None:
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", errors="replace").decode("ascii"))


def send_sms(to_phone: str, body: str) -> bool:
    """
    Sends an SMS notification to the target phone number.
    Uses Twilio REST API if credentials are provided, or logs simulated dispatch.
    """
    clean_phone = to_phone.strip()
    if not clean_phone:
        return False

    if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
        try:
            resp = requests.post(
                url,
                auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
                data={
                    "From": TWILIO_PHONE_NUMBER,
                    "To": clean_phone,
                    "Body": body,
                },
                timeout=10,
            )
            if resp.status_code in [200, 201]:
                _safe_print(f"[SMS] Emergency SMS successfully dispatched to {clean_phone} (SID: {resp.json().get('sid')})")
                return True
            else:
                _safe_print(f"[SMS Error] Twilio responded with status {resp.status_code}: {resp.text}")
                return False
        except Exception as exc:
            _safe_print(f"[SMS Exception] Failed to send SMS via Twilio to {clean_phone}: {exc}")
            return False
    else:
        _safe_print(f"\n[SIMULATED SMS to {clean_phone}]:\n{body}\n")
        return True


def send_whatsapp(to_phone: str, body: str) -> bool:
    """
    Sends a WhatsApp notification to the target phone number using Twilio's WhatsApp API.
    """
    clean_phone = to_phone.strip()
    if not clean_phone:
        return False

    to_whatsapp = clean_phone if clean_phone.startswith("whatsapp:") else f"whatsapp:{clean_phone}"
    from_whatsapp = (
        TWILIO_WHATSAPP_NUMBER
        if TWILIO_WHATSAPP_NUMBER.startswith("whatsapp:")
        else f"whatsapp:{TWILIO_WHATSAPP_NUMBER}"
    )

    if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_NUMBER:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
        try:
            resp = requests.post(
                url,
                auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
                data={
                    "From": from_whatsapp,
                    "To": to_whatsapp,
                    "Body": body,
                },
                timeout=10,
            )
            if resp.status_code in [200, 201]:
                _safe_print(f"[WhatsApp] Emergency WhatsApp message sent to {clean_phone} (SID: {resp.json().get('sid')})")
                return True
            else:
                _safe_print(f"[WhatsApp Error] Twilio WhatsApp error {resp.status_code}: {resp.text}")
                return False
        except Exception as exc:
            _safe_print(f"[WhatsApp Exception] Failed to send WhatsApp to {clean_phone}: {exc}")
            return False
    else:
        _safe_print(f"\n[SIMULATED WHATSAPP to {clean_phone}]:\n{body}\n")
        return True


def dispatch_emergency_phone_alerts(
    patient_name: str,
    event_title: str,
    event_description: str,
    latitude: float,
    longitude: float,
    distance_meters: float | None = None,
    recipients: list[dict] | None = None,
) -> int:
    """
    Formats an urgent alert and dispatches both SMS and WhatsApp in background threads
    to all registered phone recipients.
    Returns the count of target recipients queued.
    """
    alert_time = datetime.now().strftime("%d %b %Y, %I:%M %p")
    maps_url = f"https://www.google.com/maps?q={latitude:.6f},{longitude:.6f}"
    
    dist_info = ""
    if distance_meters is not None:
        dist_str = f"{int(round(distance_meters))}m" if distance_meters < 1000 else f"{(distance_meters / 1000.0):.2f}km"
        dist_info = f"\nDistance from home: {dist_str}"

    sms_body = (
        f"[ALERT] MEMORYBRIDGE EMERGENCY ALERT\n"
        f"Patient: {patient_name}\n"
        f"Incident: {event_title}\n"
        f"Details: {event_description}{dist_info}\n"
        f"GPS: {latitude:.5f}, {longitude:.5f}\n"
        f"Live Map: {maps_url}\n"
        f"Time: {alert_time}"
    )

    phone_list: list[str] = []
    if recipients:
        for r in recipients:
            ph = r.get("phone") or r.get("family_member_phone") or r.get("emergency_phone")
            if ph and ph.strip() and ph.strip() not in phone_list:
                phone_list.append(ph.strip())

    if not phone_list and DEFAULT_EMERGENCY_PHONE:
        phone_list.append(DEFAULT_EMERGENCY_PHONE)

    if not phone_list:
        _safe_print(f"[Alerts] No phone numbers registered for patient {patient_name} — printed simulated emergency broadcast:")
        _safe_print(f"SMS/WhatsApp Preview:\n{sms_body}")
        return 0

    def _deliver():
        for phone in phone_list:
            send_sms(phone, sms_body)
            send_whatsapp(phone, sms_body)

    threading.Thread(target=_deliver, daemon=True).start()
    return len(phone_list)
