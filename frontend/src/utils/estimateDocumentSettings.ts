import { tenantEstimateDocumentLogoUrl } from './tenantBranding';

export type EstimateDocumentSettings = {
  logoUrl: string;
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  phoneLabel: string;
  phone: string;
  website: string;
  email: string;
};

export const DEFAULT_ESTIMATE_DOCUMENT_SETTINGS: EstimateDocumentSettings = {
  logoUrl: '/scww.png',
  companyName: 'San Clemente Woodworking',
  addressLine1: '1030 Calle Sombra, Unit F',
  addressLine2: 'San Clemente, CA 92673',
  phoneLabel: 'Phone #',
  phone: '(951)491-1137',
  website: 'www.sanclementewoodworking.com',
  email: 'office@sanclementewoodworking.com',
};

export function mergeEstimateDocumentSettings(
  stored?: Partial<EstimateDocumentSettings> | null
): EstimateDocumentSettings {
  const base = { ...DEFAULT_ESTIMATE_DOCUMENT_SETTINGS };
  if (!stored || typeof stored !== 'object') return base;
  for (const key of Object.keys(DEFAULT_ESTIMATE_DOCUMENT_SETTINGS) as (keyof EstimateDocumentSettings)[]) {
    const value = stored[key];
    if (value != null && String(value).trim()) {
      base[key] = String(value).trim();
    }
  }
  return base;
}

function isEstimateBrandingLogoPath(logoUrl?: string | null) {
  return String(logoUrl || '').includes('/estimate-logo');
}

/** Resolve logo path/URL for estimate document <img> src. */
export function resolveEstimateDocumentLogoSrc(
  logoUrl?: string | null,
  tenantId?: unknown,
  cacheBust?: string | number | null
) {
  const raw = String(logoUrl || DEFAULT_ESTIMATE_DOCUMENT_SETTINGS.logoUrl).trim();
  if (!raw) return DEFAULT_ESTIMATE_DOCUMENT_SETTINGS.logoUrl;

  if (isEstimateBrandingLogoPath(raw) && tenantId) {
    return tenantEstimateDocumentLogoUrl(tenantId, cacheBust) || DEFAULT_ESTIMATE_DOCUMENT_SETTINGS.logoUrl;
  }

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/${raw.replace(/^\/+/, '')}`;
}

export function estimateDocumentLogoFallbackSrc(currentSrc?: string | null) {
  const fallback = DEFAULT_ESTIMATE_DOCUMENT_SETTINGS.logoUrl;
  const current = String(currentSrc || '').trim();
  if (!current || current.endsWith(fallback)) return null;
  return fallback;
}
