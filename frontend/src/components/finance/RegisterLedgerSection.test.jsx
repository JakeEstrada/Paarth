import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import RegisterLedgerSection from './RegisterLedgerSection';

vi.mock('./PlaidBankLinkSection', () => ({
  default: () => null,
}));

vi.mock('axios');

function makeAccount(id, balance) {
  return {
    account_id: id,
    name: 'Checking',
    official_name: 'Checking',
    mask: '1234',
    balances: { current: balance },
  };
}

describe('RegisterLedgerSection Plaid refresh', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it('updates balance banner and transactions after force refresh; keeps account id when still present', async () => {
    const oldTxn = {
      transaction_id: 't-old',
      account_id: 'acc-same',
      date: '2024-01-01',
      name: 'Old merchant',
      amount: 10,
      pending: false,
    };
    const newTxn = {
      transaction_id: 't-new',
      account_id: 'acc-same',
      date: '2024-02-01',
      name: 'New merchant',
      amount: 20,
      pending: false,
    };

    vi.mocked(axios.get).mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/plaid/register-data')) {
        const n = vi.mocked(axios.get).mock.calls.filter((c) => String(c[0]).includes('/plaid/register-data')).length;
        if (n === 1) {
          return Promise.resolve({
            data: {
              accounts: [makeAccount('acc-same', 1000)],
              transactions: [oldTxn],
              registerSync: { syncedAt: '2024-01-01T00:00:00.000Z', source: 'cache' },
            },
          });
        }
        return Promise.resolve({
          data: {
            accounts: [makeAccount('acc-same', 1200)],
            transactions: [newTxn],
            registerSync: { syncedAt: '2024-06-01T12:00:00.000Z', source: 'plaid' },
          },
        });
      }
      if (u.includes('/plaid/status')) {
        return Promise.resolve({ data: { configured: true, linked: true } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<RegisterLedgerSection active headerTitle="Register" headerSubtitle="Test" />);

    await waitFor(() => {
      expect(screen.getByText(/Balance \$1,000\.00/)).toBeInTheDocument();
    });
    expect(screen.getByText('Old merchant')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /refresh register data/i }));

    await waitFor(() => {
      expect(screen.getByText(/Balance \$1,200\.00/)).toBeInTheDocument();
    });
    expect(screen.getByText('New merchant')).toBeInTheDocument();
    expect(screen.queryByText('Old merchant')).not.toBeInTheDocument();
    expect(screen.getByText(/Source:\s*plaid/i)).toBeInTheDocument();
  });

  it('falls back to first account when selected account disappears after refresh', async () => {
    vi.mocked(axios.get).mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/plaid/register-data')) {
        const n = vi.mocked(axios.get).mock.calls.filter((c) => String(c[0]).includes('/plaid/register-data')).length;
        if (n === 1) {
          return Promise.resolve({
            data: {
              accounts: [makeAccount('keep', 800), makeAccount('other', 500)],
              transactions: [],
              registerSync: { syncedAt: '2024-01-01T00:00:00.000Z', source: 'cache' },
            },
          });
        }
        return Promise.resolve({
          data: {
            accounts: [makeAccount('keep', 900)],
            transactions: [],
            registerSync: { syncedAt: '2024-06-01T12:00:00.000Z', source: 'plaid' },
          },
        });
      }
      if (u.includes('/plaid/status')) {
        return Promise.resolve({ data: { configured: true, linked: true } });
      }
      return Promise.resolve({ data: {} });
    });

    render(<RegisterLedgerSection active headerTitle="Register" headerSubtitle="Test" />);

    await waitFor(() => {
      expect(screen.getByText(/Balance \$800\.00/)).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByLabelText(/^account$/i));
    const optOther = await screen.findByRole('option', { name: /other/i });
    fireEvent.click(optOther);

    await waitFor(() => {
      expect(screen.getByText(/Balance \$500\.00/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /refresh register data/i }));

    await waitFor(() => {
      expect(screen.getByText(/Balance \$900\.00/)).toBeInTheDocument();
    });
    const select = screen.getByLabelText(/^account$/i);
    expect(select).toHaveTextContent(/keep/i);
  });
});
