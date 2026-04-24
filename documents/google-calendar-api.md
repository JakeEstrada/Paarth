# Google Calendar API Integration

This page explains how Google Calendar integration is currently implemented, how events are created, and how this differs from Google Calendar UI/templates.

## Short Answer to "Is this a Google template page?"

No. The app uses a **custom React calendar UI** (`frontend/src/pages/CalendarPageNew.jsx`) and optionally syncs jobs to Google Calendar via backend API calls.

It is not embedding Google Calendar as a page template. It is your own calendar UX with optional Google event mirroring.

## Architecture Overview

### Frontend

- Main UI: `frontend/src/pages/CalendarPageNew.jsx`
- Schedules jobs by patching `Job.schedule` via `PATCH /jobs/:id`
- After saving schedule, it attempts background sync:
  - `POST /calendar/jobs/:jobId/sync`
- On schedule removal, it attempts:
  - `DELETE /calendar/jobs/:jobId/sync`

### Backend

- Routes: `backend/src/routes/calendar.js`
- Controller: `backend/src/controllers/calendarController.js`
- Uses `googleapis` package and OAuth2 client
- Sync endpoints are protected by `requireAuth`

## Google API Configuration

`calendarController.getCalendarClient()` requires:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- optional `GOOGLE_REDIRECT_URI` (defaults to `http://localhost:4000/calendar/auth/callback`)
- `GOOGLE_REFRESH_TOKEN` for server-side event writes

If credentials are missing, calendar sync returns `503` with "Google Calendar not configured".

## Event Creation / Update Flow

When frontend calls `POST /calendar/jobs/:jobId/sync`:

1. Backend loads job and customer details.
2. Validates that job has `schedule.startDate`.
3. Builds all-day Google event payload:
   - summary from schedule title/job title
   - description includes customer, value, installers
   - start/end dates (all-day event format)
4. Supports recurrence via RRULE when schedule recurrence is set.
5. If `job.calendar.googleEventId` exists:
   - tries `calendar.events.update`
   - if event missing (404), falls back to creating a new one
6. If no prior event id:
   - calls `calendar.events.insert`
7. Stores sync metadata on `job.calendar`:
   - `googleEventId`
   - `calendarStatus`
   - `lastSyncedAt`

## Event Delete Flow

When frontend calls `DELETE /calendar/jobs/:jobId/sync`:

1. Backend verifies job + existing `googleEventId`.
2. Calls `calendar.events.delete`.
3. Clears Google linkage fields in `job.calendar`.

## OAuth Flow Endpoints

- `GET /calendar/auth-url` -> returns Google consent URL.
- `GET /calendar/auth/callback` and `GET /calendar/auth/google/callback`
  - exchanges OAuth code for tokens
  - returns `refresh_token` in response for manual env placement.

Current behavior is operational but manual (token returned to caller rather than persisted securely in a token store).

## How Calendar Functions Inside Paarth

- Scheduling source of truth is MongoDB `Job.schedule`.
- Calendar page renders jobs from `/jobs` and schedule fields.
- Supports:
  - multiple installer/date entries (`schedule.entries`)
  - recurrence metadata
  - bench vs scheduled workflow
  - optional kiosk-style lock behaviors in UI
- Google sync is a secondary external mirror, not primary source of truth.

## Current Limitations

1. Sync is one-way (Paarth -> Google)
- No inbound webhook or pull-sync from Google back into app schedules.

2. One calendar target
- Uses `calendarId: 'primary'`; no per-user/per-tenant calendar selection UI.

3. Manual refresh-token management
- OAuth callback returns token; operator must place it in env.

4. Partial failure model
- Job schedule save can succeed while Google sync fails (by design).

## Recommended Next Improvements

### Priority

- Store OAuth credentials per tenant securely instead of global env token.
- Add sync status panel in calendar UI (last success/error reason).
- Add explicit "Retry Google sync" action for a job.

### Advanced

- Add bidirectional sync option (with conflict strategy).
- Add webhook support for Google event deletions/updates.
- Add calendar target selector (team calendar vs personal calendar).
- Add service-account or delegated auth model if org policy requires centralized ownership.
