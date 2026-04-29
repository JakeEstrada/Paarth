import axios from 'axios';
import toast from 'react-hot-toast';

const LOGIN_PATH = '/login';

/** Paths where a 401 is expected (bad credentials) and must not trigger session logout redirect. */
const AUTH_FLOW_PATH_PREFIXES = ['/login', '/register', '/forgot-password', '/forgot-username'];

function isAuthFlowPagePath() {
  const path = window.location.pathname || '/';
  return AUTH_FLOW_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Login/register POST can return 401; never treat that as "session expired". */
function isAuthLoginOrRegisterRequest(config) {
  const url = String(config?.url || '');
  return /\/auth\/(login|register)(?:\?|$)/.test(url);
}

let redirectInProgress = false;

/**
 * Clears client auth and sends the user to the login screen (full navigation).
 * Used when the access token is invalid/expired or about to expire.
 */
export function redirectToLoginDueToSessionExpiry() {
  if (redirectInProgress) return;
  if (isAuthFlowPagePath()) return;

  redirectInProgress = true;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  delete axios.defaults.headers.common.Authorization;
  toast.error('Session expired. Please sign in again.');
  window.location.assign(LOGIN_PATH);
}

/**
 * @returns {boolean} true if token should be treated as expired (or missing).
 */
export function isAccessTokenExpiredOrMissing() {
  const token = localStorage.getItem('accessToken');
  if (!token) return true;
  const expMs = parseJwtExpMs(token);
  if (expMs == null) return false;
  const skewMs = 30_000;
  return Date.now() >= expMs - skewMs;
}

function parseJwtExpMs(token) {
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

/**
 * When the tab wakes after idle time, redirect before stale UI + failing requests.
 * Also checks periodically while the tab is visible.
 */
export function attachSessionExpiryGuards() {
  const check = () => {
    if (document.visibilityState !== 'visible') return;
    if (!localStorage.getItem('accessToken')) return;
    if (isAuthFlowPagePath()) return;
    if (isAccessTokenExpiredOrMissing()) {
      redirectToLoginDueToSessionExpiry();
    }
  };

  document.addEventListener('visibilitychange', check);
  window.setInterval(check, 5 * 60 * 1000);
}

export { LOGIN_PATH, isAuthFlowPagePath, isAuthLoginOrRegisterRequest };
