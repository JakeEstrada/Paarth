import { isAxiosError } from 'axios';
import api from './axios';

function apiBaseEndsWithApi(): boolean {
  const base = String(api.defaults.baseURL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  return /\/api$/i.test(base);
}

/** Relative paths for twilio routes; tries `/api/twilio/...` when the API base has no `/api` suffix. */
function twilioRelativePaths(suffix: string): string[] {
  const path = suffix.startsWith('/') ? suffix : `/${suffix}`;
  const primary = `/twilio${path}`;
  if (apiBaseEndsWithApi()) {
    return [primary];
  }
  return [primary, `/api/twilio${path}`];
}

async function withTwilioPathFallback<T>(
  suffix: string,
  request: (url: string) => Promise<{ data: T }>
): Promise<T> {
  const paths = twilioRelativePaths(suffix);
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

export type SmsRow = {
  id: string;
  kind: string;
  to: string | null;
  from: string | null;
  body: string;
  status: string;
  sendAt: string | null;
  sentAt: string | null;
  createdAt: string;
  lastError: string | null;
};

export type SmsLists = {
  scheduled: SmsRow[];
  sent: SmsRow[];
  received: SmsRow[];
};

export async function fetchSmsLists(): Promise<SmsLists> {
  const data = await withTwilioPathFallback<SmsLists>('/messages', (url) => api.get(url));
  return {
    scheduled: data.scheduled || [],
    sent: data.sent || [],
    received: data.received || [],
  };
}

export type ScheduleSmsPayload = {
  to: string;
  message: string;
  sendAt: string;
};

export async function scheduleSmsAdhoc(payload: ScheduleSmsPayload) {
  return withTwilioPathFallback<{ success: boolean; mode: string; sendAt?: string }>(
    '/schedule-sms-adhoc',
    (url) => api.post(url, payload)
  );
}
