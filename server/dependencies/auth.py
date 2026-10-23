from fastapi import HTTPException, Request
import jwt
from server.config.env import SECRET_KEY, ALGORITHM


def verify_token(request: Request) -> dict:
    """
    Dependency: verifies the caregiver JWT from cookie or Authorization header.
    Returns the decoded payload dict.
    """
    token = request.cookies.get("access-token") or request.cookies.get("patient-token")

    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(status_code=401, detail="No token provided")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def verify_patient_token(request: Request) -> dict:
    """
    Dependency: verifies the patient-scoped JWT from the patient-token cookie
    or Authorization header (sent as Bearer by the frontend patient UI).

    Returns the decoded payload which contains:
      - patient_id
      - patient_name
      - caregiver_id
      - role = "patient_viewer"
    """
    token = request.cookies.get("patient-token")

    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(status_code=401, detail="No patient session token provided")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Patient session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid patient session token")

    if payload.get("role") != "patient_viewer":
        raise HTTPException(status_code=403, detail="Not a patient session token")

    return payload
