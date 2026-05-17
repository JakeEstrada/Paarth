# Paarth RFID Integration Guide

This document describes how **RFID tag scans** from a **Raspberry Pi + MFRC522** reader are logged in **Paarth** with a **human-readable name** and **timestamp**. Use this file when asking ChatGPT (or another assistant) for help extending, debugging, or deploying the integration.

---

## 1. What problem this solves

- The MFRC522 reader outputs a **tag UID** (a string of numbers separated by dashes, e.g. `142-1-4-200-91`). It is **not** automatically a person’s name.
- Paarth stores:
  1. **Tag registry** — map `UID → display name` (e.g. `Jake`, `Shop door`, `Truck keys`).
  2. **Scan log** — every time a tag is read: **name**, **UID**, **timestamp**, optional device label.

The Pi runs a small Python loop; each successful read **POSTs** the UID to the Paarth API. The server resolves the name from the registry (or logs `Unknown tag (uid)` until you register it).

---

## 2. Architecture overview

```
┌─────────────────┐     POST /rfid/scans          ┌──────────────────┐
│ Raspberry Pi    │  x-rfid-api-key              │ Paarth backend   │
│ MFRC522 reader  │  x-tenant-id                 │ (Node/Express)   │
│ rfid_to_paarth  │  { uid, scannedAt, ... }     │ MongoDB          │
└─────────────────┘ ────────────────────────────► └────────┬─────────┘
                                                           │
                                                           │ Socket.IO
                                                           │ tenant:<id>
                                                           │ rfid.scan.created
                                                           ▼
┌─────────────────┐     GET /rfid/tags, /rfid/scans      │
│ Paarth web app  │ ◄──── REST (initial load) ───────────┘
│ /rfid page      │ ◄──── WebSocket (live updates)
└─────────────────┘     (JWT + subscribe tenant room)
```

**Multi-tenant:** Every RFID record is scoped to a **tenant** (your shop). The Pi must send `x-tenant-id` with your tenant’s MongoDB ObjectId (24 hex characters).

**Real-time UI:** When a scan is saved, the backend emits `rfid.scan.created` on Socket.IO room `tenant:<tenantId>`. The **RFID scans** page subscribes to that room and prepends new rows without a manual refresh. Tag registry changes emit `rfid.tag.upserted` and `rfid.tag.deleted` for the same room.

---

## 3. Repository file map

| Path | Purpose |
|------|---------|
| `scripts/raspberry-pi/rfid_to_paarth.py` | Pi script: read MFRC522, POST scans to API |
| `backend/src/models/RfidTag.js` | MongoDB: UID → displayName mapping |
| `backend/src/models/RfidScan.js` | MongoDB: individual scan events |
| `backend/src/controllers/rfidController.js` | Business logic; publishes Socket.IO events after writes |
| `backend/src/services/eventBus.js` | `publishRfidScanCreated`, `publishRfidTagUpserted`, `publishRfidTagDeleted` |
| `backend/src/middleware/rfidDeviceAuth.js` | Auth: device API key **or** user JWT |
| `backend/src/routes/rfid.js` | Express routes |
| `backend/src/services/socketServer.js` | Socket.IO server (rooms, subscribe/unsubscribe) |
| `frontend/src/pages/RfidPage.tsx` | UI: register tags, live scan log, **Live** badge |
| `frontend/src/hooks/useSocketSubscription.js` | React hook: subscribe to tenant room + event |
| `frontend/src/services/socket.ts` | Socket.IO client singleton |
| `frontend/src/App.tsx` | Route: `/rfid` |
| `frontend/src/components/layout/Sidebar.tsx` | Nav: **RFID scans** |

Routes are mounted at **both** `/rfid` and `/api/rfid` (same as other Paarth APIs).

---

## 4. Hardware (Raspberry Pi + MFRC522)

Typical wiring uses SPI (common tutorials). Python libraries:

```bash
pip install mfrc522 RPi.GPIO requests
```

Minimal read loop (without Paarth) — your starting point:

