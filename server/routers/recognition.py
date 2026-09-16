from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
import threading
import logging

logger = logging.getLogger(__name__)

from server.config.db import get_db
from server.core.api_error import ApiError
from server.core.api_response import ApiResponse
from server.schemas.face import StoreFaceResponse, MatchFaceResponse
from server.services import face_service
from server.services.email_service import send_visit_notification
from server.dependencies.auth import verify_token
from server.dependencies.uploadFile import upload_file
from server.models.person import Person
from server.models.patient import Patient
from server.config.db import SessionLocal

router = APIRouter(prefix="/recognition", tags=["Face Recognition"])

# In-memory dictionary to track background job statuses
# Key: person_id, Value: {"status": "processing" | "completed" | "error", "error": None | "msg"}
_face_jobs = {}

def process_face_embeddings(person_id: int, image_bytes: bytes):
    db: Session = SessionLocal()
    try:
        from server.services.face_service import store_face_embeddings_for_person
        store_face_embeddings_for_person(db, person_id, image_bytes)
        _face_jobs[person_id] = {"status": "completed"}
    except ValueError as e:
        _face_jobs[person_id] = {"status": "error", "error": str(e)}
        try:
            person = db.query(Person).filter(Person.id == person_id).first()
            if person:
                db.delete(person)
                db.commit()
        except Exception as cleanup_err:
            logger.error(f"Failed to cleanup person after embedding error: {cleanup_err}")
    except Exception as e:
        logger.error(f"Background embedding failed: {e}")
        _face_jobs[person_id] = {"status": "error", "error": "Internal processing error"}
    finally:
        db.close()



