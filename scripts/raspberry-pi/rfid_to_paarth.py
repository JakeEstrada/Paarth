#!/usr/bin/env python3
"""
Post MFRC522 RFID scans to Paarth.

Install on Raspberry Pi:
  pip install requests mfrc522 RPi.GPIO

Configure (environment or edit below):
  PAARTH_API_URL   e.g. https://your-api.onrender.com
  PAARTH_TENANT_ID Mongo ObjectId for your shop (same as browser localStorage tenantId)
  RFID_DEVICE_API_KEY  must match backend RFID_DEVICE_API_KEY

Register each tag UID → name in Paarth: sidebar → RFID Scans → Tag registry.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import requests

try:
    from mfrc522 import MFRC522
    import RPi.GPIO as GPIO
except ImportError as e:
    raise SystemExit(
        "Missing hardware libs. On the Pi run: pip install mfrc522 RPi.GPIO requests"
    ) from e

API_URL = os.environ.get("PAARTH_API_URL", "http://localhost:4000").rstrip("/")
TENANT_ID = os.environ.get("PAARTH_TENANT_ID", "").strip()
API_KEY = os.environ.get("RFID_DEVICE_API_KEY", "").strip()
DEVICE_LABEL = os.environ.get("RFID_DEVICE_LABEL", "raspberry-pi")
DEBOUNCE_SECONDS = float(os.environ.get("RFID_DEBOUNCE_SECONDS", "2"))

reader = MFRC522()
state = {"last_uid": None, "last_sent_at": 0.0}


def post_scan(uid: str) -> None:
    if not TENANT_ID or not API_KEY:
        print("Set PAARTH_TENANT_ID and RFID_DEVICE_API_KEY in the environment.")
        return

    url = f"{API_URL}/rfid/scans"
    headers = {
        "Content-Type": "application/json",
        "x-tenant-id": TENANT_ID,
        "x-rfid-api-key": API_KEY,
    }
    payload = {
        "uid": uid,
        "scannedAt": datetime.now(timezone.utc).isoformat(),
        "source": "raspberry-pi",
        "deviceLabel": DEVICE_LABEL,
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=15)
        if r.status_code == 201:
            data = r.json()
            name = data.get("scan", {}).get("displayName", uid)
            print(f"Logged in Paarth: {name} @ {payload['scannedAt']}")
        else:
            print(f"Paarth error {r.status_code}: {r.text}")
    except requests.RequestException as exc:
        print(f"Network error: {exc}")


def main() -> None:
    print("RFID → Paarth. Scan a tag…")
    print(f"API: {API_URL}  tenant: {TENANT_ID[:8]}…" if TENANT_ID else "API: (set PAARTH_TENANT_ID)")

    try:
        while True:
            status, _tag_type = reader.MFRC522_Request(reader.PICC_REQIDL)
            if status == reader.MI_OK:
                status, uid = reader.MFRC522_Anticoll()
                if status == reader.MI_OK:
                    uid_string = "-".join(str(x) for x in uid)
                    now = time.time()
                    if uid_string != state["last_uid"] or (now - state["last_sent_at"]) >= DEBOUNCE_SECONDS:
                        if uid_string != state["last_uid"]:
                            print(f"RFID UID: {uid_string}")
                        post_scan(uid_string)
                        state["last_sent_at"] = now
                    state["last_uid"] = uid_string
            else:
                state["last_uid"] = None

            time.sleep(0.1)
    except KeyboardInterrupt:
        print("Stopping")
    finally:
        GPIO.cleanup()


if __name__ == "__main__":
    main()