```python
from mfrc522 import MFRC522
import RPi.GPIO as GPIO
import time

reader = MFRC522()
last_uid = None

try:
    print("RFID ready. Scan a tag...")
    while True:
        status, tag_type = reader.MFRC522_Request(reader.PICC_REQIDL)
        if status == reader.MI_OK:
            status, uid = reader.MFRC522_Anticoll()
            if status == reader.MI_OK:
                uid_string = "-".join(str(x) for x in uid)
                if uid_string != last_uid:
                    print(f"RFID UID: {uid_string}")
                    last_uid = uid_string
        else:
            last_uid = None
        time.sleep(0.1)
except KeyboardInterrupt:
    print("Stopping")
finally:
    GPIO.cleanup()
```

**UID format in Paarth:** The Pi script sends UIDs exactly as `"-"`.joined decimal bytes (e.g. `142-1-4-200-91`). Register tags in Paarth using the **same string**.

---

## 5. Environment variables

### 5.1 Backend (server / Render / `backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `RFID_DEVICE_API_KEY` | **Yes** (for Pi) | Long random secret. Pi sends this in header `x-rfid-api-key`. Must match on server and Pi. |
| `MONGODB_URI` | Yes | Standard Paarth DB |
| `JWT_SECRET` | Yes | Standard Paarth auth |

Generate a key example:

```bash
openssl rand -hex 32
```

Add to README-style env block:

```env
RFID_DEVICE_API_KEY=your_long_random_secret_here
```

**Redeploy the backend** after setting or changing this variable.

### 5.2 Raspberry Pi

| Variable | Required | Description |
|----------|----------|-------------|
| `PAARTH_API_URL` | Yes | Base URL, no trailing slash — see **§5.2.1** for which host to use |
| `PAARTH_TENANT_ID` | Yes | 24-char Mongo ObjectId for your tenant |
| `RFID_DEVICE_API_KEY` | Yes | Same value as server `RFID_DEVICE_API_KEY` |
| `RFID_DEVICE_LABEL` | No | Default `raspberry-pi`; stored on each scan |
| `RFID_DEBOUNCE_SECONDS` | No | Default `2`; avoids duplicate logs while card is held |

Example `~/.paarth-rfid.env` on the Pi:

```bash
export PAARTH_API_URL="https://your-production-api.example.com"
export PAARTH_TENANT_ID="507f1f77bcf86cd799439011"
export RFID_DEVICE_API_KEY="same_secret_as_backend"
export RFID_DEVICE_LABEL="shop-front-desk"
```

Run:

```bash
source ~/.paarth-rfid.env
sudo -E python3 /path/to/Paarth/scripts/raspberry-pi/rfid_to_paarth.py
```

Use **`sudo -E`** when the script needs root for GPIO/SPI: `-E` preserves your `export`ed variables (plain `sudo` drops them).

#### 5.2.1 Choosing `PAARTH_API_URL`

| Where the backend runs | Set `PAARTH_API_URL` to |
|------------------------|-------------------------|
| **Deployed** (Render, Railway, VPS, etc.) | `https://your-production-api-host` (same base URL as production Paarth API) |
| **Dev laptop** on Wi‑Fi, Pi on same network | `http://<laptop-LAN-IP>:4000` — **not** `localhost` |
| **Same machine as the Pi** (unusual) | `http://localhost:4000` |

**Important:** On the Pi, `localhost` always means the Pi itself, not your laptop and not a cloud host. If the backend is deployed, use the public HTTPS URL.

Find the production URL: open live Paarth → DevTools → **Network** → inspect any API request host, or your hosting dashboard (e.g. Render web service URL).

**Deployed backend:** `RFID_DEVICE_API_KEY` must be set in the **hosting provider’s environment** (not only in local `backend/.env`). Redeploy after adding or changing it.

Test from the Pi before running the reader:

```bash
curl -X POST "https://YOUR_DEPLOYED_API/rfid/scans" \
  -H "Content-Type: application/json" \
  -H "x-rfid-api-key: YOUR_SECRET" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -d '{"uid":"test-from-pi","source":"test","deviceLabel":"curl"}'
```

Expect `201` and `{"success":true,"scan":{...}}`.

### 5.3 How to find `PAARTH_TENANT_ID`

1. Log into Paarth in the browser.
2. Open DevTools → **Application** → **Local Storage** for your site.
3. Look for key `tenantId` (24-character hex string).

Alternatively, ask your Paarth admin / database for the `Tenant` document `_id` for your shop.

### 5.4 Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Same backend base URL as `PAARTH_API_URL` (REST **and** Socket.IO client connect here) |

