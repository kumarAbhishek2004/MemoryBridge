"""
email_service.py
────────────────
Sends visit-notification emails to family members when a person is
recognised on the patient interface.

Configured via env:
  SMTP_HOST      (default: smtp.gmail.com)
  SMTP_PORT      (default: 587)
  SMTP_USER      your Gmail / SMTP login
  SMTP_PASSWORD  Gmail App Password
  SMTP_FROM      sender address (defaults to SMTP_USER)
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

from server.config.env import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM

logger = logging.getLogger(__name__)


# ── HTML email template ────────────────────────────────────────────────────────

def _build_html(
    visitor_name: str,
    visitor_relation: str,
    patient_name: str,
    visitor_image_url: str | None,
    visited_at: str,
) -> str:
    avatar = (
        f'<img src="{visitor_image_url}" alt="{visitor_name}" '
        f'style="display:block;width:96px;height:96px;border-radius:50%;object-fit:cover;'
        f'border:3px solid #10b981;margin:0 auto 16px;" />'
        if visitor_image_url
        else (
            f'<div style="width:96px;height:96px;border-radius:50%;background:#d1fae5;'
            f'margin:0 auto 16px;border:3px solid #10b981;font-size:36px;font-weight:700;'
            f'color:#059669;text-align:center;line-height:96px;">'
            f'{(visitor_name[0] if visitor_name else "?").upper()}</div>'
        )
    )

    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Visit Notification – MemoryBridge</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#059669,#10b981);
                       padding:32px 40px;text-align:center;">
              <p style="margin:0 0 4px;color:#d1fae5;font-size:12px;
                        font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">
                MemoryBridge · Visit Alert
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">
                Someone visited {patient_name}!
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;text-align:center;">
              {avatar}

              <h2 style="margin:0 0 4px;font-size:24px;color:#111827;font-weight:700;">
                {visitor_name}
              </h2>
              <span style="display:inline-block;margin-bottom:24px;padding:4px 14px;
                           background:#d1fae5;border-radius:999px;font-size:13px;
                           font-weight:600;color:#059669;text-transform:capitalize;">
                {visitor_relation}
              </span>

              <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
                We detected <strong>{visitor_name}</strong> visiting
                <strong>{patient_name}</strong>.
              </p>
              <p style="margin:0;font-size:13px;color:#6b7280;">
                🕐 {visited_at}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;
                       border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                This notification was sent automatically by
                <strong style="color:#059669;">MemoryBridge</strong>.<br/>
                If this visit was unexpected, please check in with the care team.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


# ── Public API ─────────────────────────────────────────────────────────────────

def _build_geofence_alert_html(
    recipient_name: str,
    patient_name: str,
    distance_meters: float,
    safe_radius_meters: float,
    latitude: float,
    longitude: float,
    alerted_at: str,
    is_test: bool = False,
) -> str:
    maps_url = f"https://www.google.com/maps?q={latitude:.6f},{longitude:.6f}"
    dist_str = f"{int(round(distance_meters))} meters" if distance_meters < 1000 else f"{(distance_meters / 1000.0):.2f} km"
    radius_str = f"{int(round(safe_radius_meters))} meters" if safe_radius_meters < 1000 else f"{(safe_radius_meters / 1000.0):.2f} km"

    header_tag = "🚨 MemoryBridge · Safety Perimeter Buzzer Test" if is_test else "🚨 MemoryBridge · Safety Perimeter Alert"
    header_title = f"[TEST ALERT] Perimeter Buzzer Tested for {patient_name}" if is_test else f"{patient_name} is outside their safe area!"
    lead_paragraph = (
        f"This is a <strong>test notification</strong> confirming that the safe perimeter buzzer and emergency email alert system is functioning properly for <strong>{patient_name}</strong>."
        if is_test
        else f"MemoryBridge detected that <strong>{patient_name}</strong> is currently located outside their designated home safe zone."
    )

    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Geofence Safety Alert – MemoryBridge</title>
</head>
<body style="margin:0;padding:0;background:#fef2f2;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 6px 24px rgba(220,38,38,0.12);border:1px solid #fee2e2;">

          <!-- Header Banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#dc2626,#b91c1c);
                       padding:32px 36px;text-align:center;">
              <p style="margin:0 0 6px;color:#fecaca;font-size:12px;
                        font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">
                {header_tag}
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.3;">
                {header_title}
              </h1>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1f2937;line-height:1.5;">
                Hello <strong>{recipient_name}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
                {lead_paragraph}
              </p>

              <!-- Alert Metrics Card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="4" cellspacing="0">
                      <tr>
                        <td width="42%" style="font-size:13px;color:#991b1b;font-weight:600;">Distance from Home:</td>
                        <td style="font-size:15px;color:#b91c1c;font-weight:700;">{dist_str}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#991b1b;font-weight:600;">Configured Safe Radius:</td>
                        <td style="font-size:14px;color:#374151;">{radius_str}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#991b1b;font-weight:600;">Detected Time:</td>
                        <td style="font-size:14px;color:#374151;">{alerted_at}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#991b1b;font-weight:600;">GPS Coordinates:</td>
                        <td style="font-size:13px;color:#4b5563;font-family:monospace;">{latitude:.5f}, {longitude:.5f}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Call to Action Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="{maps_url}" target="_blank"
                   style="display:inline-block;background:#dc2626;color:#ffffff;
                          padding:14px 28px;border-radius:8px;font-size:15px;
                          font-weight:700;text-decoration:none;box-shadow:0 4px 12px rgba(220,38,38,0.25);">
                  📍 View Location on Google Maps
                </a>
              </div>

              <!-- Recommendation Note -->
              <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;">
                <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                  <strong>Status:</strong> {"Test verified — Buzzer alert sounded and notification sent to caretaker and family." if is_test else f"Please check in on {patient_name} or reach out to the caregiver to confirm their safety."}
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 36px;text-align:center;
                       border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
                This urgent alert was dispatched automatically by <strong style="color:#dc2626;">MemoryBridge Safety Monitoring</strong>.<br/>
                Coordinates are updated live via the patient's companion device.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def send_geofence_alert(
    to_email: str,
    recipient_name: str,
    patient_name: str,
    distance_meters: float,
    safe_radius_meters: float,
    latitude: float,
    longitude: float,
    is_test: bool = False,
) -> bool:
    """
    Send an emergency geofence breach alert email to a caretaker or family member.
    Returns True on success, False on failure.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        print("DEBUG: SMTP_USER / SMTP_PASSWORD not configured in .env — skipping geofence email alert.")
        return False

    alerted_at = datetime.now().strftime("%d %b %Y, %I:%M %p")

    subject_prefix = "🚨 [TEST ALERT] Perimeter Breach Buzzer Tested for" if is_test else f"🚨 URGENT: {patient_name} is outside their safe area"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{subject_prefix} {patient_name} – MemoryBridge" if is_test else f"{subject_prefix} – MemoryBridge"
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email

    html = _build_geofence_alert_html(
        recipient_name=recipient_name,
        patient_name=patient_name,
        distance_meters=distance_meters,
        safe_radius_meters=safe_radius_meters,
        latitude=latitude,
        longitude=longitude,
        alerted_at=alerted_at,
        is_test=is_test,
    )
    msg.attach(MIMEText(html, "html"))

    try:
        print(f"DEBUG: Connecting to SMTP server {SMTP_HOST}:{SMTP_PORT} as {SMTP_USER} for {'test ' if is_test else ''}geofence alert...")
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(msg["From"], [to_email], msg.as_string())
        print(f"DEBUG: Geofence {'test ' if is_test else ''}breach alert successfully sent to {to_email}!")
        return True
    except Exception as exc:
        print(f"DEBUG: Failed to send geofence {'test ' if is_test else ''}breach alert to {to_email}: {exc}")
        return False


