const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Absolute URL to the tenant's organization logo (or null if no tenant id).
 * Backed by GET /tenants/branding/:tenantId/logo — falls back via onError to /logo.png in the UI.
 */
export function tenantBrandingLogoUrl(tenantId, cacheBust) {
  if (!tenantId) return null;
  const id = typeof tenantId === 'object' && tenantId?._id ? tenantId._id : tenantId;
  if (!id) return null;
  const v =
    cacheBust ||
    (typeof tenantId === 'object' && tenantId?.updatedAt ? new Date(tenantId.updatedAt).getTime() : '');
  const q = v ? `?v=${encodeURIComponent(String(v))}` : '';
  return `${API_URL}/tenants/branding/${id}/logo${q}`;
}

export const DEFAULT_APP_LOGO = '/logo.png';
