# MemoryBridge

AI-assisted memory support system for Alzheimer’s patients.

---

# Project Goal

MemoryBridge helps Alzheimer’s patients:

* recognize familiar people
* recall recent interactions
* understand ongoing conversations
* receive simple memory assistance in real time

Core responsibilities:

* detect face from camera feed
* identify known person from database
* retrieve memory context
* transcribe speech
* summarize conversation
* display contextual memory

---

# High-Level System Flow

```text
Camera Input
↓
Face Detection
↓
Face Recognition
↓
Identity Lookup
↓
Memory Retrieval
↓
Audio Capture
↓
Live Transcription
↓
Summary Generation
↓
Patient UI Display
```

---

# Architecture Layers

## Frontend Layer

Responsibilities:

* camera capture
* microphone capture
* transcript display
* recognized person display
* memory summary display
* backend communication

Frontend handles:

```text
UI only + live interaction
```

Frontend does not handle:

```text
secret keys
business logic
AI decision making
database logic
```

---

## Backend Layer

Responsibilities:

* authentication
* face identity matching
* memory retrieval
* transcript processing
* summary generation
* external API orchestration

---

## AI Layer

Contains:

* face detection model
* face recognition model
* transcription provider
* summarization engine

---

## Database Layer

Stores:

* users
* patient profiles
* known persons
* face embeddings
* conversations
* summaries
* visit history

---

# Backend Folder Structure

```text
server/
│
├── routers/
│   ├── auth.py
│   ├── patient.py
│   ├── transcription.py
│   ├── recognition.py
│
├── services/
│   ├── auth_service.py
│   ├── user_service.py
│   ├── face_service.py
│   ├── transcription_service.py
│   ├── summary_service.py
│   ├── memory_service.py
│
├── models/
│   ├── user.py
│   ├── patient.py
│   ├── person.py
│   ├── conversation.py
│
├── schemas/
│   ├── user.py
│   ├── auth.py
│   ├── transcription.py
│
├── core/
│   ├── api_error.py
│   ├── api_response.py
│   ├── exception_handler.py
│
├── utils/
│   ├── jwt.py
│   ├── hashing.py
│
├── ai/
│   ├── face_pipeline.py
│   ├── transcript_pipeline.py
│   ├── summary_pipeline.py
```

---

# Face Recognition Pipeline

## Stage 1 Face Detection

Recommended models:

* YOLO
* MTCNN

Output:

```text
face bounding box
```

---

## Stage 2 Face Recognition

Recommended models:

* FaceNet
* ArcFace

Output:

```text
embedding vector
```

---

## Stage 3 Database Matching

```text
known person / unknown person
```

---

## Safety Rule

```text
If confidence is low → ask for confirmation
```

---

# Audio Architecture

## Phase 1

HTTP-based transcription:

```text
Record audio
↓
Upload file
↓
Backend sends to provider
↓
Receive transcript
```

---

## Phase 2

WebSocket live transcription:

```text
Mic chunks
↓
WebSocket
↓
Backend stream
↓
Provider stream
↓
Live transcript
```

---

# Communication Strategy

## HTTP Endpoints

Use for:

* login
* signup
* face recognition
* memory retrieval
* summary fetch

---

## WebSocket

Use for:

* live transcription

---

# Security Principles

## Backend Stores

* JWT secret
* API keys
* database credentials

---

## Frontend Stores

* backend URL
* feature flags

⚠️ Frontend environment variables are public and must never contain secret keys.

---

# Memory Pipeline

```text
Face Identity
↓
Retrieve Old Memory
↓
Transcription
↓
Summary Generation
```

---

# Memory Types

## Stable Memory

* son
* daughter
* doctor

---

## Episodic Memory

* visited yesterday
* brought medicine
* discussed appointment

---

# Recommended Database Entities

```text
User
Patient
KnownPerson
FaceEmbedding
Conversation
Transcript
Summary
VisitHistory
```

---

# Setup In Your Computer

Clone repository:

```bash
git clone https://github.com/Himanshu0518/MemoryBridge.git
```

Move into project:

```bash
cd MemoryBridge
```

## Running the Backend (Server)

We use `uv` and `fastapi-cli` for the Python backend.

```bash
cd server
uv run uvicorn main:application --reload --host 127.0.0.1 --port 8000
```

## Running the Frontend (Client)

The frontend is a React application built with Vite and `pnpm`.

```bash
cd client
pnpm install
pnpm dev
```

---

# Git Workflow

## Pull latest main

```bash
git checkout main
git pull origin main
```

---

## Create branch

```bash
git checkout -b feature/your-task-name
```

Example:

```bash
git checkout -b feature/user-authentication
```

---

## Working on code

```bash
git status
git add .
git commit -m "Added user authentication API"
```

---

## Push branch

```bash
git push origin feature/your-task-name
```

---

# Pull Request Process

1. Open GitHub
2. Compare & Pull Request
3. Base branch → `main`
4. Compare branch → feature branch
5. Add title + description
6. Create PR

---

# Code Review

* CodeRabbit auto review 🤖
* fix comments
* push updates

```bash
git add .
git commit -m "Resolved review comments"
git push origin feature/your-task-name
```

---

# Merge Strategy

After approval:

✅ squash and merge

---

# Branch Naming Convention

```text
feature/task-name
bugfix/task-name
hotfix/task-name
```

Examples:

```text
feature/login-api
bugfix/token-expiry
hotfix/payment-error
```

---

# Future Production Roadmap

## Phase 1

```text
HTTP + backend transcription
```

## Phase 2

```text
HTTP + WebSocket hybrid
```

## Phase 3

```text
real-time full streaming memory assistant
```

---

# Guiding Principle

```text
AI heavy logic + security + memory logic stay in backend
```
