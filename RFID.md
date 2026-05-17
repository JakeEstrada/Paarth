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
┌─────────────────┐     GET /rfid/tags, /rfid/scans      │
│ Paarth web app  │ ◄────────────────────────────────────┘
│ /rfid page      │     (JWT Bearer + x-tenant-id)
└─────────────────┘
```

**Multi-tenant:** Every RFID record is scoped to a **tenant** (your shop). The Pi must send `x-tenant-id` with your tenant’s MongoDB ObjectId (24 hex characters).

---

## 3. Repository file map

| Path | Purpose |
|------|---------|
| `scripts/raspberry-pi/rfid_to_paarth.py` | Pi script: read MFRC522, POST scans to API |
| `backend/src/models/RfidTag.js` | MongoDB: UID → displayName mapping |
| `backend/src/models/RfidScan.js` | MongoDB: individual scan events |
| `backend/src/controllers/rfidController.js` | Business logic for tags and scans |
| `backend/src/middleware/rfidDeviceAuth.js` | Auth: device API key **or** user JWT |
| `backend/src/routes/rfid.js` | Express routes |
| `frontend/src/pages/RfidPage.tsx` | UI: register tags, view scan log |
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
| `PAARTH_API_URL` | Yes | Base URL, no trailing slash. e.g. `https://your-app.onrender.com` or `http://192.168.1.50:4000` |
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
python3 /path/to/Paarth/scripts/raspberry-pi/rfid_to_paarth.py
```

### 5.3 How to find `PAARTH_TENANT_ID`

1. Log into Paarth in the browser.
2. Open DevTools → **Application** → **Local Storage** for your site.
3. Look for key `tenantId` (24-character hex string).

Alternatively, ask your Paarth admin / database for the `Tenant` document `_id` for your shop.

### 5.4 Frontend (unchanged)

`VITE_API_URL` must point at the same backend the Pi uses (for the web UI only).

---

## 6. Paarth web UI

1. Log in to Paarth.
2. Sidebar → **RFID scans** (`/rfid`).
3. **Register tag**
   - Scan a tag on the Pi once.
   - Copy the UID from the Pi console **or** from **Recent scans** (may show as `Unknown tag (142-1-4-...)`).
   - Enter **Tag UID** + **Name** → **Save mapping**.
4. **Recent scans** lists timestamp, name, UID, source/device.

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

python3 scripts/raspberry-pi/rfid_to_paarth.py
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

Possible follow-ups not implemented unless requested:

- Clock-in / clock-out: interpret alternating scans as in/out and write to payroll.
- Link `employeeUserId` on `RfidTag` to Users page.
- Webhook or Socket.io event when a scan arrives.
- Gate access: reject unknown UIDs at the door.
- Attach `jobId` or `customerId` on scan via a second UI step.

When implementing extensions, start from:

- `backend/src/controllers/rfidController.js` → `recordScan`
- `frontend/src/pages/RfidPage.tsx`

---

## 13. Quick checklist (deployment)

- [ ] `RFID_DEVICE_API_KEY` set on backend; redeployed  
- [ ] Pi env: `PAARTH_API_URL`, `PAARTH_TENANT_ID`, `RFID_DEVICE_API_KEY`  
- [ ] `curl` test returns `201`  
- [ ] Pi script runs; console shows `Logged in Paarth`  
- [ ] Paarth UI **RFID scans** shows rows  
- [ ] Each physical tag registered with correct UID string  

---

## 14. Related Paarth context

- **Stack:** React (Vite) frontend, Express backend, MongoDB, multi-tenant via `x-tenant-id` / user `tenantId`.
- **Auth:** JWT in `Authorization: Bearer` for users; RFID device uses `x-rfid-api-key`.
- **Twilio / calendar / pipeline** are separate features; RFID does not auto-link to jobs unless you build that.

---

*Last updated to match the Paarth codebase: RFID routes, models, `rfid_to_paarth.py`, and `/rfid` UI page.*
