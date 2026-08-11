import axios, { type InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

const LOGIN_PATH = '/login';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const KIOSK_VIEW_PATHS = ['/pipeline-view', '/calendar-view', '/customers-view'];

/** Paths where a 401 is expected (bad credentials) and must not trigger session logout redirect. */
const AUTH_FLOW_PATH_PREFIXES = ['/login', '/register', '/forgot-password', '/forgot-username'];

function isAuthFlowPagePath(): boolean {
  const path = window.location.pathname || '/';
  return AUTH_FLOW_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Login/register POST can return 401; never treat that as "session expired". */
function isAuthLoginOrRegisterRequest(config: InternalAxiosRequestConfig | undefined): boolean {
  const url = String(config?.url || '');
  return /\/auth\/(login|register)(?:\?|$)/.test(url);
}

function isAuthRefreshRequest(config: InternalAxiosRequestConfig | undefined): boolean {
  const url = String(config?.url || '');
  return /\/auth\/refresh(?:\?|$)/.test(url);
}

export function isKioskViewPath(): boolean {
  const path = window.location.pathname || '/';
  return KIOSK_VIEW_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isKioskDisplayMode(): boolean {
  return isKioskViewPath() || localStorage.getItem('kioskDisplayMode') === '1';
}

export function enableKioskDisplayMode(): void {
  localStorage.setItem('kioskDisplayMode', '1');
}

export function disableKioskDisplayMode(): void {
  localStorage.removeItem('kioskDisplayMode');
}

let redirectInProgress = false;
let refreshPromise: Promise<boolean> | null = null;

function parseJwtExpMs(token: string | null | undefined): number | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function applyRefreshedTokens(accessToken: string, refreshToken?: string | null): void {
  localStorage.setItem('accessToken', accessToken);
  if (refreshToken) {
    localStorage.setItem('refreshToken', refreshToken);
  }
  axios.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
}

/**
 * Exchange refresh token for a new access token (and rotated refresh token).
 */
export async function refreshAccessToken(options?: { kiosk?: boolean }): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) return false;

      const kiosk = options?.kiosk ?? isKioskDisplayMode();
      const response = await axios.post(`${API_URL}/auth/refresh`, {
        refreshToken,
        kiosk,
      });

      const { accessToken, refreshToken: newRefreshToken } = response.data as {
        accessToken?: string;
        refreshToken?: string;
      };
      if (!accessToken) return false;

      applyRefreshedTokens(accessToken, newRefreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Clears client auth and sends the user to the login screen (full navigation).
 * Used when the access token is invalid/expired and refresh failed.
 */
export function redirectToLoginDueToSessionExpiry(): void {
  if (redirectInProgress) return;
  if (isAuthFlowPagePath()) return;

  redirectInProgress = true;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  delete axios.defaults.headers.common.Authorization;

  const loginUrl = isKioskDisplayMode()
    ? `${LOGIN_PATH}?kiosk=1&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
    : LOGIN_PATH;

  if (!isKioskDisplayMode()) {
    toast.error('Session expired. Please sign in again.');
  }
  window.location.assign(loginUrl);
}

/**
 * @returns {boolean} true if token should be treated as expired (or missing).
 */
export function isAccessTokenExpiredOrMissing(): boolean {
  const token = localStorage.getItem('accessToken');
  if (!token) return true;
  const expMs = parseJwtExpMs(token);
  if (expMs == null) return false;
  const skewMs = 30_000;
  return Date.now() >= expMs - skewMs;
}

function isAccessTokenExpiringSoon(withinMs = 60 * 60 * 1000): boolean {
  const token = localStorage.getItem('accessToken');
  if (!token) return true;
  const expMs = parseJwtExpMs(token);
  if (expMs == null) return false;
  return Date.now() >= expMs - withinMs;
}

async function ensureSessionFresh(): Promise<void> {
  if (document.visibilityState !== 'visible') return;
  if (!localStorage.getItem('accessToken')) return;
  if (isAuthFlowPagePath()) return;

  const kiosk = isKioskDisplayMode();
  const refreshLeadMs = kiosk ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const shouldRefresh =
    isAccessTokenExpiredOrMissing() || isAccessTokenExpiringSoon(refreshLeadMs);

  if (!shouldRefresh) return;

  const refreshed = await refreshAccessToken({ kiosk });
  if (!refreshed && isAccessTokenExpiredOrMissing()) {
    redirectToLoginDueToSessionExpiry();
  }
}

/**
 * When the tab wakes after idle time, refresh tokens before forcing logout.
 * Also checks periodically while the tab is visible.
 */
export function attachSessionExpiryGuards(): void {
  const check = () => {
    void ensureSessionFresh();
  };

  document.addEventListener('visibilitychange', check);
  window.setInterval(check, isKioskDisplayMode() ? 15 * 60 * 1000 : 5 * 60 * 1000);
}

export async function handleUnauthorizedResponse(
  config: InternalAxiosRequestConfig | undefined,
): Promise<boolean> {
  if (isAuthFlowPagePath() || isAuthLoginOrRegisterRequest(config) || isAuthRefreshRequest(config)) {
    return false;
  }

  const refreshed = await refreshAccessToken({ kiosk: isKioskDisplayMode() });
  if (refreshed) return true;

  redirectToLoginDueToSessionExpiry();
  return false;
}

export { LOGIN_PATH, isAuthFlowPagePath, isAuthLoginOrRegisterRequest, isAuthRefreshRequest };
