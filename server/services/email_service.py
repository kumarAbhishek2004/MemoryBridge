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
