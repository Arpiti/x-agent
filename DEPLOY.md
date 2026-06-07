# Deploy to GCP Cloud Run

## Prerequisites
- GCP project created
- `gcloud` CLI installed and authenticated
- Docker installed locally (for testing)

---

## Step 1 — Get your Telegram credentials

1. Create a bot: message @BotFather on Telegram → `/newbot` → get your `TELEGRAM_BOT_TOKEN`
2. Get your personal chat ID: message @userinfobot on Telegram → it replies with your numeric `id`
3. Start a conversation with your new bot (just send `/start`) so it can message you

---

## Step 2 — Set up GCP Secret Manager

```bash
export PROJECT_ID=your-gcp-project-id
export REGION=asia-south1   # Mumbai — closest to Gurugram

# Enable required APIs
gcloud services enable run.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com --project=$PROJECT_ID

# Store secrets
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --project=$PROJECT_ID
echo -n "YOUR_BOT_TOKEN" | gcloud secrets create TELEGRAM_BOT_TOKEN --data-file=- --project=$PROJECT_ID
echo -n "YOUR_CHAT_ID" | gcloud secrets create TELEGRAM_CHAT_ID --data-file=- --project=$PROJECT_ID
echo -n "$(openssl rand -hex 32)" | gcloud secrets create SCHEDULER_SECRET --data-file=- --project=$PROJECT_ID
```

---

## Step 3 — Build and push Docker image

```bash
export IMAGE=asia-south1-docker.pkg.dev/$PROJECT_ID/x-agent/x-agent:latest

# Create Artifact Registry repo (once)
gcloud artifacts repositories create x-agent \
  --repository-format=docker \
  --location=asia-south1 \
  --project=$PROJECT_ID

# Authenticate Docker
gcloud auth configure-docker asia-south1-docker.pkg.dev

# Build and push (--platform required when building on Apple Silicon)
docker build --platform linux/amd64 -t $IMAGE .
docker push $IMAGE
```

---

## Step 4 — Deploy to Cloud Run

```bash
gcloud run deploy x-agent \
  --image=$IMAGE \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --max-instances=1 \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,TELEGRAM_BOT_TOKEN=TELEGRAM_BOT_TOKEN:latest,TELEGRAM_CHAT_ID=TELEGRAM_CHAT_ID:latest,SCHEDULER_SECRET=SCHEDULER_SECRET:latest" \
  --project=$PROJECT_ID
```

Note the deployed URL — looks like `https://x-agent-xxxxx-el.a.run.app`

---

## Step 5 — Set WEBHOOK_DOMAIN and redeploy

```bash
export CLOUD_RUN_URL=https://x-agent-xxxxx-el.a.run.app  # your actual URL

gcloud run services update x-agent \
  --region=$REGION \
  --set-env-vars="WEBHOOK_DOMAIN=$CLOUD_RUN_URL" \
  --project=$PROJECT_ID
```

---

## Step 6 — Create Cloud Scheduler jobs (3x daily, IST = UTC+5:30)

```bash
# Get your scheduler secret to put in the auth header
export SECRET=$(gcloud secrets versions access latest --secret=SCHEDULER_SECRET --project=$PROJECT_ID)

# 8:00 AM IST = 02:30 UTC
gcloud scheduler jobs create http x-agent-morning \
  --location=$REGION \
  --schedule="30 2 * * *" \
  --uri="$CLOUD_RUN_URL/scheduler/trigger" \
  --http-method=POST \
  --headers="Authorization=Bearer $SECRET,Content-Type=application/json" \
  --message-body="{}" \
  --project=$PROJECT_ID

# 7:00 PM IST = 13:30 UTC
gcloud scheduler jobs create http x-agent-evening \
  --location=$REGION \
  --schedule="30 13 * * *" \
  --uri="$CLOUD_RUN_URL/scheduler/trigger" \
  --http-method=POST \
  --headers="Authorization=Bearer $SECRET,Content-Type=application/json" \
  --message-body="{}" \
  --project=$PROJECT_ID

# 11:00 PM IST = 17:30 UTC
gcloud scheduler jobs create http x-agent-night \
  --location=$REGION \
  --schedule="30 17 * * *" \
  --uri="$CLOUD_RUN_URL/scheduler/trigger" \
  --http-method=POST \
  --headers="Authorization=Bearer $SECRET,Content-Type=application/json" \
  --message-body="{}" \
  --project=$PROJECT_ID
```

---

## Step 7 — Test it

```bash
# Manually trigger a scheduled run
gcloud scheduler jobs run x-agent-morning --location=$REGION --project=$PROJECT_ID

# Or hit the endpoint directly
curl -X POST $CLOUD_RUN_URL/scheduler/trigger \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json"
```

You should receive 3 draft posts in your Telegram within ~10 seconds.

---

## Local development

```bash
cp .env.example .env
# fill in your values — leave WEBHOOK_DOMAIN empty for polling mode

npm install
npm run start:dev
```

Then message your bot on Telegram: `/generate` or `/generate system design caching`

---

## Updating the Voice Style Guide

Edit `src/content/prompts/voice-guide.ts`, rebuild and redeploy:
```bash
docker build --platform linux/amd64 -t $IMAGE . && docker push $IMAGE
gcloud run services update x-agent --image=$IMAGE --region=$REGION --project=$PROJECT_ID
```