@router.post("/store_known_face", response_model=StoreFaceResponse)
async def store_face(
    background_tasks: BackgroundTasks,
    patient_id: int = Form(..., description="ID of the patient this person belongs to"),
    name: str = Form(..., description="Full name of the person, e.g. 'Rahul Singh'"),
    relation: str = Form(..., description="Relation to patient, e.g. 'son'"),
    file: UploadFile = File(..., description="Photo of the person (JPEG/PNG)"),
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    image_bytes = await file.read()

    # Upload the image to Cloudinary (fast)
    image_url = upload_file(image_bytes, folder=f"known_faces/{patient_id}")

    # Create the Person row without embeddings yet (fast)
    person = Person(
        patient_id=patient_id,
        name=name,
        relation=relation,
        is_known=True,
        image_url=image_url,
    )
    db.add(person)
    db.commit()
    db.refresh(person)

    # Mark job as processing and start background task
    _face_jobs[person.id] = {"status": "processing"}
    background_tasks.add_task(process_face_embeddings, person.id, image_bytes)

    return StoreFaceResponse(
        success=True,
        message=f"Registered '{name}' ({relation}). Embedding is being generated in the background.",
        data={
            "person_id":        person.id,
            "name":             person.name,
            "relation":         person.relation,
            "is_known":         person.is_known,
            "image_url":        person.image_url,
            "embeddings_stored": 0,
            "embedding_ids":    [],
        },
    )

@router.get("/job-status/{person_id}")
def get_job_status(person_id: int, db: Session = Depends(get_db)):
    """Poll endpoint to check background face extraction status."""
    job = _face_jobs.get(person_id)
    if not job:
        # Check DB directly in case server restarted or job cleared
        person = db.query(Person).filter(Person.id == person_id).first()
        if not person:
            return ApiResponse(success=False, message="Person not found", data={"status": "error", "error": "Person not found"})
        # If they exist and have embeddings, it's done.
        if len(person.embeddings) > 0:
            return ApiResponse(success=True, message="Completed", data={"status": "completed"})
        else:
            return ApiResponse(success=False, message="Unknown state", data={"status": "error", "error": "Unknown background state"})
    
    return ApiResponse(success=True, message="Status fetched", data=job)



class SuggestIdentityBody(BaseModel):
    suggested_name: str
    suggested_relation: str


@router.post("/suggest-identity/{person_id}", response_model=ApiResponse)
def suggest_identity(
    person_id: int,
    body: SuggestIdentityBody,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """
    Patient suggests a name and relation for an unrecognised face.
    Saved as pending_verification=True for caregiver to approve or reject.
    """
    person = db.get(Person, person_id)
    if not person:
        raise ApiError(404, "Person not found")
    person.suggested_name = body.suggested_name
    person.suggested_relation = body.suggested_relation
    person.pending_verification = True
    db.commit()
    return ApiResponse(success=True, message="Suggestion submitted for caregiver review", data={"person_id": person_id})


@router.post("/match/{patient_id}", response_model=MatchFaceResponse)
async def match_face(
    patient_id: int,
    file: UploadFile = File(..., description="Live photo from camera (JPEG/PNG)"),
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """
    Identify who is in a photo by comparing against all stored faces for a patient.

    - **recognised = True**  → returns person name, relation, similarity score, and image_url
    - **recognised = False** → uploads photo to Cloudinary, creates an UnknownFace record, returns its ID + image_url
    - **error = no_face_detected** → no face found in the image
    """
    image_bytes = await file.read()

    # Upload the live capture to Cloudinary so it can be shown in the UI
    image_url = upload_file(image_bytes, folder=f"captures/{patient_id}")

    result = face_service.match_face(db, patient_id, image_bytes, image_url)

    if result.get("error") == "no_face_detected":
        return MatchFaceResponse(
            success=False,
            message="No face detected in the uploaded image.",
            data={"error": "no_face_detected"},
        )

    if result["recognised"]:
        # Fire email notification to ALL registered family members of this patient
        patient_obj = db.get(Patient, patient_id)
        if patient_obj:
            family_members = (
                db.query(Person)
                .filter(
                    Person.patient_id == patient_id,
                    Person.is_family == True,
                    Person.family_member_email != None,
                    Person.family_member_email != "",
                )
                .all()
            )

            if family_members:
                visitor_name   = result.get("name") or "Someone"
                visitor_relation = result.get("relation") or "visitor"
                visitor_image  = result.get("image_url")
                patient_name   = patient_obj.name

                logger.info(
                    "Sending visit notification for patient %s to %d family member(s)",
                    patient_name, len(family_members),
                )

                for member in family_members:
                    kwargs = dict(
                        to_email=member.family_member_email,
                        visitor_name=visitor_name,
                        visitor_relation=visitor_relation,
                        patient_name=patient_name,
                        visitor_image_url=visitor_image,
                    )
                    threading.Thread(
                        target=send_visit_notification,
                        kwargs=kwargs,
                        daemon=True,
                    ).start()
            else:
                logger.info(
                    "No family members with email registered for patient %d — skipping notification.",
                    patient_id,
                )

        # Check for history restriction (Severe Case Privacy)
        is_severe = (patient_obj.diagnosis_level or "").lower() == "severe"
        result["history_restricted"] = is_severe

        return MatchFaceResponse(
            success=True,
            message=f"Recognised as {result['name']} ({result['relation']}).",
            data=result,
        )

    return MatchFaceResponse(
        success=False,
        message="Face not recognised. Saved as unknown face.",
        data=result,
    )


@router.get("/known-persons/{patient_id}")
def list_known_persons(
    patient_id: int,
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """List all known persons registered for a patient."""
    persons = face_service.get_known_persons_for_patient(db, patient_id)
    return {
        "success": True,
        "message": "Known persons fetched",
        "data": [
            {
                "id":       p.id,
                "name":     p.name,
                "relation": p.relation,
                "image_url": p.image_url,
            }
            for p in persons
        ],
    }


@router.post("/store_unknown_face/{patient_id}")
async def store_unknown_face(
    patient_id: int,
    file: UploadFile = File(..., description="Photo of the unknown person (JPEG/PNG)"),
    db: Session = Depends(get_db),
    token_data: dict = Depends(verify_token),
):
    """Store an unknown face for a patient (used when matching fails)."""
    image_bytes = await file.read()

    try:
        # Upload the image to Cloudinary
        image_url = upload_file(image_bytes, folder=f"unknown_faces/{patient_id}")

        person, embeddings = face_service.addPerson(
            db, patient_id, None, None, False, image_bytes, image_url
        )
    except ValueError as e:
        raise ApiError(status_code=400, message=str(e))

    return StoreFaceResponse(
        success=True,
        message=f"Registered unknown face with {len(embeddings)} face embedding(s).",
        data={
            "person_id":        person.id,
            "name":             person.name,
            "relation":         person.relation,
            "is_known":         person.is_known,
            "image_url":        person.image_url,
            "embeddings_stored": len(embeddings),
            "embedding_ids":    [e.id for e in embeddings],
        },
    )