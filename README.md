# MCQ Exam Microservice System

A complete, production-ready MCQ exam system built as a microservice architecture using Node.js, Fastify, PostgreSQL, Redis, and BullMQ.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Gateway :3000                       │
│        JWT Auth · Rate Limiting · Role-Based Routing            │
└────────┬────────┬───────────┬──────────┬──────────┬────────────┘
         │        │           │          │          │
   :3001 │  :3002 │     :3003 │    :3004 │    :3005 │
┌────────┴─┐ ┌────┴──────┐ ┌──┴──────┐ ┌┴────────┐ ┌┴──────────┐
│ Question │ │   Exam    │ │  Exam   │ │ Result  │ │  Dispute  │
│   Bank   │ │ Generator │ │ Session │ │ Engine  │ │  Manager  │
└──────────┘ └───────────┘ └─────────┘ └─────────┘ └───────────┘
         │           │           │           │            │
         └───────────┴───────────┴───────────┴────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              ┌─────┴─────┐      ┌────────┴──────┐
              │ PostgreSQL│      │     Redis      │
              │   :5432   │      │ :6379 + BullMQ │
              └───────────┘      └───────────────┘
```

## Services

| Service | Port | Description |
|---|---|---|
| api-gateway | 3000 | JWT auth, rate limiting, request proxy |
| question-bank | 3001 | CRUD for questions and subjects |
| exam-generator | 3002 | Exam creation, question selection, history tracking |
| exam-session | 3003 | Student exam sessions, Redis timers, auto-submit |
| result-engine | 3004 | BullMQ worker, score calculation, PDF generation |
| dispute-manager | 3005 | Dispute CRUD and resolution with recalculation |

## Quick Start

### Prerequisites
- Docker and Docker Compose

### Run the System

```bash
cd mcq-exam-system
docker compose up --build
```

All services start in the correct order with health checks. The first startup runs Prisma migrations automatically.

### API Base URL
```
http://localhost:3000
```

## API Reference

### Auth (Public — no token required)

```
POST /auth/register
Body: { email, password, name, role: "TEACHER"|"STUDENT", cohortId? }

POST /auth/login
Body: { email, password }
Response: { token, user }
```

All other endpoints require:
```
Authorization: Bearer <token>
```

### Question Bank

```
POST   /questions              — Add question (teacher)
POST   /questions/bulk         — CSV bulk upload (teacher)
GET    /questions              — List with filters (?subject_id=&difficulty=&tags=&page=&limit=)
GET    /questions/:id          — Get single question
PUT    /questions/:id          — Update question (teacher)
DELETE /questions/:id          — Soft delete (teacher)

