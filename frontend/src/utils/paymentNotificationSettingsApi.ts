import { isAxiosError } from 'axios';
import api from './axios';
import { nanpDigitsOnly } from './phoneFormat';

function apiBaseEndsWithApi(): boolean {
  const base = String(api.defaults.baseURL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  return /\/api$/i.test(base);
}

function tenantPaths(suffix: string): string[] {
  const path = suffix.startsWith('/') ? suffix : suffix ? `/${suffix}` : '';
  const primary = `/tenants${path}`;
  if (apiBaseEndsWithApi()) {
    return [primary];
  }
  return [primary, `/api${primary}`];
}

async function withTenantPathFallback<T>(
  suffix: string,
  request: (url: string) => Promise<{ data: T }>,
): Promise<T> {
  const paths = tenantPaths(suffix);
  let lastError: unknown;
  for (let i = 0; i < paths.length; i += 1) {
    try {
      const res = await request(paths[i]);
      return res.data;
    } catch (error) {
      lastError = error;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status !== 404 || i === paths.length - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

export type PaymentNotificationSettings = {
  enabled: boolean;
  recipients: Array<{ kind: 'user' | 'contact'; id: string }>;
  phoneNumbers: string[];
};

type PipelineOverrideEntry = { hidden?: boolean; label?: string };
type PipelineOverrides = Record<string, PipelineOverrideEntry>;

const PAYMENT_SMS_PREFIX = 'PAYMENT_SMS_';

function isPaymentSmsOverrideKey(key: string) {
  return key.startsWith(PAYMENT_SMS_PREFIX);
}

export function parsePaymentSettingsFromPipelineOverrides(
  overrides: PipelineOverrides | null | undefined,
): PaymentNotificationSettings {
  const o = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  const enabled = o.PAYMENT_SMS_ENABLED?.hidden === true;
  const phoneNumbers = Object.entries(o)
    .filter(([k]) => /^PAYMENT_SMS_PHONE_\d+$/.test(k))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, v]) => String(v?.label || '').trim())
    .filter(Boolean);
  const recipients = Object.entries(o)
    .filter(([k]) => /^PAYMENT_SMS_RECIPIENT_\d+$/.test(k))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, v]) => {
      const label = String(v?.label || '').trim();
      if (label.startsWith('user:')) return { kind: 'user' as const, id: label.slice(5) };
      if (label.startsWith('contact:')) return { kind: 'contact' as const, id: label.slice(8) };
      return null;
    })
    .filter((row): row is { kind: 'user' | 'contact'; id: string } => Boolean(row));
  return { enabled, phoneNumbers, recipients };
}

function encodePaymentSettingsToPipelineOverrides(
  existingOverrides: PipelineOverrides | null | undefined,
  settings: PaymentNotificationSettings,
): PipelineOverrides {
  const out: PipelineOverrides = {};
  const existing =
    existingOverrides && typeof existingOverrides === 'object' && !Array.isArray(existingOverrides)
      ? existingOverrides
      : {};

  for (const [k, v] of Object.entries(existing)) {
    if (isPaymentSmsOverrideKey(k)) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const entry: PipelineOverrideEntry = {};
    if (typeof v.hidden === 'boolean') entry.hidden = v.hidden;
    if (v.label != null && String(v.label).trim()) {
      entry.label = String(v.label).trim().slice(0, 160);
    }
    if (Object.keys(entry).length) out[k] = entry;
  }

  if (settings.enabled) {
    out.PAYMENT_SMS_ENABLED = { hidden: true };
  }
  settings.phoneNumbers.forEach((phone, i) => {
    const digits = nanpDigitsOnly(phone);
    if (digits.length === 10) {
      out[`PAYMENT_SMS_PHONE_${i + 1}`] = { label: digits };
    }
  });
  settings.recipients.forEach((r, i) => {
    out[`PAYMENT_SMS_RECIPIENT_${i + 1}`] = { label: `${r.kind}:${r.id}`.slice(0, 160) };
  });
  return out;
}

async function fetchViaPipelineSettings(): Promise<PaymentNotificationSettings> {
  const data = await withTenantPathFallback<{ overrides?: PipelineOverrides }>(
    '/pipeline-settings',
    (url) => api.get(url),
  );
  return parsePaymentSettingsFromPipelineOverrides(data?.overrides);
}

async function saveViaPipelineSettings(
  payload: PaymentNotificationSettings,
): Promise<PaymentNotificationSettings> {
  const current = await withTenantPathFallback<{ overrides?: PipelineOverrides }>(
    '/pipeline-settings',
    (url) => api.get(url),
  );
  const overrides = encodePaymentSettingsToPipelineOverrides(current?.overrides, payload);
  const saved = await withTenantPathFallback<{ overrides?: PipelineOverrides }>(
    '/pipeline-settings',
    (url) => api.patch(url, { overrides }),
  );
  return parsePaymentSettingsFromPipelineOverrides(saved?.overrides);
}

function isDedicatedSettings404(error: unknown) {
  return isAxiosError(error) && error.response?.status === 404;
}

export async function fetchPaymentNotificationSettings(): Promise<PaymentNotificationSettings> {
  try {
    return await withTenantPathFallback<PaymentNotificationSettings>(
      '/payment-notification-settings',
      (url) => api.get(url),
    );
  } catch (error) {
    if (isDedicatedSettings404(error)) {
      return fetchViaPipelineSettings();
    }
    throw error;
  }
}

export async function savePaymentNotificationSettings(
  payload: PaymentNotificationSettings,
): Promise<PaymentNotificationSettings> {
  try {
    return await withTenantPathFallback<PaymentNotificationSettings>(
      '/payment-notification-settings',
      (url) => api.patch(url, payload),
    );
  } catch (error) {
    if (isDedicatedSettings404(error)) {
      return saveViaPipelineSettings(payload);
    }
    throw error;
  }
}

export type SendUnsentPaymentNotificationsResult = {
  sentActivities: number;
  failedActivities: number;
  total: number;
  smsCount?: number;
  message?: string;
  error?: string;
};

function activityPaths(suffix: string): string[] {
  const path = suffix.startsWith('/') ? suffix : suffix ? `/${suffix}` : '';
  const primary = `/activities${path}`;
  if (apiBaseEndsWithApi()) {
    return [primary];
  }
  return [primary, `/api${primary}`];
}

async function withActivityPathFallback<T>(
  suffix: string,
  request: (url: string) => Promise<{ data: T }>,
): Promise<T> {
  const paths = activityPaths(suffix);
  let lastError: unknown;
  for (let i = 0; i < paths.length; i += 1) {
    try {
      const res = await request(paths[i]);
      return res.data;
    } catch (error) {
      lastError = error;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status !== 404 || i === paths.length - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function sendUnsentPaymentNotifications(): Promise<SendUnsentPaymentNotificationsResult> {
  return withActivityPathFallback('/payment-notifications/send-unsent', (url) => api.post(url));
}