Redeploy the frontend after changing `VITE_API_URL`. Real-time updates require the browser to reach the same API host that emits Socket.IO events.

---

## 6. Paarth web UI

1. Log in to Paarth.
2. Sidebar → **RFID scans** (`/rfid`).
3. Confirm the green **Live** badge next to the title (means the page subscribed to `tenant:<yourTenantId>`).
4. **Register tag**
   - Scan a tag on the Pi once.
   - Copy the UID from the Pi console **or** from **Recent scans** (may show as `Unknown tag (142-1-4-...)`).
   - Enter **Tag UID** + **Name** → **Save mapping**.
5. **Recent scans** lists timestamp, name, UID, source/device.
6. Leave the tab open: new Pi scans appear in the table within about a second (no refresh). Use the refresh icon to reload everything from the API.

**Note:** Registering a tag updates the registry live, but **older** scan rows that already say `Unknown tag (...)` keep that label until you refresh or a **new** scan occurs (names are stored on the scan at read time).

---

## 6.1 Real-time updates (Socket.IO)

Implemented using the same pattern as Pipeline and Calendar (`documents/socketio.md`).

### Flow

1. Pi (or curl) `POST /rfid/scans` → scan saved in MongoDB.
2. `rfidController.recordScan` calls `publishRfidScanCreated(io, scan, { knownTag })`.
3. Event `rfid.scan.created` is emitted to room `tenant:<tenantId>`.
4. `RfidPage` uses `useSocketSubscription(tenantRoom, 'rfid.scan.created', handler)` and prepends the scan (max 200 rows, deduped by `_id`).

Tag registry changes from the UI emit:

| Event | When |
|-------|------|
| `rfid.tag.upserted` | `POST` / `PUT` `/rfid/tags` |
| `rfid.tag.deleted` | `DELETE` `/rfid/tags/:id` |

### Event payloads

**`rfid.scan.created`**

```json
{
  "type": "rfid.scan.created",
  "tenantId": "507f1f77bcf86cd799439011",
  "scan": {
    "_id": "...",
    "uid": "142-1-4-200-91",
    "displayName": "Jake",
    "scannedAt": "2026-05-11T18:30:00.000Z",
    "source": "raspberry-pi",
    "deviceLabel": "shop-front-desk",
    "knownTag": true
  },
  "sourceSocketId": null
}
```

**`rfid.tag.upserted`**

```json
{
  "type": "rfid.tag.upserted",
  "tenantId": "...",
  "tag": { "_id": "...", "uid": "142-1-4-200-91", "displayName": "Jake", "notes": "" },
  "sourceSocketId": "..."
}
```

**`rfid.tag.deleted`**

```json
{
  "type": "rfid.tag.deleted",
  "tenantId": "...",
  "tagId": "...",
  "sourceSocketId": "..."
}
```

Pi posts do not send `x-socket-id`; browser edits may, so other tabs still receive updates.

### Requirements for live UI

- Backend and frontend **deployed** with the RFID Socket.IO changes.
- User logged in; `tenantId` in localStorage matches `PAARTH_TENANT_ID` on the Pi.
- `VITE_API_URL` points at the deployed API (Socket.IO uses that host).
- **RFID scans** page open (subscription is per-page).

---

## 7. HTTP API reference

Base paths: `{API_URL}/rfid/...` or `{API_URL}/api/rfid/...`

### 7.1 Record a scan (device / Pi)

**`POST /rfid/scans`**

**Authentication (either):**

- **Device (Pi):** header `x-rfid-api-key: <RFID_DEVICE_API_KEY>`
- **Logged-in user:** header `Authorization: Bearer <JWT>`

**Required headers for Pi:**

```http
Content-Type: application/json
x-rfid-api-key: <RFID_DEVICE_API_KEY>
x-tenant-id: <PAARTH_TENANT_ID>
```

