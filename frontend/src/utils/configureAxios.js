import axios from 'axios';

const TENANT_HEADER = 'x-tenant-id';

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
