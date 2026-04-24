# Socket.IO Real-Time Feedback

This page explains how real-time updates are implemented in Paarth using Socket.IO.

## Overview

The app uses Socket.IO for lightweight, room-based event fanout so pages (notably calendar/project views) refresh quickly when jobs/tasks are created or updated.

## Backend Real-Time Stack

### Server bootstrap

- Socket server is initialized in `backend/src/server.js` via:
  - `initializeSocketServer(httpServer)`
- The `io` instance is attached to Express app:
  - `app.set('io', io)`

### Socket server implementation

- File: `backend/src/services/socketServer.js`
- CORS origins mirror API CORS logic.
- Supports optional JWT socket auth:
  - reads token from `handshake.auth.token` or auth header
  - verifies with `JWT_SECRET`
  - stores `socket.data.userId` / `socket.data.tenantId` when valid
- Invalid/missing token does not hard-fail connection (non-sensitive subscriptions still allowed).

### Room model

Allowed room formats:

- `tenant:<tenantId>`
- `project:<projectId>`
- `task:<taskId>`
- `user:<userId>` (restricted so user can only join own user room)

Client events:

- `subscribe` -> server validates and joins room
- `unsubscribe` -> leaves room

## Event Publishing Layer

File: `backend/src/services/eventBus.js`

Helper methods publish to scoped rooms:

- `publishProjectCreated`
- `publishProjectUpdated`
- `publishTaskCreated`
- `publishTaskUpdated`

Emit strategy:

- emit to entity room (`project:<id>`, `task:<id>`)
- additionally emit to tenant room (`tenant:<tenantId>`) when available

## Frontend Subscription Flow

### Socket client singleton

- File: `frontend/src/services/socket.js`
- Creates one socket instance via `socket.io-client`.
- Sends auth token using `auth` callback.
- Uses websocket/polling transports.

### React subscription hook

- File: `frontend/src/hooks/useSocketSubscription.js`
- On mount:
  - emits `subscribe` with room key
  - binds handler to event name
- On cleanup:
  - unbinds handler
  - emits `unsubscribe`

### Example usage

- `frontend/src/pages/CalendarPageNew.jsx` subscribes to tenant room events:
  - `project.updated`
  - `project.created`
  - `task.updated`
  - `task.created`
- On these events, it calls `fetchJobs()` to refresh displayed scheduling state.

## Current Characteristics

1. Real-time is event-notification based
- Client receives update signal, then refetches canonical data via REST.
- This avoids overloading socket payload schema complexity.

2. Multi-tenant fanout supported
- Tenant room structure allows per-tenant real-time isolation.

3. Soft auth mode on sockets
- Connection may succeed without valid token; room-join validation limits unsafe cases but this is not strict auth-only mode.

## Recommended Next Improvements

### Security and correctness

- Enforce strict auth for socket connections used in production.
- Validate tenant membership before joining `tenant:<id>` rooms.
- Add server-side rate limits / flood protection for subscribe events.

### Reliability and scalability

- Add acknowledgement and retry patterns for critical events.
- Add Redis adapter if horizontally scaling multiple Node instances.
- Add event versioning and typed payload contracts.

### Observability

- Add metrics for connection count, room count, and emit rate.
- Add structured logs for subscribe/unsubscribe denials.
