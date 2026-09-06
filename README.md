# Reflect & Journal AI

A user-authenticated web application integrating the **Gemini 3.6 Flash API** with **Cloud Firestore** and **Firebase Authentication**. The application enables users to write multi-turn journal entries and mindful reflections, receive AI-generated insights and summaries, and securely persist all interactions in isolated per-user Firestore documents.

---

## Architecture Overview

- **User Identity**: Firebase Authentication with Google Sign-In (no custom password storage or exposure).
- **Database & State**: Cloud Firestore utilizing user-isolated paths (`/users/{userId}/interactions/{interactionId}`) with strict owner-bound security rules.
- **AI Processing Engine**: Gemini 3.6 Flash API via an Express backend proxy, implemented with an automated multi-model fallback ladder (`gemini-3.6-flash` &rarr; `gemini-3.1-flash-lite` &rarr; `gemini-flash-latest` &rarr; `gemini-3.7-flash`).
- **Secret Management**: Google Cloud Secret Manager / environment variables to keep `GEMINI_API_KEY` hidden from client JavaScript.
- **Frontend & Styling**: React 19, TypeScript, Tailwind CSS, Lucide icons, and Motion transitions.

---

## 1. Prerequisites & Environment Setup

Ensure the Google Cloud CLI (`gcloud`) and Firebase CLI are installed and authenticated:

```bash
# Authenticate gcloud CLI
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required Google Cloud APIs
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
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Retrieve your project number
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# Grant the default Cloud Run Compute service account access to read the secret
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 3. Database Security Configuration (Cloud Firestore)

Deploy the owner-bound security rules in `firestore.rules` to enforce strict isolation between users:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Deploy the rules using the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

---

## 4. Local Development

```bash
# Install dependencies
npm install

# Configure environment variables (.env)
cp .env.example .env
# Ensure GEMINI_API_KEY is configured in .env

# Run development server (starts unified Express + Vite server on http://localhost:3000)
npm run dev
```

---

## 5. Google Cloud Run Deployment

Build and deploy the application container to Cloud Run:

```bash
# Build and deploy directly from source
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

## Threat Model & Security Mitigations

| Threat Zone | Risk | Countermeasure |
| :--- | :--- | :--- |
| **Input Surfaces** | Malicious injection or oversized prompts | Strict length boundaries and null-safe payload parsing. |
| **Planning & Reasoning** | Prompt injection hijacking the reflection persona | Sandboxed system instruction isolating reflection prompts as plain user data. |
| **Tool Execution & APIs** | API key extraction in client browser | Server-side Express proxy; `GEMINI_API_KEY` never sent to the browser. |
| **Memory & State** | Cross-user journal leaks | Owner-bound Firestore security rules (`request.auth.uid == userId`). |
| **Inter-System Comms** | Unhandled driver serialization exceptions | Recursive undefined-value stripping on all database payloads. |
