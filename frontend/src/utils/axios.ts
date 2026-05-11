import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import {
  isAuthFlowPagePath,
  isAuthLoginOrRegisterRequest,
  redirectToLoginDueToSessionExpiry,
} from './authSession';
import { getConnectedSocketId } from '../services/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: API_URL,
});

// Add token to requests automatically
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
  }
);

// Same session-expiry behavior as default axios (configureAxios.js)
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (!isAuthFlowPagePath() && !isAuthLoginOrRegisterRequest(error.config)) {
        redirectToLoginDueToSessionExpiry();
      }
    }
    return Promise.reject(error);
  }
);

export default api;

