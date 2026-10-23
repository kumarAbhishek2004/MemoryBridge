# 🌉 MemoryBridge

<div align="center">

**AI-Assisted Memory Support & Cognitive Prosthetic System for Alzheimer’s & Dementia Care**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/Frontend-React%2019-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Deepgram](https://img.shields.io/badge/STT-Deepgram%20Nova--2-13EF95.svg?logo=deepgram&logoColor=black)](https://deepgram.com)
[![Google Gemini](https://img.shields.io/badge/LLM-Gemini%20Flash-4285F4.svg?logo=google&logoColor=white)](https://ai.google.dev)
[![PyTorch](https://img.shields.io/badge/Biometrics-FaceNet%20PyTorch-EE4C2C.svg?logo=pytorch&logoColor=white)](https://pytorch.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 📖 Table of Contents
1. [Overview & Mission](#-overview--mission)
2. [Complete System Architecture](#-complete-system-architecture)
   - [High-Level Architectural Flow](#high-level-architectural-flow)
   - [Real-Time Interaction Sequence](#real-time-interaction-sequence)
   - [Database Entity-Relationship Diagram](#database-entity-relationship-diagram)
3. [Key Capabilities & Subsystems](#-key-capabilities--subsystems)
   - [1. Real-Time Face Recognition & Biometrics](#1-real-time-face-recognition--biometrics)
   - [2. Instant Family Visit Notifications](#2-instant-family-visit-notifications)
   - [3. Streaming Live Speech Transcription](#3-streaming-live-speech-transcription)
   - [4. Stop-Triggered Post-Conversation AI Summarization](#4-stop-triggered-post-conversation-ai-summarization)
   - [5. Daily Routine & Medication Management](#5-daily-routine--medication-management)
   - [6. Geofencing & GPS Breadcrumb Tracking](#6-geofencing--gps-breadcrumb-tracking)
4. [Tech Stack](#-tech-stack)
5. [Repository Structure](#-repository-structure)
6. [Prerequisites & Environment Configuration](#-prerequisites--environment-configuration)
7. [Installation & Getting Started](#-installation--getting-started)
   - [Backend Setup](#backend-setup)
   - [Frontend Setup](#frontend-setup)
8. [API Endpoint Catalog](#-api-endpoint-catalog)
9. [Sub-Project Documentation](#-sub-project-documentation)
10. [Security, Privacy & Ethics](#-security-privacy--ethics)
11. [License](#-license)

---

## 🎯 Overview & Mission

**MemoryBridge** is an intelligent assistive companion designed to alleviate the cognitive load and anxiety experienced by individuals living with Alzheimer's disease and other forms of dementia. 

By functioning as a discreet "memory prosthetic" in real time, MemoryBridge empowers patients with:
- **Immediate Familiarity**: Identifies visiting family, friends, and healthcare aides instantly via on-device face recognition without requiring awkward questions.
- **Contextual Recall**: Displays past visits, relations, and interaction summaries so conversations feel natural and grounded.
- **Real-Time Live Captioning**: Transcribes active conversations word-by-word with zero perceptual delay.
- **Structured AI Summarization**: Automatically distills spoken conversations into structured bullet points (emotions, decisions, medical items) once the conversation concludes.
- **Auditory Routine & Medication Guidance**: Alerts patients to daily schedules with friendly audio chimes, synthesized voice prompts, and popups.
- **Safety Geofencing**: Tracks patient GPS coordinates in real time and alerts caregivers when safe boundaries are breached.

---

## 🏛️ Complete System Architecture

### High-Level Architectural Flow

```mermaid
flowchart TD
    subgraph Client["Client Application (React 19 + TypeScript + Vite)"]
        UI["Patient Mode & Caregiver Dashboard"]
        Cam["Webcam Video Feed"]
        Mic["Microphone Audio Stream"]
        AudioEngine["Web Audio & Speech Synthesizer"]
        LeafletMap["Interactive Leaflet GPS Map"]
    end

    subgraph ExternalServices["Third-Party AI & Cloud Services"]
        DeepgramWS["Deepgram Live WS (Nova-2 STT)"]
        GeminiLLM["Google Gemini (Primary Summarizer)"]
        GroqLLM["Groq LLaMA-3 (Fallback Summarizer)"]
        CloudinaryAPI["Cloudinary CDN (Secure Face Storage)"]
        SMTPServer["SMTP Mail Server (Gmail / SendGrid)"]
    end

    subgraph BackendGateway["Backend Gateway (FastAPI + Socket.IO)"]
        AuthRouter["Auth Router (JWT / RBAC)"]
        PatientRouter["Patient Router & Session Issuer"]
        RecogRouter["Face Recognition Router"]
        TransRouter["Transcription Router"]
        RoutineRouter["Routine & Medication Router"]
        TrackRouter["GPS Geofence Tracking Router"]
    end

    subgraph AIPipelines["AI & Processing Services"]
        MTCNN["MTCNN Face Detection"]
        FaceNet["FaceNet InceptionResnetV1 (512-D Vectors)"]
        LangChainPipe["LangChain AI Summary Pipeline"]
        GeofenceEngine["Haversine Geofence Engine"]
        NotificationService["Family Email Dispatcher"]
    end

    subgraph Storage["Persistence Layer"]
        DB[("PostgreSQL / SQLite Database")]
        VectorStore["512-dim Embedding Vectors"]
    end

    %% Client Interactions
    Cam -->|"Capture Frame (JPEG)"| RecogRouter
    Mic -->|"Opus Audio Chunks (250ms WS)"| DeepgramWS
    DeepgramWS -->|"Interim & Final Transcripts"| UI
    UI -->|"Persist Line POST"| TransRouter
    UI -->|"Stop Recording (Full Transcript)"| TransRouter
    UI -->|"Location Ping (Lat/Lon/Speed)"| TrackRouter
    UI -->|"Manage Schedule & Toggles"| RoutineRouter
    AudioEngine -->|"Audio Chimes & TTS Prompts"| UI
    TrackRouter -->|"Breadcrumbs & Boundary Status"| LeafletMap

    %% Backend AI Processing
    RecogRouter --> MTCNN
    MTCNN --> FaceNet
    FaceNet -->|"Compare Cosine Distance"| VectorStore
    RecogRouter -->|"If Matched & Has Family"| NotificationService
    NotificationService --> CloudinaryAPI
    NotificationService --> SMTPServer

    TransRouter --> LangChainPipe
    LangChainPipe --> GeminiLLM
    GeminiLLM -.->|"On Failure / Quota Fallback"| GroqLLM

    TrackRouter --> GeofenceEngine
    GeofenceEngine -->|"Check Home Radius"| DB

    %% Database Operations
    AuthRouter --> DB
    PatientRouter --> DB
    RecogRouter --> DB
    TransRouter --> DB
    RoutineRouter --> DB
    TrackRouter --> DB
    VectorStore -.-> DB
```

---

### Real-Time Interaction Sequence

The following sequence details how Face Recognition, Live Speech Streaming, Family Notifications, and Stop-Triggered Summarization interact seamlessly:

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    actor Visitor
    participant App as Patient Mode UI
    participant Server as FastAPI Backend
    participant FaceAI as FaceNet Biometrics
    participant Email as Family Notification
    participant DG as Deepgram Live WS
    participant LLM as Gemini / Groq LLM
    participant DB as Database

    Note over Patient, Visitor: 1. Face Scan & Identity Verification
    Visitor->>App: Steps into camera frame
    App->>Server: POST /recognition/match (patient_id, image_file)
    Server->>FaceAI: Run MTCNN + InceptionResnetV1 (512-dim vector)
    FaceAI->>DB: Query enrolled embeddings & calculate distance
    DB-->>FaceAI: Return matched Person profile
    Server-->>App: Return identity (Name, Relation, Known status, Image URL)
    App-->>Patient: Display greeting banner ("Son · Himanshu")

    opt Visitor is Family Member with registered email
        Server->>Email: Dispatch background notification task
        Email-->>Server: Upload snapshot to Cloudinary & send SMTP email
    end

    Note over Patient, Visitor: 2. Real-Time Conversation Streaming
    Patient->>App: Clicks "Record" button
    App->>Server: POST /transcription/start (patient_id, person_id)
    Server->>DB: Create Conversation session row
    Server-->>App: Return conversation_id
    App->>DG: Open WebSocket with Opus audio stream (250ms chunks)
    
    loop While Speaking
        DG-->>App: { interim_results: true, text: "How are you..." }
        App-->>Patient: Real-time streaming speech bubble
        DG-->>App: { is_final: true, text: "How are you doing today, Mom?" }
        App->>Server: POST /transcription/transcript-line (conversation_id, text)
        Server->>DB: Save Transcript row (instant DB insert, 0ms LLM lag)
    end

    Note over Patient, Visitor: 3. Stop Recording & AI Summarization
    Patient->>App: Clicks "Stop" button
    App->>DG: Close WebSocket connection
    App-->>Patient: Show "Summarizing conversation…" spinner
    App->>Server: POST /transcription/finish (conversation_id, full_transcript)
    Server->>LLM: LangChain ainvoke (full transcript prompt)
    LLM-->>Server: Return structured clinical summary (bullet points + emojis)
    Server->>DB: Update Conversation ended_at & insert Summary record
    Server-->>App: Return { summary: "🗣️ Discussed doctor appointment..." }
    App-->>Patient: Render clean summary block
```

---

### Database Entity-Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Patient : "manages (owner_id)"
    Patient ||--o{ Person : "has known persons"
    Patient ||--o{ Conversation : "participates in"
    Patient ||--o{ Location : "tracks GPS coordinates"
    Patient ||--o{ RoutineItem : "has scheduled routines"
    Person ||--o{ FaceEmbedding : "has biometric vectors"
    Person ||--o{ Conversation : "participates in"
    Conversation ||--o{ Transcript : "contains sentences"
    Conversation ||--o| Summary : "has generated summary"

    User {
        int id PK
        string email UK
        string hashed_password
        string full_name
        boolean is_active
        datetime created_at
    }

    Patient {
        int id PK
        int owner_id FK
        string name
        int age
        string diagnosis_level
        string notes
        string home_latitude
        string home_longitude
        float safe_radius_meters
        datetime created_at
    }

    Person {
        int id PK
        int patient_id FK
        string name
        string relation
        string notes
        boolean is_family
        string email
        boolean is_known
        datetime created_at
    }

    FaceEmbedding {
        int id PK
        int person_id FK
        string embedding_json
        string image_url
        datetime created_at
    }

    Conversation {
        int id PK
        int patient_id FK
        int person_id FK
        datetime started_at
        datetime ended_at
    }

    Transcript {
        int id PK
        int conversation_id FK
        text text
        datetime timestamp
    }

    Summary {
        int id PK
        int conversation_id FK
        text text
        datetime created_at
    }

    RoutineItem {
        int id PK
        int patient_id FK
        string title
        string category
        string time
        string period
        string notes
        boolean is_completed
        datetime updated_at
    }

    Location {
        int id PK
        int patient_id FK
        float latitude
        float longitude
        float speed
        boolean is_breached
        datetime timestamp
    }
```

---

## 🌟 Key Capabilities & Subsystems

### 1. Real-Time Face Recognition & Biometrics
- **Detection**: Utilizes **MTCNN** (Multi-task Cascaded Convolutional Networks) for robust face detection, bounding box normalization, and 5-point facial landmark alignment.
- **Feature Extraction**: Generates 512-dimensional biometric embedding vectors via PyTorch's **InceptionResnetV1** pretrained on VGGFace2.
- **Matching Algorithm**: Employs normalized cosine / Euclidean distance comparisons against the patient’s enrolled contacts.
- **Privacy Mode**: Automatically flags interactions for severe diagnosis levels to protect patient privacy according to clinical protocols.

### 2. Instant Family Visit Notifications
- **Automatic Recognition**: When a visitor is matched as a family member with an enrolled email address, the system triggers a background task.
- **Snapshot Upload**: Uploads the capture frame to **Cloudinary** CDN with secure credentials.
- **Email Delivery**: Dispatches a branded HTML email via **SMTP** containing the visitor's identity, timestamp, relationship, and clear photo attachment to notify other family members of the visit.

### 3. Streaming Live Speech Transcription
- **Native Browser WebSocket**: Bypasses backend audio streaming bottlenecks by maintaining a secure WebSocket directly to **Deepgram Nova-2**.
- **Real-Time Speech Streaming**: Streams 250ms Opus-encoded chunks with `interim_results: true`, allowing words to appear on-screen in real time as they are spoken.
- **Zero Live Latency**: Transcript lines are persisted asynchronously to the backend database without triggering slow LLM summarization calls while speech is ongoing.

### 4. Stop-Triggered Post-Conversation AI Summarization
- **Distraction-Free UI**: While recording, the interface focuses entirely on the conversation stream. No half-finished or prematurely calculated summaries take up screen space.
- **Single High-Quality Generation**: Clicking **Stop** submits the entire accumulated transcript to the backend `/transcription/finish` endpoint.
- **Intelligent Fallback**: LangChain first invokes **Google Gemini 1.5/2.0 Flash**. If rate-limited or unavailable, it seamlessly falls back to **Groq LLaMA-3-8B-Instant**.
- **Clinical Formatting**: Summaries are structured into clean, emoji-coded bullet points detailing speaker intent, emotional tone, questions, decisions, and medication mentions.

### 5. Daily Routine & Medication Management
- **Caregiver Planner**: Caregivers can configure 24-hour schedules with categories (`medication`, `meal`, `appointment`, `exercise`, `sleep`), specific times (`HH:MM`), and reminders.
- **Patient Mode Header Popover**: A subtle pill button in the top navigation reveals today's schedule and completion progress on demand.
- **Multi-Sensory Audio Alerts**:
  - **Two-Tone Chime**: Synthesized via HTML5 Web Audio API oscillators (no external MP3 assets required).
  - **Voice Guidance**: Announces the routine using the browser's native `window.speechSynthesis`.
  - **Interactive Pop-up**: Clear modal with large "Mark as Done" action for accessibility.

### 6. Geofencing & GPS Breadcrumb Tracking
- **Continuous Monitoring**: Utilizes the HTML5 Geolocation API (`watchPosition`) to monitor patient latitude, longitude, and movement speed.
- **Haversine Distance**: Server calculates the exact spherical distance between the patient's coordinates and their configured home center.
- **Boundary Breach Detection**: Instantly marks records as `is_breached: true` when the distance exceeds the configured `safe_radius_meters`.
- **Visual Breadcrumb Trail**: Caregivers can inspect a interactive **Leaflet** map showing historical paths, current position, and the home safety boundary circle.

---

## 💻 Tech Stack

### Frontend Architecture
- **Core Framework**: React 19, TypeScript, Vite 8
- **Styling & UI**: Tailwind CSS v4, Radix UI primitives, Lucide React icons
- **State Management**: Redux Toolkit (RTK) & RTK Query
- **Routing**: React Router v7 with RBAC guards (`ProtectedRoute`, `GuestRoute`, `PatientModeGuard`)
- **Mapping**: Leaflet & React-Leaflet
- **Forms & Validation**: React Hook Form, Zod

### Backend Architecture
- **API Framework**: FastAPI 0.135+ (ASGI), Starlette
- **Real-Time Gateway**: Python-SocketIO
- **Database & ORM**: PostgreSQL / SQLite, SQLAlchemy 2.0, Alembic migrations
- **Authentication**: OAuth2 Password Flow, PyJWT, Passlib (bcrypt 4.0.1)
- **Computer Vision & AI**: PyTorch, FaceNet-PyTorch, OpenCV Headless, Pillow
- **LLM Pipeline**: LangChain Core, LangChain Google GenAI, Groq SDK
- **Speech-to-Text**: Deepgram SDK (Python & Client WebSocket)
- **Media & Delivery**: Cloudinary Python SDK, SMTP (smtplib / email.mime)

---

## 📂 Repository Structure

```text
MemoryBridge/
├── client/                              # React 19 + TypeScript Frontend
│   ├── src/
│   │   ├── components/                  # Reusable UI components
│   │   │   ├── guards/                  # Route guards (Auth, Guest, Patient Mode)
│   │   │   ├── layout/                  # Navbar and layout shells
│   │   │   ├── ui/                      # Radix/Tailwind design system components
│   │   │   ├── PatientDailyScheduleCard.tsx  # Daily routine dropdown modal
│   │   │   └── RoutineReminderAlert.tsx # Audio & speech routine alarm
│   │   ├── hooks/
│   │   │   └── useTranscription.ts      # Deepgram WebSocket speech hook
│   │   ├── layouts/                     # Root, Auth, and Patient Mode layouts
│   │   ├── pages/
│   │   │   ├── auth/                    # Login and Register pages
│   │   │   ├── patient-mode/            # Patient Mode UI & Face Recognition
│   │   │   ├── patients/                # Caregiver patient detail & routine manager
│   │   │   └── recognition/             # Caregiver face enrollment hub
│   │   ├── services/                    # RTK Query API slice definitions
│   │   ├── store/                       # Redux store, authSlice, patientSessionSlice
│   │   ├── types/                       # TypeScript interfaces and contracts
│   │   └── utils/
│   │       └── audioAlert.ts            # Web Audio API chime generator
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md                        # Dedicated Frontend Documentation
│
├── server/                              # FastAPI Backend
│   ├── ai/
│   │   ├── face_pipeline.py             # MTCNN + FaceNet embedding engine
│   │   └── summary_pipeline.py          # Gemini & Groq LangChain summarizer
│   ├── config/
│   │   ├── db.py                        # SQLAlchemy engine and session factory
│   │   ├── env.py                       # Typed environment variables
│   │   └── socket_server.py             # Async Socket.IO server
│   ├── core/
│   │   ├── api_error.py                 # Custom exception classes
│   │   └── api_response.py              # Standardized API response models
│   ├── dependencies/
│   │   └── auth.py                      # JWT verification & role validation
│   ├── models/                          # SQLAlchemy database entities
│   │   ├── conversation.py              # Conversation, Transcript, Summary
│   │   ├── location.py                  # Location tracking model
│   │   ├── patient.py                   # Patient profile & geofence settings
│   │   ├── person.py                    # Person & FaceEmbedding
│   │   ├── routine.py                   # RoutineItem model
│   │   └── user.py                      # Caregiver User account model
│   ├── routers/                         # FastAPI route definitions
│   │   ├── auth.py                      # /auth/register, /auth/login, /auth/refresh
│   │   ├── patient.py                   # /patients CRUD & viewer session tokens
│   │   ├── recognition.py               # /recognition/enroll & match
│   │   ├── routine.py                   # /patients/{id}/routines
│   │   ├── tracking.py                  # /tracking/location & /tracking/path
│   │   ├── transcription.py             # /transcription/start, /transcript-line, /finish
│   │   └── user.py                      # /users profile management
│   ├── schemas/                         # Pydantic validation schemas
│   ├── services/                        # Business logic & external API wrappers
│   ├── main.py                          # FastAPI ASGI application entrypoint
│   ├── pyproject.toml                   # Python dependencies & metadata
│   └── README.md                        # Dedicated Backend Documentation
│
├── .env                                 # Root environment configuration (reference)
├── .gitignore
├── LICENSE
└── README.md                            # Complete System Architecture & Guide
```

---

## ⚙️ Prerequisites & Environment Configuration

### Prerequisites
- **Node.js**: `v20.0.0` or higher (Node 22 recommended)
- **Package Manager**: `pnpm` (`v9.0.0`+) or `npm`
- **Python**: `3.10` to `3.13`
- **Database**: PostgreSQL (recommended for production) or SQLite (default for development)
- **Third-Party API Keys**:
  - [Deepgram Console](https://console.deepgram.com) (Live Audio Transcription)
  - [Google AI Studio](https://aistudio.google.com) (Gemini Summarization)
  - [Groq Console](https://console.groq.com) (Optional: LLaMA-3 Summarization Fallback)
  - [Cloudinary](https://cloudinary.com) (Optional: Visitor Face Snapshot Hosting)
  - Gmail App Password or SMTP credentials (Optional: Family Notifications)

---

### Backend Environment Configuration (`server/.env`)

Create a `.env` file inside the `server/` directory:

```env
# Database Connection (SQLite or PostgreSQL)
DATABASE_URL=sqlite:///./memorybridge.db
# For PostgreSQL: postgresql+psycopg://user:password@localhost:5432/memorybridge

# Authentication Security
SECRET_KEY=generate-a-strong-random-secret-key-here-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
REFRESH_TOKEN_EXPIRE_MINUTES=129600
PATIENT_SESSION_EXPIRE_MINUTES=480

# Speech-to-Text (Deepgram)
DEEPGRAM_API_KEY=your_deepgram_api_key

# Large Language Models for Summarization
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key

# Cloudinary (Visitor snapshot storage)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# SMTP Email Configuration (Family visit notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
SMTP_FROM=your_email@gmail.com
```

---

### Frontend Environment Configuration (`client/.env`)

Create a `.env` file inside the `client/` directory:

```env
# FastAPI Backend URL (no trailing slash)
VITE_API_BASE_URL=http://localhost:8000

# Deepgram Client Key (used by browser WebSocket to stream audio directly)
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key
```

---

## 🚀 Installation & Getting Started

### Backend Setup

1. **Navigate to the server directory**:
   ```bash
   cd server
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   # OR using uv / pip:
   pip install .
   ```

4. **Initialize Database & Run Migrations**:
   ```bash
   # Models auto-generate tables upon starting, or run Alembic:
   alembic upgrade head
   ```

5. **Start the FastAPI ASGI server**:
   ```bash
   uvicorn main:application --reload --host 127.0.0.1 --port 8000
   ```
   > The API will be available at `http://127.0.0.1:8000` with interactive Swagger docs at `http://127.0.0.1:8000/docs`.

---

### Frontend Setup

1. **Navigate to the client directory**:
   ```bash
   cd client
   ```

2. **Install node dependencies**:
   ```bash
   pnpm install
   ```

3. **Launch the development server**:
   ```bash
   pnpm dev
   ```
   > The web app will start at `http://localhost:5173`.

4. **Build for production**:
   ```bash
   pnpm build
   ```

---

## 📡 API Endpoint Catalog

| Module | Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- | :--- |
| **Auth** | `POST` | `/auth/register` | Register a caregiver account | No |
| **Auth** | `POST` | `/auth/login` | Login and receive access/refresh JWT tokens | No |
| **Auth** | `POST` | `/auth/refresh` | Exchange refresh token for new access token | No |
| **User** | `GET` | `/users/me` | Fetch authenticated user profile | Caregiver JWT |
| **Patients** | `POST` | `/patients` | Create a new patient profile with geofence | Caregiver JWT |
| **Patients** | `GET` | `/patients` | List all patients managed by caregiver | Caregiver JWT |
| **Patients** | `GET` | `/patients/{id}` | Retrieve patient profile & details | Caregiver JWT |
| **Patients** | `POST` | `/patients/{id}/session` | Generate scoped Patient Mode access token | Caregiver JWT |
| **Biometrics** | `POST` | `/recognition/enroll` | Enroll a contact's face with photo | Caregiver JWT |
| **Biometrics** | `POST` | `/recognition/match` | Identify a face frame & notify family | Patient / Caregiver |
| **Biometrics** | `GET` | `/recognition/patient/{id}` | List all enrolled persons for patient | Caregiver JWT |
| **Transcription**| `POST` | `/transcription/start` | Open a new conversation recording session | Patient / Caregiver |
| **Transcription**| `POST` | `/transcription/transcript-line`| Persist a final speech sentence | Patient / Caregiver |
| **Transcription**| `POST` | `/transcription/finish`| Stop recording & generate Gemini summary | Patient / Caregiver |
| **Transcription**| `GET` | `/transcription/conversations/{id}`| Retrieve past conversations & summaries | Patient / Caregiver |
| **Routines** | `POST` | `/patients/{id}/routines` | Add scheduled medication or routine | Caregiver JWT |
| **Routines** | `GET` | `/patients/{id}/routines` | Get daily routine schedule | Patient / Caregiver |
| **Routines** | `PATCH`| `/patients/{id}/routines/{rid}`| Modify routine item details | Caregiver JWT |
| **Routines** | `POST` | `/patients/{id}/routines/{rid}/toggle`| Mark routine as completed / uncompleted | Patient / Caregiver |
| **Tracking** | `POST` | `/tracking/location` | Record live GPS coordinate & check geofence | Patient / Caregiver |
| **Tracking** | `GET` | `/tracking/path/{patient_id}` | Fetch historical location breadcrumbs | Caregiver JWT |

---

## 📚 Sub-Project Documentation

For in-depth code architecture, component breakdowns, state patterns, and service implementations, refer to the dedicated READMEs:

- 🎨 **[Frontend Documentation (`client/README.md`)](file:///c:/Users/Kumar%20Abhishek/OneDrive/Desktop/MemoryBridge/client/README.md)**: Deep dive into React 19 architecture, RTK Query caching, Web Audio synthesizer, Leaflet GPS maps, and the Deepgram WebSocket hook.
- ⚙️ **[Backend Documentation (`server/README.md`)](file:///c:/Users/Kumar%20Abhishek/OneDrive/Desktop/MemoryBridge/server/README.md)**: Deep dive into FastAPI routes, PyTorch MTCNN/FaceNet matching, LangChain fallback pipelines, SMTP email services, and SQLAlchemy schemas.

---

## 🔒 Security, Privacy & Ethics

1. **Biometric Privacy**:
   - Raw facial images are processed into mathematical vectors (512-dim embeddings).
   - Only approved enrolled contacts have their embeddings stored.
   - For patients with advanced or severe diagnosis levels, past visit history can be restricted to safeguard patient dignity.

2. **Scoped Patient Viewer Tokens**:
   - Patient Mode runs on dedicated, short-lived tokens restricted to viewing patient details, recording transcripts, matching faces, and reporting GPS locations.
   - Patient Mode tokens cannot delete patient profiles, access caregiver credentials, or modify security settings.

3. **API Key Isolation**:
   - High-privilege API keys (Gemini, Groq, Cloudinary, Database credentials, SMTP secrets) reside strictly on the backend.
   - Only the public STT streaming key is delivered to the client for direct low-latency WebSocket connection.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
