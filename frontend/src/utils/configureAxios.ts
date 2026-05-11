import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import {
  attachSessionExpiryGuards,
  isAuthFlowPagePath,
  isAuthLoginOrRegisterRequest,
  redirectToLoginDueToSessionExpiry,
} from './authSession';
import { getConnectedSocketId } from '../services/socket';

/**
 * Default axios is used across many pages. Attach auth + tenant on every request from
 * localStorage so calls never depend on stale axios.defaults (fixes 401 after login / refresh).
 */
axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const tenantId = localStorage.getItem('tenantId');
  const id = tenantId != null ? String(tenantId).trim() : '';
  if (id && /^[a-fA-F0-9]{24}$/.test(id) && !config.headers['x-tenant-id']) {
    config.headers['x-tenant-id'] = id;
  }
  const socketId = getConnectedSocketId();
  if (socketId) {
    config.headers['x-socket-id'] = socketId;
  }
  return config;
});

/**
 * Global 401 handling for the default axios client used across pages.
 * If a token expires mid-session, clear auth and return user to login.
 */
axios.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error?.response?.status === 401) {
      if (isAuthFlowPagePath() || isAuthLoginOrRegisterRequest(error.config)) {
        return Promise.reject(error);
      }
      redirectToLoginDueToSessionExpiry();
    }
    return Promise.reject(error);
  }
);

attachSessionExpiryGuards();
