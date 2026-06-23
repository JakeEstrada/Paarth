# Backend API map

Base URL: `VITE_API_URL` (e.g. `http://localhost:4000`). Most routes are also mounted under `/api/…` for hosts that prefix the path.

All routes below require `Authorization: Bearer <token>` unless noted.

## Auth (`/auth`)

| Method | Path | Controller | Notes |
|--------|------|------------|-------|
| POST | `/login` | authController | Returns accessToken + user |
| POST | `/register` | authController | New user signup |
| GET | `/me` | authController | Current user profile |
| POST | `/forgot-password` | authController | Email reset link (EmailJS) |
| POST | `/reset-password` | authController | Token + new password |
| POST | `/forgot-username` | authController | Username reminder |

## Jobs (`/jobs`)

Core pipeline resource.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List jobs (filters: stage, search, pagination) |
| POST | `/` | Create job |
| GET | `/:id` | Single job with customer/notes |
| PATCH | `/:id` | Update fields |
| POST | `/:id/move-stage` | Stage transition + activity log |
| POST | `/:id/archive` | Archive job |
| GET | `/pipeline/summary` | Counts per stage |
| GET | `/archive`, `/completed`, `/dead-estimates` | Non-active collections |

## Customers (`/customers`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Paginated list |
| GET | `/global-search` | Header search + AI assistant |
| GET | `/:id` | Detail + related data |
| POST | `/` | Create |
| PATCH | `/:id` | Update |
| POST | `/upload-csv` | Bulk import |

## Activities (`/activities`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/recent` | Dashboard feed |
| GET | `/date-range` | Filtered log |
| POST | `/summary` | AI activity summary (date range or `{ jobId }`) |
| POST | `/job/:jobId/summary` | AI single-job summary |
| GET | `/job/:jobId` | Job activity list |

## Tasks (`/tasks`), Appointments (`/appointments`)

CRUD with optional `jobId` / `customerId` links.

## Files (`/files`)

Upload, download, list by job/customer/task. Production uses S3 when configured.

## Calendar (`/calendar`)

Google Calendar OAuth and sync helpers.

## Estimates, invoices, contracts (`/estimates`, `/invoices`, `/contracts`)

Finance Hub document lifecycle.

## Twilio (`/twilio`)

SMS send, schedule, inbound webhooks, message list.

## Plaid (`/plaid`)

Bank linking and register data for Finance Hub.

## Tenants (`/tenants`)

Branding logos, estimate document settings. `GET /branding/:tenantId/logo` is public.

## Assistant (`/assistant`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/chat` | Tool-calling AI help (search, navigate) |

## RFID (`/rfid`)

Device API key auth for Raspberry Pi scans; human UI uses JWT routes for list/tags.

## Pipeline layouts (`/pipeline-layouts`)

Saved column layouts per tenant for the kanban board.

## Middleware order (server.js)

1. CORS + JSON parser  
2. Static `/uploads`  
3. Tenant resolution (`x-tenant-id` / slug)  
4. Route handlers  
5. 404 / error handler  

## Models directory

`backend/src/models/` — Mongoose schemas. Most business collections use `tenantScopePlugin` for automatic `tenantId` filtering.

## Controllers directory

`backend/src/controllers/` — One file per domain; keep HTTP concerns here, not in routes.
