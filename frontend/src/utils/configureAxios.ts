import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import {
  attachSessionExpiryGuards,
  handleUnauthorizedResponse,
  isAuthFlowPagePath,
  isAuthLoginOrRegisterRequest,
} from './authSession';
import { getConnectedSocketId } from '../services/socket';

type RetryableConfig = InternalAxiosRequestConfig & { __authRetry?: boolean };

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
 * On 401, try refresh token once before sending user to login.
 */
axios.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;
    if (error?.response?.status === 401 && config && !config.__authRetry) {
      if (isAuthFlowPagePath() || isAuthLoginOrRegisterRequest(config)) {
        return Promise.reject(error);
      }

      config.__authRetry = true;
      const refreshed = await handleUnauthorizedResponse(config);
      if (refreshed) {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return axios(config);
      }
    }
    return Promise.reject(error);
  },
);

attachSessionExpiryGuards();
