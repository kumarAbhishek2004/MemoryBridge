from sqlalchemy.orm import Session
import numpy as np

from server.models.person import Person, FaceEmbedding
from server.ai.face_pipeline import extract_embeddings

MATCH_THRESHOLD = 0.70


# ── helpers ────────────────────────────────────────────────────────────────────

def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    return float(np.dot(va, vb))


def _all_embeddings_for_patient(db: Session, patient_id: int) -> list[dict]:
    """
    Load every FaceEmbedding that belongs to a patient via their Person rows.
    Keys are normalised so match_face() can use them safely.
    """
    rows = (
        db.query(FaceEmbedding, Person)
        .join(Person, FaceEmbedding.person_id == Person.id)
        .where(Person.patient_id == patient_id)
        .all()
    )

    return [
        {
            "embedding_id": face_embed.id,
            "person_id":    person.id,
            "name":         person.name,
            "relation":     person.relation,
            "is_known":     person.is_known,
            "is_family":    person.is_family,
            "image_url":    person.image_url,
            "embedding":    face_embed.embedding,
        }
        for face_embed, person in rows
    ]


# ── public API ─────────────────────────────────────────────────────────────────

def addPerson(
    db: Session,
    patient_id: int,
    name: str,
    relation: str,
    is_known: bool,
    image_bytes: bytes,
    image_url: str = None,
) -> tuple[Person, list[FaceEmbedding]]:
    """
    Create a new Person row, detect all faces in the image,
    store their embeddings, and return both the person and the embeddings.
    Returns (person, list_of_face_embeddings).
    """
    person = Person(
        patient_id=patient_id,
        name=name,
        relation=relation,
        is_known=is_known,
        image_url=image_url,
    )
    db.add(person)
    db.commit()
    db.refresh(person)

    embeddings = store_face_embeddings_for_person(db, person.id, image_bytes)
    return person, embeddings


def store_face_embeddings_for_person(
    db: Session,
    person_id: int,
    image_bytes: bytes,
) -> list[FaceEmbedding]:
    """
    Detect all faces in the image and store each one as a FaceEmbedding
    linked to the given Person.
    """
    faces = extract_embeddings(image_bytes)

    if not faces:
        raise ValueError("No face detected in the uploaded image.")

    created = []
    for face in faces:
        record = FaceEmbedding(
            person_id=person_id,
            embedding=face["embedding"],
        )
        db.add(record)
        created.append(record)

    db.commit()
    for r in created:
        db.refresh(r)

    return created


def match_face(
    db: Session,
    patient_id: int,
    image_bytes: bytes,
    image_url: str = None,
) -> dict:
    """
    Detect the face in image_bytes and compare it against every stored
    embedding for this patient.

    Returns a plain dict that the router converts to MatchFaceResponse.
    """
    faces = extract_embeddings(image_bytes)
    if not faces:
        return {
            "recognised": False,
            "error": "no_face_detected",
        }

    # Pick the most-confident detection
    face = max(faces, key=lambda f: f["confidence"])
    query_embedding = face["embedding"]
    detection_confidence = face["confidence"]

    stored = _all_embeddings_for_patient(db, patient_id)

    best_score = -1.0
    best_match = None

    for record in stored:
        score = _cosine_similarity(query_embedding, record["embedding"])
        if score > best_score:
            best_score = score
            best_match = record

    # ── recognised ────────────────────────────────────────────────────────────
    if best_match and best_score >= MATCH_THRESHOLD:
        return {
            "recognised": True,
            "person_id":  best_match["person_id"],
            "name":       best_match["name"],
            "relation":   best_match["relation"],
            "is_known":   best_match["is_known"],
            "is_family":  best_match["is_family"],
            "image_url":  best_match["image_url"],
            "similarity": round(best_score, 4),
            "confidence": round(detection_confidence, 4),
        }

    # ── not recognised → create UnknownFace record ────────────────────────────
    unknown = Person(
        patient_id=patient_id,
        name=None,
        relation=None,
        is_known=False,
        image_url=image_url,   # store the Cloudinary URL of the captured frame
    )
    db.add(unknown)
    db.flush()

    unknown_embedding = FaceEmbedding(
        person_id=unknown.id,
        embedding=query_embedding,
    )
    db.add(unknown_embedding)
    db.commit()
    db.refresh(unknown)

    return {
        "recognised":      False,
        "unknown_face_id": unknown.id,
        "image_url":       image_url,   # send back so the frontend can display it
        "similarity":      round(best_score, 4),
        "confidence":      round(detection_confidence, 4),
        "error":           None,
    }


def get_known_persons_for_patient(db: Session, patient_id: int) -> list[Person]:
    return (
        db.query(Person)
        .filter(Person.patient_id == patient_id, Person.is_known == True)
        .all()
    )
