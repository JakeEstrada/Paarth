import { isKioskDisplayMode } from './authSession';

const STORAGE_KEY = 'auditGeo';
const DENIED_KEY = 'auditGeoDenied';

export type AuditCoords = {
  latitude: number;
  longitude: number;
};

let inflight: Promise<AuditCoords | null> | null = null;

function readCached(): AuditCoords | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuditCoords>;
    const latitude = Number(parsed.latitude);
    const longitude = Number(parsed.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}

function writeCached(coords: AuditCoords) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(coords));
  } catch {
    // ignore quota / private mode
  }
}

export function getCachedAuditCoords(): AuditCoords | null {
  if (typeof window === 'undefined') return null;
  if (isKioskDisplayMode()) return null;
  return readCached();
}

function requestBrowserCoords(): Promise<AuditCoords | null> {
  if (typeof window === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  if (isKioskDisplayMode()) return Promise.resolve(null);
  if (sessionStorage.getItem(DENIED_KEY) === '1') return Promise.resolve(null);

  const cached = readCached();
  if (cached) return Promise.resolve(cached);

  if (inflight) return inflight;

  inflight = new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        writeCached(coords);
        inflight = null;
        resolve(coords);
      },
      () => {
        try {
          sessionStorage.setItem(DENIED_KEY, '1');
        } catch {
          // ignore
        }
        inflight = null;
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 15 * 60 * 1000,
        timeout: 8000,
      },
    );
  });

  return inflight;
}

/** Start a background location request (browser prompt once per session). */
export function beginAuditLocation(): void {
  void requestBrowserCoords();
}

/** Wait briefly for device coords so login / logout can include them. */
export async function waitForAuditCoords(ms = 4000): Promise<AuditCoords | null> {
  const cached = getCachedAuditCoords();
  if (cached) return cached;
  if (typeof window === 'undefined' || isKioskDisplayMode()) return null;
  return Promise.race([
    requestBrowserCoords(),
    new Promise<AuditCoords | null>((resolve) => {
      window.setTimeout(() => resolve(getCachedAuditCoords()), ms);
    }),
  ]);
}

export function auditCoordsPayload(coords: AuditCoords | null | undefined): Record<string, number> {
  if (!coords) return {};
  return { latitude: coords.latitude, longitude: coords.longitude };
}
