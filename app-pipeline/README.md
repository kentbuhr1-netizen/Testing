# App Support & Monitoring Pipeline

An automated pipeline that monitors app store reviews and crash reports
across BeckantLabs' mobile games, triages issues, drafts/sends responses,
and routes bugs into a fix loop — with human approval gates before anything
ships or auto-sends in ambiguous cases.

This is a standalone project (own `package.json`, own database, own server)
— it is not one of the games under `games/` and isn't subject to their
no-dependency / no-build-step constraints.

Full design: see the build spec this was scaffolded from.

## Status

Scaffolded through **step 2** of the build order:

1. ✅ Scaffolding — Express server, SQLite schema, `/api/queue` route
2. ✅ Store Monitor — polls App Store Connect + Google Play for reviews and
   queues new ones, on a 6-hour cron
3. ⬜ Dashboard
4. ⬜ Triage agent
5. ⬜ Responder agent
6. ⬜ Auto-send
7. ⬜ Fixer agent
8. ⬜ Orchestrator + voice briefing

## Setup

```bash
cp .env.example .env   # fill in store API credentials
npm install
npm test                # runs against an in-memory DB, no credentials needed
npm start                # http://localhost:4100
```

Requires Node 22.5+ (uses the built-in `node:sqlite` module — no native
dependency to compile).

### Tracking an app

Store Monitor only polls apps present in the `apps` table. Add one directly
against the database, e.g.:

```bash
sqlite3 db/pipeline.sqlite \
  "INSERT INTO apps (name, platform, store_id) VALUES ('Outbreak', 'ios', '<App Store Connect app id>');"
```

Platform is `'ios'` (App Store Connect) or `'android'` (Google Play). Without
matching credentials in `.env`, Store Monitor logs an error to `activity_log`
for that app and moves on — it never crashes the whole poll.

## API

- `GET /api/queue` — list queue items (`?status=` / `?app_id=` filters)
- `GET /api/queue/:id` — one item plus its triage/response/fix history

## Notes

- `queue_items` has a unique index on `(app_id, source, external_id)` so a
  re-poll never queues the same review twice — that isn't in the spec's
  literal SQL but is required for "polls on a schedule" to be safe.
- Every agent run writes to `activity_log`, per the spec, so a later
  dashboard/voice-briefing endpoint has one table to read.
