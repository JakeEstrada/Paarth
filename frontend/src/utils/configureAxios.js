import axios from 'axios';
import toast from 'react-hot-toast';

const TENANT_HEADER = 'x-tenant-id';
const LOGIN_PATH = '/login';
let handledAuthExpiry = false;

/**
 * Default axios is used across many pages. Attach auth + tenant on every request from
 * localStorage so calls never depend on stale axios.defaults (fixes 401 after login / refresh).
 */
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tenantId = localStorage.getItem('tenantId');
  const id = tenantId != null ? String(tenantId).trim() : '';
  if (id && /^[a-fA-F0-9]{24}$/.test(id) && !config.headers[TENANT_HEADER]) {
    config.headers[TENANT_HEADER] = id;
  }
  return config;
});

/**
 * Global 401 handling for the default axios client used across pages.
 * If a token expires mid-session, immediately clear auth and return user to login.
 */
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const currentPath = window.location.pathname || '/';
      const isAuthPage =
        currentPath === '/login' ||
        currentPath === '/register' ||
        currentPath === '/forgot-password' ||
        currentPath === '/forgot-username';

      // Avoid repeated redirects/toasts when many requests fail at once.
      if (!handledAuthExpiry && !isAuthPage) {
        handledAuthExpiry = true;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        delete axios.defaults.headers.common.Authorization;
        toast.error('Session expired. Please sign in again.');
        window.location.assign(LOGIN_PATH);
      }
    }
    return Promise.reject(error);
  }
);
