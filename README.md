# Reflect & Journal AI

A production-grade, privacy-first mindfulness journaling and cognitive reflection application powered by the **Gemini 3.6 Flash API**, **Firebase Authentication**, and **Cloud Firestore**. The application provides multi-turn conversational journaling, real-time structured metadata extraction, interactive energy tracking over time, and weekly AI syntheses—all secured behind strict per-user database isolation and robust server-side API boundaries.

---

## Key Features

- **Multi-Turn Mindful Journaling**: Conversational reflection with Gemini across customizable modes (*Reflect*, *Summarize*, *Brainstorm*).
- **Automated Insights & Metadata Extraction**: Server-side structured analysis extracting:
  - **Dominant Mood**: Classified as `positive`, `neutral`, `negative`, or `mixed`.
  - **Energy Level**: Graded on a standardized 1–5 scale (1: Drained to 5: Vibrant).
  - **Cognitive Themes**: 1–3 concise lowercase topic keywords for pattern tracking.
- **Visual Analytics**: Interactive energy trend line charts via Recharts, frequency breakdown of recurring themes, and mood distribution metrics.
- **Weekly Reflective Synthesis**: On-demand AI synthesis evaluating the user's past 7 days of reflections (capped at 50 documents, isolated per user) to highlight emotional rhythms, energy patterns, and mindful takeaways.
- **Zero-Crash Resilient Architecture**: Non-blocking background extraction, comprehensive schema fallback validation, recursive `undefined`-stripping for Firestore writes, and a multi-model fallback ladder (`gemini-3.6-flash` → `gemini-3.1-flash-lite` → `gemini-flash-latest` → `gemini-3.7-flash`).

---

## Threat Modeling & Security Architecture

### Comprehensive Threat Summary Table

| Threat Zone | Identified Threat | Countermeasure & Security Implementation |
| :--- | :--- | :--- |
| **Input Surfaces** | Malicious injection payloads, excessively large inputs, or adversarial text in journal entries. | Strict server-side length boundaries; inputs truncated before entering prompts; schema-enforced payload extraction; `null`-safe destructuring on all Express route handlers. |
| **Planning & Reasoning** | Prompt injection attacks aiming to hijack the system persona or break output structures. | Sandboxed system instructions treating reflections as pure data; enforced structured JSON output via `responseMimeType: "application/json"` and `@google/genai` `responseSchema`. |
| **Tool Execution & APIs** | API key leakage in client browser bundles or SSRF risks. | Default full-stack architecture with an Express backend proxy; `GEMINI_API_KEY` is strictly managed server-side and never exposed to the client application. |
| **Memory & State (Firestore)** | Cross-user data leakage, unauthorized reads/writes, or Firestore serialization crashes. | Strict owner-bound Firestore security rules (`request.auth.uid == userId`); recursive sanitization stripping all `undefined` values before writes; operations scoped strictly to `/users/{userId}/interactions/{interactionId}`. |
| **Inter-System Communication** | Upstream Gemini API credit exhaustion (429), latency, or transient service degradation. | Non-blocking asynchronous extraction workflow that never blocks saving entries; multi-tier model fallback ladder with local offline analytical synthesis when upstream quotas are depleted. |

---

## 1. Prerequisites & Environment Setup

Ensure you have the Google Cloud CLI (`gcloud`) and Firebase CLI installed and authenticated:

```bash
# Log in to Google Cloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable the required Google Cloud APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  artifactregistry.googleapis.com
```

---

## 2. Secret Management Setup

Store your Gemini API key in **Google Cloud Secret Manager** and grant access to the Cloud Run runtime service account:

```bash
# Create and populate the secret in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Retrieve your project number
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# Grant the default Cloud Run service account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Database Security Configuration (Cloud Firestore)

The application enforces user data isolation through owner-bound rules in `firestore.rules`.

### Exact Deployed Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Isolated user-specific data and interactions
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /{allSubcollections=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Deploying the Rules via Firebase CLI

```bash
firebase deploy --only firestore:rules
```

---

## 4. Local Development & Configuration

```bash
# 1. Install dependencies
npm install

# 2. Configure local environment variables
cp .env.example .env
# Edit .env and supply your GEMINI_API_KEY for local server testing

# 3. Start unified development server (Express + Vite on http://localhost:3000)
npm run dev
```

---

## 5. Google Cloud Run Deployment Flow

Build and deploy the application container directly to Cloud Run:

```bash
# Deploy to Google Cloud Run
gcloud run deploy reflect-journal-ai \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --port 3000
```

---

## 6. Required Campaign Verification Binding

Apply the mandatory challenge label to register your Cloud Run service for automated challenge verification:

```bash
gcloud run services update reflect-journal-ai \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 7. Functional Walkthrough & Verification Guide

| Test Scenario | Action Performed | Expected Functional Outcome |
| :--- | :--- | :--- |
| **User Authentication** | Click **Sign In with Google**. | Authenticates via Firebase Auth popup and directs user to their private canvas; no credentials stored in custom application code. |
| **Journal Reflection** | Compose a reflection in *Reflect* mode and submit. | Multi-turn response streams back from Gemini 3.6 Flash; entry and AI reply are persisted immediately to `/users/{userId}/interactions/{id}`. |
| **Structured Metadata Extraction** | Submit a journal entry expressing high energy and positivity. | Server extracts `{ mood: "positive", energy: 5, themes: [...] }` asynchronously and updates the interaction document without blocking UI interaction. |
| **Insights Dashboard** | Switch to the **Insights** tab. | Renders interactive Recharts energy trend line, frequent theme pills with count badges, and mood distribution totals. |
| **Weekly Synthesis** | Click **Generate Weekly Synthesis**. | Queries the past 7 days of entries (capped at 50 documents) and outputs an empathetic markdown synthesis with actionable takeaways. |
| **Quota Resilience** | Simulate API credit exhaustion or 429 response. | System falls back gracefully to secondary models or generates an offline analytical synthesis without crashing or dropping user data. |