def send_visit_notification(
    to_email: str,
    visitor_name: str,
    visitor_relation: str,
    patient_name: str,
    visitor_image_url: str | None = None,
) -> bool:
    """
    Send a visit-notification email.  Returns True on success, False on failure.
    Errors are logged but never raised — notification failure must not break the
    recognition flow.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        print("DEBUG: SMTP_USER / SMTP_PASSWORD not configured in .env — skipping email notification.")
        return False

    visited_at = datetime.now().strftime("%d %b %Y, %I:%M %p")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🏥 {visitor_name} just visited {patient_name} – MemoryBridge"
    msg["From"]    = SMTP_FROM or SMTP_USER
    msg["To"]      = to_email

    html = _build_html(
        visitor_name=visitor_name,
        visitor_relation=visitor_relation,
        patient_name=patient_name,
        visitor_image_url=visitor_image_url,
        visited_at=visited_at,
    )
    msg.attach(MIMEText(html, "html"))

    try:
        print(f"DEBUG: Connecting to SMTP server {SMTP_HOST}:{SMTP_PORT} as {SMTP_USER}...")
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(msg["From"], [to_email], msg.as_string())
        print(f"DEBUG: Visit notification successfully sent to {to_email}!")
        return True
    except Exception as exc:
        print(f"DEBUG: Failed to send visit notification to {to_email}: {exc}")
        return False


def send_sos_alert(
    to_email: str,
    recipient_name: str,
    patient_name: str,
    latitude: float,
    longitude: float,
) -> bool:
    """
    Send an immediate SOS Emergency Alert email to a caregiver or family member.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        return False

    alerted_at = datetime.now().strftime("%d %b %Y, %I:%M %p")
    maps_url = f"https://www.google.com/maps?q={latitude:.6f},{longitude:.6f}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🆘 URGENT SOS: {patient_name} pressed Emergency Help – MemoryBridge"
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#fef2f2;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(220,38,38,0.15);border:1px solid #fee2e2;">
        <tr>
          <td style="background:linear-gradient(135deg,#b91c1c,#7f1d1d);padding:32px 36px;text-align:center;">
            <p style="margin:0 0 6px;color:#fecaca;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">🚨 One-Touch Emergency SOS</p>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;">{patient_name} requested immediate help!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1f2937;">Hello <strong>{recipient_name}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
              <strong>{patient_name}</strong> pressed the <strong>One-Touch Emergency SOS Help Button</strong> on their MemoryBridge companion. Immediate attention is required.
            </p>
            <table width="100%" cellpadding="6" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:24px;padding:12px 16px;">
              <tr><td style="font-size:13px;color:#991b1b;font-weight:600;">Time:</td><td style="font-size:14px;color:#1f2937;">{alerted_at}</td></tr>
              <tr><td style="font-size:13px;color:#991b1b;font-weight:600;">GPS Location:</td><td style="font-size:13px;color:#374151;font-family:monospace;">{latitude:.5f}, {longitude:.5f}</td></tr>
            </table>
            <div style="text-align:center;margin-bottom:24px;">
              <a href="{maps_url}" target="_blank" style="display:inline-block;background:#dc2626;color:#ffffff;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">📍 Open Live Map Location</a>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo(); server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(msg["From"], [to_email], msg.as_string())
        print(f"DEBUG: SOS Emergency alert sent to {to_email}!")
        return True
    except Exception as exc:
        print(f"DEBUG: Failed to send SOS alert to {to_email}: {exc}")
        return False


