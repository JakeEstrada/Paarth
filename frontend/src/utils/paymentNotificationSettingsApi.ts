import { isAxiosError } from 'axios';
import api from './axios';

function apiBaseEndsWithApi(): boolean {
  const base = String(api.defaults.baseURL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  return /\/api$/i.test(base);
}

function settingsPaths(): string[] {
  const primary = '/tenants/payment-notification-settings';
  if (apiBaseEndsWithApi()) {
    return [primary];
  }
  return [primary, `/api${primary}`];
}

async function withSettingsPathFallback<T>(
  request: (url: string) => Promise<{ data: T }>,
): Promise<T> {
  const paths = settingsPaths();
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

export async function fetchPaymentNotificationSettings(): Promise<PaymentNotificationSettings> {
  return withSettingsPathFallback((url) => api.get(url));
}

export async function savePaymentNotificationSettings(
  payload: PaymentNotificationSettings,
): Promise<PaymentNotificationSettings> {
  return withSettingsPathFallback((url) => api.patch(url, payload));
}
