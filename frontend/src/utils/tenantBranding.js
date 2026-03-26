const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Absolute URL to the tenant's organization logo (or null if no tenant id).
 * Backed by GET /tenants/branding/:tenantId/logo?mode=light|dark — falls back via onError to /logo.png in the UI.
 */
export function tenantBrandingLogoUrl(tenantId, cacheBust, mode = 'light') {
  if (!tenantId) return null;
  const id = typeof tenantId === 'object' && tenantId?._id ? tenantId._id : tenantId;
  if (!id) return null;
  const v =
    cacheBust ||
    (typeof tenantId === 'object' && tenantId?.updatedAt ? new Date(tenantId.updatedAt).getTime() : '');
  const params = new URLSearchParams();
  if (v) params.set('v', String(v));
  if (mode === 'dark' || mode === 'light') params.set('mode', mode);
  const q = params.toString() ? `?${params.toString()}` : '';
  return `${API_URL}/tenants/branding/${id}/logo${q}`;
}

export const DEFAULT_APP_LOGO = '/logo.png';
