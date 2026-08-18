/**
 * axios api client — Prefer this over raw axios in new code.
 * Attaches JWT, tenant id, socket id; refreshes session on 401 before login redirect.
 */
import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import {
  handleUnauthorizedResponse,
  isAuthFlowPagePath,
  isAuthLoginOrRegisterRequest,
} from './authSession';
import { getConnectedSocketId } from '../services/socket';

const API_URL = String(import.meta.env.VITE_API_URL || 'http://localhost:4000')
  .trim()
  .replace(/\/+$/, '');

type RetryableConfig = InternalAxiosRequestConfig & { __authRetry?: boolean };

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    const tenantId = localStorage.getItem('tenantId');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (tenantId && /^[a-fA-F0-9]{24}$/.test(String(tenantId).trim())) {
      config.headers['x-tenant-id'] = String(tenantId).trim();
    }
    const socketId = getConnectedSocketId();
    if (socketId) {
      config.headers['x-socket-id'] = socketId;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
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
        return api(config);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
