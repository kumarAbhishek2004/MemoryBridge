"""
face_pipeline.py
================
Stage 1 — Face Detection  (MTCNN)
Stage 2 — Face Embedding  (FaceNet via facenet-pytorch)

How it works:
    1. detect_faces()  → finds bounding boxes of every face in an image
    2. get_embedding() → crops each face and converts it to a 512-d vector
"""

import numpy as np
import cv2
from PIL import Image

# facenet-pytorch provides both MTCNN (detector) and InceptionResnetV1 (embedder)
from facenet_pytorch import MTCNN, InceptionResnetV1
import torch

# ── device ────────────────────────────────────────────────────────────────────
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── models (loaded once at import time) ───────────────────────────────────────
# MTCNN: detects faces and returns aligned 160×160 crops ready for FaceNet
_detector = MTCNN(
    image_size=160,
    margin=0,               # Tightly crop face; ignore clothing and background
    keep_all=True,          # return ALL faces in the image, not just the best one
    device=DEVICE,
    post_process=True,      # normalise pixel values for FaceNet
)

# InceptionResnetV1 pretrained on VGGFace2 → 512-dimensional embeddings
_embedder = InceptionResnetV1(pretrained="vggface2").eval().to(DEVICE)


# ── public helpers ─────────────────────────────────────────────────────────────

def decode_image(image_bytes: bytes, max_size: int = 800) -> np.ndarray:
    """
    Convert raw image bytes (from an HTTP upload) into an OpenCV BGR array,
    and downscale it if it's too large to speed up MTCNN detection.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image — make sure it is a valid JPEG/PNG.")
    
    # Downscale for performance if image is huge
    h, w = img.shape[:2]
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        
    return img


def detect_faces(image_bytes: bytes) -> list[dict]:
    """
    Stage 1: Detect all faces in an image.

    Returns a list of dicts, one per face:
        {
            "box":        [x1, y1, x2, y2],   # pixel coordinates
            "confidence": float,               # MTCNN detection confidence
            "face_crop":  PIL.Image,           # aligned 160×160 crop (for embedding)
        }

    Returns an empty list when no face is found.
    """
    bgr = decode_image(image_bytes)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)

    # boxes  → shape (N, 4)  or None
    # probs  → shape (N,)    or None
    # crops  → list of N tensors (C, 160, 160) or None
    boxes, probs, landmarks = _detector.detect(pil_img, landmarks=True)
    crops = _detector(pil_img)  # returns aligned tensor(s) or None

    if boxes is None or crops is None:
        return []

    # crops may be a single tensor (1 face) — normalise to list
    if isinstance(crops, torch.Tensor) and crops.ndim == 3:
        crops = crops.unsqueeze(0)

    results = []
    for i, (box, prob) in enumerate(zip(boxes, probs)):
        results.append({
            "box":        [int(v) for v in box],
            "confidence": float(prob),
            "face_crop":  crops[i],   # tensor ready for the embedder
        })

    return results


def get_embedding(face_crop: torch.Tensor) -> list[float]:
    """
    Stage 2: Convert a single aligned face crop into a 512-d embedding vector.

    `face_crop` is the tensor returned inside each dict from detect_faces().

    Returns a plain Python list of 512 floats (ready to store in pgvector).
    """
    with torch.no_grad():
        # embedder expects a batch → unsqueeze adds the batch dimension
        tensor = face_crop.unsqueeze(0).to(DEVICE)
        embedding = _embedder(tensor)           # shape (1, 512)
        embedding = embedding.squeeze(0)        # shape (512,)

        # L2-normalise so cosine similarity == dot product later
        embedding = embedding / embedding.norm()

    return embedding.cpu().tolist()


def extract_embeddings(image_bytes: bytes) -> list[dict]:
    """
    Convenience wrapper: detect all faces AND generate their embeddings.

    Returns a list of dicts:
        {
            "box":        [x1, y1, x2, y2],
            "confidence": float,
            "embedding":  list[float],   # 512 floats
        }
    """
    faces = detect_faces(image_bytes)
    results = []
    for face in faces:
        emb = get_embedding(face["face_crop"])
        results.append({
            "box":        face["box"],
            "confidence": face["confidence"],
            "embedding":  emb,
        })
    return results