def send_fall_alert(
    to_email: str,
    recipient_name: str,
    patient_name: str,
    latitude: float,
    longitude: float,
    response_timeout_seconds: int = 20,
) -> bool:
    """
    Send an urgent Fall Detection Alert email to a caregiver or family member.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        return False

    alerted_at = datetime.now().strftime("%d %b %Y, %I:%M %p")
    maps_url = f"https://www.google.com/maps?q={latitude:.6f},{longitude:.6f}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"⚠️ CRITICAL: Potential Fall Detected for {patient_name} – MemoryBridge"
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#fff7ed;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(234,88,12,0.15);border:1px solid #ffedd5;">
        <tr>
          <td style="background:linear-gradient(135deg,#ea580c,#c2410c);padding:32px 36px;text-align:center;">
            <p style="margin:0 0 6px;color:#ffedd5;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">⚠️ Sudden Fall & Inactivity Detected</p>
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;">Fall alert triggered for {patient_name}!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1f2937;">Hello <strong>{recipient_name}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
              MemoryBridge sensors detected a <strong>sudden impact / rapid downward drop</strong> followed by immobility for <strong>{patient_name}</strong>. The patient did not dismiss the on-screen safety check within {response_timeout_seconds} seconds.
            </p>
            <table width="100%" cellpadding="6" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;margin-bottom:24px;padding:12px 16px;">
              <tr><td style="font-size:13px;color:#c2410c;font-weight:600;">Incident Time:</td><td style="font-size:14px;color:#1f2937;">{alerted_at}</td></tr>
              <tr><td style="font-size:13px;color:#c2410c;font-weight:600;">Unresponsive Duration:</td><td style="font-size:14px;color:#1f2937;">{response_timeout_seconds} seconds</td></tr>
              <tr><td style="font-size:13px;color:#c2410c;font-weight:600;">GPS Coordinates:</td><td style="font-size:13px;color:#374151;font-family:monospace;">{latitude:.5f}, {longitude:.5f}</td></tr>
            </table>
            <div style="text-align:center;margin-bottom:24px;">
              <a href="{maps_url}" target="_blank" style="display:inline-block;background:#ea580c;color:#ffffff;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">📍 Check Location on Google Maps</a>
            </div>
            <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;">
              <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.5;">
                <strong>Recommended Action:</strong> Please contact {patient_name} or visit their location immediately to verify their physical condition.
              </p>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo(); server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(msg["From"], [to_email], msg.as_string())
        print(f"DEBUG: Fall alert sent to {to_email}!")
        return True
    except Exception as exc:
        print(f"DEBUG: Failed to send fall alert to {to_email}: {exc}")
        return False