**Request body (JSON):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uid` | string | Yes | Tag UID, e.g. `142-1-4-200-91` |
| `scannedAt` | string (ISO 8601) | No | Defaults to server time if omitted |
| `displayName` | string | No | Override name; usually omit and use registry |
| `name` | string | No | Alias for `displayName` |
| `source` | string | No | Default `device`; Pi sends `raspberry-pi` |
| `deviceLabel` | string | No | e.g. `shop-front-desk` |
| `device` | string | No | Alias for `deviceLabel` |

**Success `201`:**

```json
{
  "success": true,
  "scan": {
    "_id": "...",
    "uid": "142-1-4-200-91",
    "displayName": "Jake",
    "scannedAt": "2026-05-11T18:30:00.000Z",
    "knownTag": true
  }
}
```

**Name resolution order:**

1. Body `displayName` / `name` if provided  
2. Else active `RfidTag` for this `uid` in the tenant  
3. Else `Unknown tag (<uid>)`

**Side effect:** On success, the server emits Socket.IO `rfid.scan.created` to `tenant:<tenantId>` (see §6.1).

**Common errors:**

| Status | Meaning |
|--------|---------|
| 400 | Missing `uid` or invalid `scannedAt` |
| 401 | Wrong or missing `x-rfid-api-key` |
| 503 | `RFID_DEVICE_API_KEY` not set on server |
| 503 | MongoDB not connected |

**curl example (test from laptop):**

```bash
curl -X POST "https://YOUR_API/rfid/scans" \
  -H "Content-Type: application/json" \
  -H "x-rfid-api-key: YOUR_SECRET" \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -d '{"uid":"142-1-4-200-91","scannedAt":"2026-05-11T18:30:00.000Z","source":"test","deviceLabel":"curl"}'
```

### 7.2 List scans (web app / admin)

**`GET /rfid/scans`**

**Auth:** `Authorization: Bearer <JWT>` (and tenant context from user or `x-tenant-id`)

**Query:**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | 100 | Max 500 |
| `page` | 1 | Pagination |
| `uid` | — | Filter by UID |

**Response:**

```json
{
  "scans": [ { "_id", "uid", "displayName", "scannedAt", "source", "deviceLabel", ... } ],
  "total": 42,
  "page": 1,
  "totalPages": 1
}
```

### 7.3 Tag registry

| Method | Path | Auth | Body / params |
|--------|------|------|----------------|
| `GET` | `/rfid/tags` | JWT | — |
| `POST` | `/rfid/tags` | JWT | `{ "uid", "displayName", "notes?", "employeeUserId?", "isActive?" }` |
| `PUT` | `/rfid/tags` | JWT | Same as POST (upsert by `uid`) |
| `DELETE` | `/rfid/tags/:id` | JWT | Mongo `_id` of tag |

Upsert is keyed by **`uid`** per tenant (unique index).

---

## 8. Running the Pi script

From the Paarth repo on the Pi:

```bash
cd /path/to/Paarth
pip install requests mfrc522 RPi.GPIO

export PAARTH_API_URL="https://your-api-host"
export PAARTH_TENANT_ID="your_tenant_id"
export RFID_DEVICE_API_KEY="your_secret"

sudo -E python3 scripts/raspberry-pi/rfid_to_paarth.py
```

Expected console output:

```
RFID → Paarth. Scan a tag…
API: https://your-api-host  tenant: 507f1f77…
RFID UID: 142-1-4-200-91
Logged in Paarth: Jake @ 2026-05-11T18:30:00.123456+00:00
```

**Debounce:** While the same card stays on the reader, the script only re-sends after `RFID_DEBOUNCE_SECONDS` (default 2s). Removing the card clears `last_uid` so the next tap logs again.

**Run on boot (optional):** Use `systemd` — example unit:

```ini
[Unit]
Description=Paarth RFID reader
After=network-online.target

[Service]
Type=simple
User=pi
EnvironmentFile=/home/pi/.paarth-rfid.env
WorkingDirectory=/home/pi/Paarth
ExecStart=/usr/bin/python3 /home/pi/Paarth/scripts/raspberry-pi/rfid_to_paarth.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## 9. Security notes

- Treat `RFID_DEVICE_API_KEY` like a password. Anyone with the key + tenant id can **post scans** (not read other Paarth data).
- Use **HTTPS** in production for `PAARTH_API_URL`.
- Do not commit secrets to git.
- Tag registry and scan **listing** require normal user JWT (`requireAuth`).

---

## 10. Troubleshooting

