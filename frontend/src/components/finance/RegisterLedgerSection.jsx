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

function stripTrailingSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

function apiOrigin() {
  return stripTrailingSlash(API_URL).replace(/\/api$/i, '');
}

async function getRegisterPayload(params) {
  const origin = apiOrigin();
  const primary = `${origin}/plaid/register-data`;
  try {
    return await axios.get(primary, { params });
  } catch (e) {
    if (e?.response?.status === 404) {
      return await axios.get(`${origin}/api/plaid/register-data`, { params });
    }
    throw e;
  }
}

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
  const [registerSync, setRegisterSync] = useState(null);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.account_id === accountId) || null,
    [accounts, accountId]
  );

  const loadRegister = useCallback(async () => {
    if (!active) return;
    try {
      setLoading(true);
      setErrorText('');
      const { data } = await getRegisterPayload({
        accountId: accountId || undefined,
        sort,
        days,
      });
      const nextAccounts = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(nextAccounts);
      if (!accountId && nextAccounts.length > 0) {
        setAccountId(nextAccounts[0].account_id);
      }
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
      setRegisterSync(data?.registerSync && typeof data.registerSync === 'object' ? data.registerSync : null);
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to load register data';
      setErrorText(msg);
      setAccounts([]);
      setTransactions([]);
      setRegisterSync(null);
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
    <Box sx={{ mt: 1.25 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240 }, maxWidth: { sm: 360 } }}>
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

          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 120 } }}>
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
            sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}
          >
            <ToggleButton value="asc">Oldest first</ToggleButton>
            <ToggleButton value="desc">Newest first</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {selectedAccount ? (
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', alignSelf: { xs: 'flex-end', md: 'center' } }}>
            Balance ${money(selectedAccount?.balances?.current)}
          </Typography>
        ) : null}
      </Stack>

      {registerSync?.syncedAt ? (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: -0.5, mb: 1, lineHeight: 1.5 }}>
          Register is stored on the server; Plaid is called at most once per 24 hours for your organization.
          Last bank pull{' '}
          {new Date(registerSync.syncedAt).toLocaleString()}
          {registerSync.source === 'plaid' ? ' (live)' : ' (saved copy)'}
          {registerSync.nextPlaidRefreshAfter
            ? `. Next live sync after ${new Date(registerSync.nextPlaidRefreshAfter).toLocaleString()}.`
            : '.'}
        </Typography>
      ) : null}

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

