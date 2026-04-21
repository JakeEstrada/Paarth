import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RegisterLedgerSection({ active }) {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [sort, setSort] = useState('asc');
  const [days, setDays] = useState(90);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.account_id === accountId) || null,
    [accounts, accountId]
  );

  const loadRegister = useCallback(async () => {
    if (!active) return;
    try {
      setLoading(true);
      setErrorText('');
      const { data } = await axios.get(`${API_URL}/plaid/register-data`, {
        params: { accountId: accountId || undefined, sort, days },
      });
      const nextAccounts = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(nextAccounts);
      if (!accountId && nextAccounts.length > 0) {
        setAccountId(nextAccounts[0].account_id);
      }
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to load register data';
      setErrorText(msg);
      setAccounts([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [active, accountId, sort, days]);

  useEffect(() => {
    if (!active) return;
    loadRegister();
  }, [active, loadRegister]);

  const rows = useMemo(() => {
    let running = 0;
    return transactions.map((t) => {
      const signed = -Number(t.amount || 0); // Plaid positive = outflow
      running += signed;
      return {
        ...t,
        signed,
        running,
      };
    });
  }, [transactions]);

  if (!active) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel id="register-account-label">Account</InputLabel>
          <Select
            labelId="register-account-label"
            value={accountId}
            label="Account"
            onChange={(e) => setAccountId(String(e.target.value))}
          >
            {accounts.map((a) => (
              <MenuItem key={a.account_id} value={a.account_id}>
                {(a.official_name || a.name) + (a.mask ? ` ••••${a.mask}` : '')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="register-days-label">Window</InputLabel>
          <Select
            labelId="register-days-label"
            value={days}
            label="Window"
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <MenuItem value={30}>30 days</MenuItem>
            <MenuItem value={90}>90 days</MenuItem>
            <MenuItem value={180}>180 days</MenuItem>
            <MenuItem value={365}>365 days</MenuItem>
          </Select>
        </FormControl>

        <ToggleButtonGroup
          size="small"
          value={sort}
          exclusive
          onChange={(_, v) => v && setSort(v)}
          aria-label="transaction sort order"
        >
          <ToggleButton value="asc">Oldest first</ToggleButton>
          <ToggleButton value="desc">Newest first</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {selectedAccount && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Current balance: ${money(selectedAccount?.balances?.current)}
        </Typography>
      )}

      {errorText ? (
        <Alert severity="warning">{errorText}</Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Account</TableCell>
                <TableCell align="right">Debit</TableCell>
                <TableCell align="right">Credit</TableCell>
                <TableCell align="right">Running Balance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary">Loading register transactions...</Typography>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary">No transactions in this date window.</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const acct = accounts.find((a) => a.account_id === r.account_id);
                  const debit = r.amount > 0 ? r.amount : 0;
                  const credit = r.amount < 0 ? Math.abs(r.amount) : 0;
                  return (
                    <TableRow key={r.transaction_id} hover>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{r.name}</Typography>
                        {r.pending ? <Typography variant="caption" color="warning.main">Pending</Typography> : null}
                      </TableCell>
                      <TableCell>{acct?.name || acct?.official_name || '—'}</TableCell>
                      <TableCell align="right">{debit ? `$${money(debit)}` : '—'}</TableCell>
                      <TableCell align="right">{credit ? `$${money(credit)}` : '—'}</TableCell>
                      <TableCell align="right">${money(r.running)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