| Symptom | Check |
|---------|--------|
| `Set PAARTH_TENANT_ID and RFID_DEVICE_API_KEY` on Pi | Export both env vars before running script |
| `Paarth error 401` | API key mismatch; typo; wrong header name (`x-rfid-api-key`) |
| `Paarth error 503` … not configured | Set `RFID_DEVICE_API_KEY` on server and redeploy |
| `Network error` | Pi has internet; URL correct; firewall allows outbound HTTPS |
| Scans show **Unknown tag** | Register UID in **RFID scans** → **Register tag** (exact UID string) |
| Duplicate scans | Increase `RFID_DEBOUNCE_SECONDS` |
| No scans in UI but Pi says OK | Wrong `PAARTH_TENANT_ID` (different tenant than logged-in user) |
| Pi OK but UI never updates live | Redeploy frontend; check **Live** badge; `VITE_API_URL` must match API; tenant id mismatch |
| `localhost` from Pi fails | Use deployed HTTPS URL or laptop LAN IP — see §5.2.1 |
| `401` on Pi but `curl` works on laptop | Key set locally only — add `RFID_DEVICE_API_KEY` on host and redeploy |
| API key typo | No extra `=` or spaces; must match server exactly |
| `Database connection unavailable` | Backend MongoDB down or still connecting |

**Verify tenant:** Logged-in user’s `tenantId` in browser must match `PAARTH_TENANT_ID` on the Pi.

**Verify API path:** If production uses `/api` prefix only on some routes, both `/rfid/scans` and `/api/rfid/scans` are registered in `backend/src/server.js`.

---

## 11. Data model (MongoDB)

### RfidTag

- `uid` (string, unique per tenant)
- `displayName` (string)
- `notes` (optional)
- `employeeUserId` (optional ref to User)
- `isActive` (boolean, default true)
- `tenantId` (via tenant scope plugin)

### RfidScan

- `uid` (string)
- `displayName` (string, denormalized at scan time)
- `rfidTagId` (optional ref if tag was known)
- `scannedAt` (Date)
- `source`, `deviceLabel` (strings)
- `tenantId`

---

## 12. Extending the system (ideas for ChatGPT)

Already implemented:

- **Socket.IO** — `rfid.scan.created`, `rfid.tag.upserted`, `rfid.tag.deleted` on `tenant:<tenantId>` (see §6.1).

Possible follow-ups:

- Clock-in / clock-out: interpret alternating scans as in/out and write to payroll.
- Link `employeeUserId` on `RfidTag` to Users page.
- Toast or sound on each live scan.
- Rename historical scan rows when a tag is registered.
- Webhook to external systems when a scan arrives.
- Gate access: reject unknown UIDs at the door.
- Attach `jobId` or `customerId` on scan via a second UI step.

When implementing extensions, start from:

- `backend/src/controllers/rfidController.js` → `recordScan`
- `backend/src/services/eventBus.js` → add publishers / events
- `frontend/src/pages/RfidPage.tsx` → `useSocketSubscription` handlers

---

## 13. Quick checklist (deployment)

- [ ] `RFID_DEVICE_API_KEY` set on **deployed** backend env; backend redeployed  
- [ ] Frontend `VITE_API_URL` points at same API; frontend redeployed  
- [ ] Pi env: `PAARTH_API_URL` (HTTPS production URL if backend is deployed), `PAARTH_TENANT_ID`, `RFID_DEVICE_API_KEY`  
- [ ] `curl` test from Pi (or laptop) returns `201`  
- [ ] Pi script runs with `sudo -E`; console shows `Logged in Paarth`  
- [ ] Paarth UI **RFID scans** shows rows; **Live** badge visible  
- [ ] Scan on Pi → new row appears without refresh  
- [ ] Each physical tag registered with correct UID string  

---

## 14. Related Paarth context

- **Stack:** React (Vite) frontend, Express backend, MongoDB, Socket.IO, multi-tenant via `x-tenant-id` / user `tenantId`.
- **Auth:** JWT in `Authorization: Bearer` for users; RFID device uses `x-rfid-api-key`.
- **Real-time:** `tenant:<tenantId>` rooms; see `documents/socketio.md`.
- **Twilio / calendar / pipeline** are separate features; RFID does not auto-link to jobs unless you build that.

---

*Last updated: RFID routes/models, `rfid_to_paarth.py`, `/rfid` UI with live Socket.IO updates, deployment URL guidance, and `eventBus` RFID publishers.*
