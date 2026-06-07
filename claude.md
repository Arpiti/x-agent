# X Agent — CLAUDE.md

Personal X content agent for @iamArpitRai. NestJS + Gemini API + Telegram.
Generates 3 post drafts (in Arpit's voice, optimised for X algorithm signals) and delivers via Telegram.
Arpit manually picks one and posts. No auto-posting.

---

## Stack

- **Runtime**: Node 20, NestJS 10, TypeScript
- **AI**: Google Generative AI SDK (`gemini-2.5-flash`, configurable via `GEMINI_MODEL` env var)
- **Bot**: Telegraf 4 (webhook in prod, polling in dev)
- **Hosting**: GCP Cloud Run (always-on webhook) + Cloud Scheduler (3x daily trigger)
- **Secrets**: GCP Secret Manager

---

## Project Structure

```
src/
  main.ts                          # Entry point, listens on $PORT
  app.module.ts                    # Root module
  config/
    configuration.ts               # Env var schema — all config lives here
  content/
    content.service.ts             # Core: calls Claude, returns DraftBatch
    content.module.ts
    prompts/
      voice-guide.ts               # Arpit's voice, pillars, rules — edit this to tune output
      algorithm-context.ts         # X algorithm signals and weights — rarely needs changing
  telegram/
    telegram.service.ts            # Bot init (webhook/polling), command handlers, sendDrafts()
    telegram.controller.ts         # POST /telegram/webhook — receives Telegram updates
    telegram.module.ts
  scheduler/
    scheduler.controller.ts        # POST /scheduler/trigger — called by Cloud Scheduler
    scheduler.module.ts
```

---

## Environment Variables

```
ANTHROPIC_API_KEY        Claude API key
TELEGRAM_BOT_TOKEN       From @BotFather
TELEGRAM_CHAT_ID         Arpit's personal chat ID (from @userinfobot)
WEBHOOK_DOMAIN           Cloud Run URL — if set, uses webhook; if empty, uses polling (local dev)
SCHEDULER_SECRET         Shared secret for /scheduler/trigger auth (Bearer token)
PORT                     Set automatically by Cloud Run; defaults to 3000
```

---

## Dev Commands

```bash
npm install
cp .env.example .env        # fill in keys
npm run start:dev           # polling mode, hot reload

npm run build               # compile to dist/
npm start                   # run compiled output
```

---

## How Draft Generation Works

`ContentService.generateDrafts(topic?, pillar?)`:

1. If no pillar → round-robin through `['build_story', 'system_design', 'propertygauss']`
2. If no topic → random seed from `PILLAR_TOPIC_SEEDS[pillar]`
3. Sends `VOICE_GUIDE + ALGORITHM_CONTEXT` as system prompt
4. Returns `DraftBatch`: 3 drafts — 1 thread (dwell_driver), 2 singles (reply_driver, follow_driver)
5. JSON parsed from Claude response, strips markdown fences if present

Telegram commands:
- `/generate` → agent picks pillar + topic
- `/generate [topic]` → agent uses provided topic, auto-picks pillar

Scheduled trigger: Cloud Scheduler hits `POST /scheduler/trigger` with `Authorization: Bearer $SCHEDULER_SECRET` at 8AM / 7PM / 11PM IST.

---

## Tuning the Output

**To improve voice quality** → edit `src/content/prompts/voice-guide.ts`
- Add real tweet examples under each pillar once archive arrives
- Tighten sentence pattern observations
- Add topics to `PILLAR_TOPIC_SEEDS` in `content.service.ts`

**To change posting schedule** → update Cloud Scheduler jobs (see DEPLOY.md)
- 8AM IST = cron `30 2 * * *`
- 7PM IST = cron `30 13 * * *`
- 11PM IST = cron `30 17 * * *`

**To change Claude model** → `config/configuration.ts` → `anthropic.model`

---

## Planned Extensions (not yet built)

### TrendsModule
Fetch trending topics, pass as context to ContentService.
Hook: `ContentService.generateDrafts()` accepts optional `trendingContext?: string`.
Possible sources: Twitter Trends API (needs Elevated access), Google Trends RSS, NewsAPI.

### AnalyticsModule
Track which draft Arpit picks (add inline keyboard buttons to Telegram message: "Using Draft 1/2/3").
Log choices to Firestore or a simple JSON file.
Feed pick history back into the prompt after enough data accumulates.

### VoiceModule
API endpoint to update voice guide without redeploying.
Store guide in Firestore, load at runtime instead of from static file.

---

## Deployment (summary — full steps in DEPLOY.md)

```bash
# Build and push image
docker build -t asia-south1-docker.pkg.dev/$PROJECT_ID/x-agent/x-agent:latest .
docker push asia-south1-docker.pkg.dev/$PROJECT_ID/x-agent/x-agent:latest

# Deploy
gcloud run deploy x-agent --image=... --region=asia-south1 ...

# Test scheduled trigger manually
gcloud scheduler jobs run x-agent-morning --location=asia-south1
```

---

## Key Decisions & Rationale

- **No X API for posting** — keeps it simple, Arpit reviews every post, avoids API rate limits and costs
- **Cloud Run over Cloud Functions** — webhook requires persistent HTTP endpoint; Cloud Run handles it cleanly
- **Cloud Scheduler → HTTP endpoint** (not @nestjs/schedule) — Cloud Run may scale to zero; external trigger is more reliable
- **Scheduler secret via Bearer token** — simple, no IAM complexity, rotatable without redeploying
- **Round-robin pillar rotation** — prevents the agent from defaulting to one topic type repeatedly
- **JSON response from Claude** — structured output makes parsing reliable; fences stripped defensively