POST   /subjects               — Create subject (teacher)
GET    /subjects               — List all subjects
```

**CSV format for bulk upload (multipart/form-data):**
```
text, option_a, option_b, option_c, option_d, correct_option, difficulty, tags
"What is 2+2?","3","4","5","6","B","EASY","math;arithmetic"
```
Fields required: `subjectId`, `createdBy`, `file` (CSV)

### Exam Generator

```
POST   /exams                  — Create exam config (teacher)
POST   /exams/:id/generate     — Select questions and activate exam (teacher)
GET    /exams/:id              — Get exam details (?role=TEACHER to see correct answers)
GET    /exams                  — List exams (?role=TEACHER&cohort_id=&status=)
PATCH  /exams/:id/status       — Change status: DRAFT→ACTIVE→COMPLETED
```

**Create exam body:**
```json
{
  "subjectId": "uuid",
  "cohortId": "uuid",
  "title": "Midterm Exam",
  "marksPerQuestion": 2,
  "totalMarks": 20,
  "timerMode": "FIXED_DURATION",
  "durationMinutes": 60,
  "negativeMarking": true,
  "negativeMarksValue": 0.5,
  "createdBy": "teacher-uuid"
}
```

### Exam Session

```
POST   /sessions/start         — Student starts exam
PUT    /sessions/:id/answer    — Save an answer (body: { questionOrder, selectedOption })
POST   /sessions/:id/submit    — Manual submit
GET    /sessions/:id/timer     — Timer info (timeRemainingSeconds, percentageUsed)
GET    /sessions/:id           — Session details
```

**Start session body:**
```json
{ "examId": "uuid", "studentId": "uuid" }
```

Timer auto-expires via Redis keyspace notifications → auto-submits session → queues result calculation.

### Result Engine

```
GET    /results/session/:session_id     — Student's result + answer key PDF URL
GET    /results/exam/:exam_id           — All results for exam (teacher, ranked)
POST   /results/exam/:exam_id/recalculate — Recalculate all results (after dispute accepted)
```

Results include:
- `correctCount`, `wrongCount`, `skippedCount`
- `rawScore`, `negativeDeduction`, `finalScore`, `percentage`
- `rank` (assigned after exam completion)
- `answerKeyUrl` — path to generated PDF

### Dispute Manager

```
POST   /disputes                        — Raise dispute (student, exam must be COMPLETED)
GET    /disputes/exam/:exam_id          — All disputes for exam (teacher)
GET    /disputes/student?student_id=    — Student's own disputes
GET    /disputes/:id                    — Single dispute
PATCH  /disputes/:id/resolve            — Resolve (teacher)
PATCH  /disputes/:id/status             — Update status (UNDER_REVIEW)
```

**Resolve body:**
```json
{
  "status": "ACCEPTED",
  "teacherNote": "The question was ambiguous",
  "resolvedBy": "teacher-uuid",
  "newCorrectOption": "B"
}
```
ACCEPTED disputes trigger full exam result recalculation.

## Key Design Decisions

### Question History (No-Repeat Logic)
The `exam_history` table tracks which questions were used per `(subject_id, cohort_id)` pair. When generating a new exam, already-used questions are excluded. If not enough fresh questions exist, the history is **automatically reset** (with a warning log) and all questions become available again.

### Timer Architecture
- Redis key: `session:{uuid}:timer` with TTL = exam duration in seconds
- Expiry detected via Redis keyspace notifications (`KEA` flag)
- Fallback: polling every 30 seconds if keyspace notifications unavailable
- Expired sessions auto-submit and queue a result calculation job

### Answer Key PDF
- Generated by Puppeteer (headless Chromium)
- Shows each question, all 4 options, correct answer (green), student's answer (red if wrong)
- Saved to `/uploads/answer-keys/{examId}/{studentId}.pdf`
- Accessible via `answerKeyUrl` in the result

### BullMQ Queues
- Queue name: `result-calculation`
- Backed by Redis
- Workers run inside `result-engine` service
- Jobs: `{ sessionId, examId, studentId }`

### Security
- JWT verified at API Gateway for all routes except `/auth/*` and `/health`
- Correct answers (`correctOption`) are stripped from all student-facing responses
- Rate limiting: 100 requests/minute per IP

## Data Flow

```
Teacher creates exam → generates questions (history-aware) → activates exam
Student starts session → Redis timer set → answers saved
Timer expires OR student submits → BullMQ job queued
Result worker calculates score → generates PDF → saves result
Teacher marks exam COMPLETED → ranks assigned
Student raises dispute → teacher resolves → recalculation triggered
```

## Development

Each service can be run independently:

```bash
cd services/question-bank
npm install
npm run dev
```

Copy `.env.example` to `.env` and adjust URLs for local development.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| DATABASE_URL | — | PostgreSQL connection string |
| REDIS_URL | redis://localhost:6379 | Redis connection URL |
| JWT_SECRET | — | JWT signing secret (change in production!) |
| PORT | varies | Service port |
| UPLOADS_PATH | ./uploads | PDF storage path (result-engine) |
| PUPPETEER_EXECUTABLE_PATH | system default | Chromium path in Docker |
