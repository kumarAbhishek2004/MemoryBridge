# ⚙️ MemoryBridge — Backend Server

<div align="center">

**High-Performance AI Gateway & Persistence Engine for MemoryBridge**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.135+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.13-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![SQLAlchemy](https://img.shields.io/badge/ORM-SQLAlchemy%202.0-D71F00.svg?logo=sqlalchemy&logoColor=white)](https://www.sqlalchemy.org)
[![PyTorch](https://img.shields.io/badge/AI-PyTorch%20%2F%20FaceNet-EE4C2C.svg?logo=pytorch&logoColor=white)](https://pytorch.org)
[![LangChain](https://img.shields.io/badge/LLM-LangChain%20Core-1C3C3C.svg?logo=langchain&logoColor=white)](https://langchain.com)

</div>

---

## 📖 Table of Contents
1. [Overview](#-overview)
2. [Architecture & Request Lifecycle](#-architecture--request-lifecycle)
   - [Backend Layer Structure](#backend-layer-structure)
   - [ASGI Dual-Protocol Architecture](#asgi-dual-protocol-architecture)
3. [AI & Computer Vision Pipelines](#-ai--computer-vision-pipelines)
   - [1. Face Detection & Recognition Pipeline (`face_pipeline.py`)](#1-face-detection--recognition-pipeline-face_pipelinepy)
   - [2. Stop-Triggered Conversation Summarizer (`summary_pipeline.py`)](#2-stop-triggered-conversation-summarizer-summary_pipelinepy)
   - [3. Family Email Notification Dispatcher (`email_service.py`)](#3-family-email-notification-dispatcher-email_servicepy)
   - [4. Haversine Geofencing Engine (`tracking.py`)](#4-haversine-geofencing-engine-trackingpy)
4. [Database Architecture & ORM Models](#-database-architecture--orm-models)
5. [Authentication, Authorization & Scoped Tokens](#-authentication-authorization--scoped-tokens)
6. [Directory Structure](#-directory-structure)
7. [API Endpoint Catalog](#-api-endpoint-catalog)
8. [Environment Configuration](#-environment-configuration)
9. [Installation & Setup](#-installation--setup)
10. [Database Migrations with Alembic](#-database-migrations-with-alembic)

---

## 🎯 Overview

The **MemoryBridge Backend** is a modular, production-ready REST and real-time service engineered with **FastAPI**, **SQLAlchemy 2.0**, and **PyTorch**.

It coordinates all mission-critical intelligent capabilities:
- **Biometric Face Recognition**: Real-time MTCNN face detection and FaceNet InceptionResnetV1 embedding extraction.
- **Family Visit Alerts**: Background dispatch of branded notification emails with visitor photographs via Cloudinary and SMTP.
- **Real-Time Speech Ingestion & Persistence**: Instant persistence of transcribed utterances with 0ms recording delay.
- **Post-Conversation Clinical Summarization**: LangChain-orchestrated Google Gemini 1.5/2.0 Flash with automatic fallback to Groq LLaMA-3.
- **Daily Routine & Medication Planning**: Caregiver scheduling endpoints and completion tracking.
- **Geofence Safety Verification**: Haversine distance computations from the patient's home coordinates to detect wandering incidents.

---

## 🏛️ Architecture & Request Lifecycle

### Backend Layer Structure

```mermaid
flowchart TD
    subgraph Gateway["ASGI Entrypoint (main.py)"]
        SocketIOApp["Socket.IO ASGI Wrapper (application)"]
        FastAPIApp["FastAPI Router Root (app)"]
    end

    subgraph MiddlewareLayer["Middleware & Filters"]
        CORS["CORS Middleware"]
        AuthFilter["JWT / Scoped Session Validator"]
        ErrHandler["Custom ApiError Exception Handler"]
    end

    subgraph Routers["API Route Controllers (routers/)"]
        AuthR["auth.py (Caregiver Authentication)"]
        PatientR["patient.py (Profiles & Patient Mode Sessions)"]
        RecogR["recognition.py (Face Enrollment & Match)"]
        TransR["transcription.py (Conversations & Summaries)"]
        RoutineR["routine.py (Daily Schedule & Medications)"]
        TrackR["tracking.py (GPS Pings & Geofencing)"]
    end

    subgraph Services["Domain Services & Pipelines (services/ & ai/)"]
        FaceAI["face_pipeline.py (MTCNN + FaceNet InceptionResnetV1)"]
        SummaryAI["summary_pipeline.py (LangChain Gemini / Groq)"]
        EmailSvc["email_service.py (Cloudinary + SMTP)"]
        RoutineSvc["routine.py (CRUD & State Toggles)"]
        HaversineSvc["Haversine Math (Geofence Distance & Breach)"]
    end

    subgraph Persistence["Data Layer (models/ & config/)"]
        DBSession["SQLAlchemy 2.0 Session (SessionLocal)"]
        Database[("PostgreSQL / SQLite")]
    end

    SocketIOApp --> FastAPIApp
    FastAPIApp --> MiddlewareLayer
    MiddlewareLayer --> Routers

    RecogR --> FaceAI
    RecogR --> EmailSvc
    TransR --> SummaryAI
    RoutineR --> RoutineSvc
    TrackR --> HaversineSvc

    Routers --> DBSession
    Services --> DBSession
    DBSession --> Database
```

---

### ASGI Dual-Protocol Architecture

The server wraps the core FastAPI HTTP application within a **python-socketio** ASGI app in [`main.py`](file:///c:/Users/Kumar%20Abhishek/OneDrive/Desktop/MemoryBridge/server/main.py):

```python
# main.py
app = FastAPI(title="MemoryBridge API", version="1.0.0")
# ... register routers and CORS ...
application = socketio.ASGIApp(sio, other_asgi_app=app)
```

This architecture allows a single ASGI server instance (e.g. `uvicorn main:application`) to concurrently serve standard REST endpoints, Swagger documentation, and optional bidirectional Socket.IO events over the same port.

---

## 🧠 AI & Computer Vision Pipelines

### 1. Face Detection & Recognition Pipeline (`face_pipeline.py`)

MemoryBridge uses a dual-stage biometric pipeline built with **PyTorch** and **facenet-pytorch**:

1. **Face Detection & Alignment**:
   - Uses **MTCNN** (`MTCNN(image_size=160, margin=20, keep_all=False)`).
   - Detects the primary face in the video frame, aligns facial landmarks, and crops to a normalized $160 \times 160$ bounding box.
   - If no face is detected or multiple faces create ambiguity, returns a graceful rejection response.

2. **Feature Extraction**:
   - Passes the normalized crop into **InceptionResnetV1** pretrained on VGGFace2.
   - Computes a compact **512-dimensional continuous floating-point vector**.
   - Normalizes the vector onto a unit sphere.

3. **Identity Verification & Distance Matching**:
   - Enrolled embeddings are fetched for the target patient.
   - Calculates the **Euclidean distance** $d = \| \mathbf{e}_{\text{query}} - \mathbf{e}_{\text{enrolled}} \|_2$.
   - A threshold of $d \le 0.70$ is applied for match identification, with confidence scoring calculated as:
     $$\text{Confidence} = \max\left(0.0, 1.0 - \frac{d}{0.70}\right)$$

---

### 2. Stop-Triggered Conversation Summarizer (`summary_pipeline.py`)

To eliminate recording lag and prevent premature LLM updates during active speech:
- During active recording, incoming speech sentences are persisted immediately to the database via `/transcription/transcript-line` with **zero LLM latency**.
- When the user stops recording, the client sends the complete accumulated transcript to `/transcription/finish`.
- The backend triggers `generate_one_off_summary(patient_name, full_transcript)`.

#### LangChain Chain with Groq Fallback
The summarizer uses LangChain's fallback pattern:
```python
_gemini_llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",
    temperature=0.2,
    google_api_key=GEMINI_API_KEY,
)
_groq_llm = ChatGroq(
    model="llama-3.1-8b-instant",
    temperature=0.2,
    api_key=GROQ_API_KEY,
)
_llm = _gemini_llm.with_fallbacks([_groq_llm])
```
If Google Gemini encounters rate limits or quota exhaustion, LangChain instantly and transparently recovers using Groq LLaMA-3.

#### Structured Clinical Output
The LLM prompt formats the summary into readable, emoji-coded bullet points:
- 🗣️ **Conversational Topics**: Main subject and visiting purpose.
- ❤️ **Emotional Tone**: Mood, sentiment, and emotional state.
- ❓ **Questions & Decisions**: Key questions asked or agreements made.
- 📝 **Medical & Reminders**: Any medicine, meals, or health points discussed.

---

### 3. Family Email Notification Dispatcher (`email_service.py`)

When a visitor is matched to an enrolled person with `is_family: true` and an email address:
1. **Background Task**: FastAPI schedules `send_family_notification_email` as an asynchronous background task so the biometric API response is not blocked.
2. **Cloud CDN Upload**: If configured, the captured video frame is uploaded to **Cloudinary** to generate a permanent preview link.
3. **HTML Email Template**: Formats a responsive notification email informing the family of who visited, the exact timestamp, their relationship, and the photo.
4. **SMTP Dispatch**: Sends the message via secure TLS SMTP (port 587) using credentials configured in `.env`.

---

### 4. Haversine Geofencing Engine (`tracking.py`)

Patient locations reported by the client are evaluated against the patient's configured home center:

$$\Delta\sigma = 2 \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$
$$d = R \cdot \Delta\sigma \quad (\text{where } R = 6,371,000 \text{ meters})$$

- If $d > \text{safe\_radius\_meters}$, the location record is flagged with `is_breached = True`.
- Velocity is calculated from the time elapsed between sequential GPS pings to estimate movement speed.

---

## 🗄️ Database Architecture & ORM Models

The database schema is defined in [`server/models/`](file:///c:/Users/Kumar%20Abhishek/OneDrive/Desktop/MemoryBridge/server/models/):

| Model | Table | Description |
| :--- | :--- | :--- |
| **`User`** | `users` | Caregiver accounts with bcrypt-hashed passwords. |
| **`Patient`** | `patients` | Patient profiles with diagnosis severity, home coordinates, and safe boundary radius. |
| **`Person`** | `persons` | Contacts associated with a patient, relationship, family flag, and notification email. |
| **`FaceEmbedding`** | `face_embeddings` | 512-dimensional facial embedding vectors and photo references. |
| **`Conversation`** | `conversations` | Conversation sessions linked to a patient and optional recognized person. |
| **`Transcript`** | `transcripts` | Individual timestamped sentences transcribed during a conversation. |
| **`Summary`** | `summaries` | Post-conversation clinical summary generated by the LLM pipeline. |
| **`RoutineItem`** | `routine_items` | Scheduled daily activities and medications with completion state. |
| **`Location`** | `locations` | Historical GPS breadcrumb records with breach flags and calculated speeds. |

---

## 🔐 Authentication, Authorization & Scoped Tokens

MemoryBridge enforces role-based access control (RBAC) using **PyJWT**:

### 1. Caregiver Tokens
- **Issued at**: `POST /auth/login`
- **Payload**: `{ "sub": user_id, "role": "caregiver", "exp": ... }`
- **Permissions**: Full CRUD over patients, contacts, face enrollment, routines, and tracking.

### 2. Patient Viewer Tokens (Patient Mode)
- **Issued at**: `POST /patients/{id}/session`
- **Payload**: `{ "sub": patient_id, "patient_id": patient_id, "role": "patient_viewer", "exp": ... }`
- **Permissions**: Scoped strictly to:
  - Matching faces against enrolled contacts for that specific patient.
  - Recording speech and generating summaries for that patient.
  - Querying today's routines and toggling completion status.
  - Transmitting GPS location pings.
- **Restrictions**: Cannot delete records, alter caregiver passwords, or access other patients.

---

## 📂 Directory Structure

```text
server/
├── ai/
│   ├── face_pipeline.py             # MTCNN detector & FaceNet InceptionResnetV1 matcher
│   └── summary_pipeline.py          # Gemini & Groq LangChain summarization engine
├── config/
│   ├── db.py                        # SQLAlchemy Base, engine, and SessionLocal factory
│   ├── env.py                       # Validated environment settings
│   └── socket_server.py             # python-socketio AsyncServer definition
├── core/
│   ├── api_error.py                 # Custom ApiError exception class
│   ├── api_response.py              # Standardized ApiResponse wrapper
│   └── exception_handler.py         # Global FastAPI exception handler
├── dependencies/
│   └── auth.py                      # verify_token dependency with token extraction
├── models/                          # SQLAlchemy database entities
│   ├── conversation.py              # Conversation, Transcript, Summary
│   ├── location.py                  # Location GPS tracking model
│   ├── patient.py                   # Patient demographics & geofence settings
│   ├── person.py                    # Person contact & FaceEmbedding vector
│   ├── routine.py                   # RoutineItem model
│   └── user.py                      # Caregiver User model
├── routers/                         # FastAPI route endpoints
│   ├── auth.py                      # Register, login, refresh tokens
│   ├── patient.py                   # Patient management & session tokens
│   ├── recognition.py               # Face enrollment & match verification
│   ├── routine.py                   # Routine CRUD & completion toggles
│   ├── tracking.py                  # GPS coordinate recording & breadcrumbs
│   ├── transcription.py             # Conversation lifecycle & summary retrieval
│   └── user.py                      # Caregiver profile management
├── schemas/                         # Pydantic validation schemas
│   ├── face.py                      # Face match and enrollment schemas
│   ├── location.py                  # Location coordinate validation
│   ├── patient.py                   # Patient request/response shapes
│   ├── routine.py                   # Routine creation & update schemas
│   └── user.py                      # User registration & login schemas
├── services/                        # Business logic modules
│   ├── auth.py                      # Password hashing & JWT generation
│   ├── email_service.py             # Cloudinary upload & SMTP dispatch
│   ├── face_service.py              # Contact directory queries
│   ├── patient.py                   # Patient database operations
│   ├── routine.py                   # Routine queries & toggles
│   └── transcription_service.py     # Conversation lifecycle & DB operations
├── main.py                          # FastAPI ASGI application entrypoint
├── pyproject.toml                   # Project dependencies and packaging
└── alembic.ini                      # Alembic database migration config
```

---

## 📡 API Endpoint Catalog

### Authentication & Users
- `POST /auth/register` — Register a caregiver account.
- `POST /auth/login` — Authenticate and receive access/refresh tokens.
- `POST /auth/refresh` — Refresh expired access token.
- `GET /users/me` — Fetch authenticated caregiver profile.

### Patients & Patient Sessions
- `POST /patients` — Create a patient profile with geofence settings.
- `GET /patients` — List caregiver's assigned patients.
- `GET /patients/{patient_id}` — Get detailed patient profile.
- `PATCH /patients/{patient_id}` — Update patient profile or geofence coordinates.
- `DELETE /patients/{patient_id}` — Archive or delete patient record.
- `POST /patients/{patient_id}/session` — Issue scoped Patient Mode session token.

### Biometric Face Recognition
- `POST /recognition/enroll` — Enroll contact face embedding from image upload.
- `POST /recognition/match` — Match webcam frame, verify identity, and trigger family email.
- `GET /recognition/patient/{patient_id}` — List all enrolled contacts for a patient.
- `DELETE /recognition/person/{person_id}` — Remove contact and enrolled face vectors.

### Audio Transcription & AI Summarization
- `POST /transcription/start` — Initialize new conversation record.
- `POST /transcription/transcript-line` — Persist individual speech sentence (instant, 0ms LLM lag).
- `POST /transcription/finish` — Stop conversation, run Gemini/Groq summary, save to DB.
- `GET /transcription/conversations/{patient_id}` — Retrieve historical conversations.
- `GET /transcription/person/{person_id}/conversations` — Retrieve past interactions with contact.

### Daily Routines & Medications
- `POST /patients/{patient_id}/routines` — Create scheduled routine or medication.
- `GET /patients/{patient_id}/routines` — Retrieve daily schedule.
- `PATCH /patients/{patient_id}/routines/{routine_id}` — Update routine item.
- `DELETE /patients/{patient_id}/routines/{routine_id}` — Delete routine item.
- `POST /patients/{patient_id}/routines/{routine_id}/toggle` — Toggle completion status.

### Geofencing & GPS Tracking
- `POST /tracking/location` — Ingest GPS coordinate ping and evaluate boundary breach.
- `GET /tracking/path/{patient_id}` — Retrieve historical GPS breadcrumbs for Leaflet map.

---

## ⚙️ Environment Configuration

Create a `.env` file in the `server/` root directory:

```env
# Database URL (SQLite or PostgreSQL)
DATABASE_URL=sqlite:///./memorybridge.db
# For PostgreSQL: postgresql+psycopg://user:password@localhost:5432/memorybridge

# JWT Authentication
SECRET_KEY=generate-a-strong-random-secret-key-here-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
REFRESH_TOKEN_EXPIRE_MINUTES=129600
PATIENT_SESSION_EXPIRE_MINUTES=480

# Speech-to-Text
DEEPGRAM_API_KEY=your_deepgram_api_key

# Large Language Models
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key

# Cloudinary (Visitor Snapshot Storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
SMTP_FROM=your_email@gmail.com
```

---

## 🚀 Installation & Setup

1. **Create and activate a Python virtual environment**:
   ```bash
   cd server
   python -m venv .venv

   # Windows
   .venv\Scripts\Activate.ps1

   # Linux / macOS
   source .venv/bin/activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   # Or using pyproject.toml:
   pip install .
   ```

3. **Start the development server**:
   ```bash
   uvicorn main:application --reload --host 127.0.0.1 --port 8000
   ```

4. **Access interactive documentation**:
   - Swagger UI: `http://127.0.0.1:8000/docs`
   - ReDoc: `http://127.0.0.1:8000/redoc`

---

## 🔄 Database Migrations with Alembic

MemoryBridge automatically creates tables on startup via `Base.metadata.create_all(bind=engine)`. For schema versioning in production:

```bash
# Generate a new migration
alembic revision --autogenerate -m "Add routine items table"

# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```
