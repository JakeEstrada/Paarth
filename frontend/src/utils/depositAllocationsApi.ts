import { isAxiosError } from 'axios';
import api from './axios';

function apiBaseEndsWithApi(): boolean {
  const base = String(api.defaults.baseURL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  return /\/api$/i.test(base);
}

function depositPaths(suffix = ''): string[] {
  const path = suffix.startsWith('/') ? suffix : suffix ? `/${suffix}` : '';
  const primary = `/deposit-allocations${path}`;
  if (apiBaseEndsWithApi()) {
    return [primary];
  }
  return [primary, `/api/deposit-allocations${path}`];
}

async function withDepositPathFallback<T>(
  suffix: string,
  request: (url: string) => Promise<{ data: T }>,
): Promise<T> {
  const paths = depositPaths(suffix);
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

export type DepositAllocationRecord = {
  _id: string;
  plaidTransactionId: string;
  jobId: string;
  jobTitle?: string;
  customerName?: string;
  paymentSortOrder: number;
  paymentLabel?: string;
  depositAmount?: number;
  transactionDate?: string;
  transactionName?: string;
  markPaidApplied?: boolean;
};

export type DepositSuggestion = {
  score: number;
  jobId: string;
  jobTitle: string;
  jobIdShort: string;
  customerName: string;
  paymentSortOrder: number;
  paymentLabel: string;
  scheduledAmount: number;
  amountDiff: number;
  paymentStatus: string;
  reasons: string[];
};

export async function fetchDepositAllocations() {
  const data = await withDepositPathFallback<{ allocations: DepositAllocationRecord[] }>('', (url) =>
    api.get(url),
  );
  return data.allocations || [];
}

export async function fetchDepositSuggestions(amount: number, description: string) {
  const data = await withDepositPathFallback<{ suggestions: DepositSuggestion[] }>(
    '/suggestions',
    (url) =>
      api.get(url, {
        params: { amount, description },
      }),
  );
  return data.suggestions || [];
}

export async function createDepositAllocation(payload: Record<string, unknown>) {
  const data = await withDepositPathFallback<{ allocation: DepositAllocationRecord }>('', (url) =>
    api.post(url, payload),
  );
  return data.allocation;
}

export async function deleteDepositAllocation(id: string) {
  await withDepositPathFallback(`/${id}`, (url) => api.delete(url));
}

export async function autoConnectDeposits(days: number) {
  return withDepositPathFallback<{
    summary: { depositsReviewed: number; linked: number; skipped: number };
    linked: Array<{
      customerName: string;
      paymentLabel: string;
      depositAmount: number;
      date: string;
    }>;
  }>('/auto-connect', (url) => api.post(url, { days }));
}
