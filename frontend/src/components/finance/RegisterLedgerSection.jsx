import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  Chip,
  FormControl,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Fullscreen, FullscreenExit } from '@mui/icons-material';
import PlaidBankLinkSection from './PlaidBankLinkSection';

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

export default function RegisterLedgerSection({ active, headerTitle, headerSubtitle }) {
  const showFinanceHeader = Boolean(headerTitle);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [sort, setSort] = useState('desc');
  const [days, setDays] = useState(90);
  const [registerSync, setRegisterSync] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const panelRef = useRef(null);

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

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  const balanceValue = Number(selectedAccount?.balances?.current ?? 0);
  const balanceNonNegative = balanceValue >= 0;

  const accountSelect = (
    <FormControl
      size="small"
      sx={{
        minWidth: { xs: '100%', sm: 280 },
        maxWidth: 420,
        ...(showFinanceHeader ? { width: { md: 'min(100%, 400px)' } } : {}),
      }}
    >
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
  );

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (panelRef.current?.requestFullscreen) {
        await panelRef.current.requestFullscreen();
      }
    } catch (e) {
      console.error('toggleFullscreen:', e);
    }
  };

  return (
    <Box
      ref={panelRef}
      sx={{
        mt: showFinanceHeader ? 0 : 1.25,
        ...(isFullscreen
          ? {
              bgcolor: 'background.default',
              p: 2,
              overflow: 'auto',
            }
          : {}),
      }}
    >
      {showFinanceHeader ? (
        <Box
          sx={{
            mb: 1.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(160px,1fr) minmax(220px,auto) minmax(160px,1fr)' },
              gap: { xs: 1.5, md: 2 },
              alignItems: 'start',
            }}
          >
            <Box sx={{ minWidth: 0, pr: { md: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
                  {headerTitle}
                </Typography>
                <Chip size="small" color="primary" label="New" />
              </Box>
              {headerSubtitle ? (
                <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.35, mb: 0, lineHeight: 1.4 }}>
                  {headerSubtitle}
                </Typography>
              ) : null}
            </Box>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                width: '100%',
              }}
            >
              {accountSelect}
            </Box>

            <Box
              sx={{
                justifySelf: { xs: 'stretch', md: 'end' },
                textAlign: { xs: 'left', md: 'right' },
                minWidth: 0,
                width: '100%',
              }}
            >
              <PlaidBankLinkSection active variant="titleRight" />
            </Box>
          </Box>

          {selectedAccount ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Paper
                elevation={0}
                sx={(theme) => {
                  const tone = balanceNonNegative ? theme.palette.success : theme.palette.error;
                  return {
                    px: { xs: 2, sm: 3 },
                    py: { xs: 1.25, sm: 1.5 },
                    borderRadius: 2,
                    border: '2px solid',
                    borderColor: tone.main,
                    bgcolor: alpha(tone.main, theme.palette.mode === 'dark' ? 0.22 : 0.1),
                  };
                }}
              >
                <Typography
                  variant="h5"
                  sx={(theme) => ({
                    fontWeight: 800,
                    fontSize: { xs: '1.35rem', sm: '1.6rem' },
                    color: balanceNonNegative ? theme.palette.success.main : theme.palette.error.main,
                    letterSpacing: 0.02,
                    textAlign: 'center',
                  })}
                >
                  Balance ${money(selectedAccount?.balances?.current)}
                </Typography>
              </Paper>
            </Box>
          ) : null}
        </Box>
      ) : null}

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
          {!showFinanceHeader ? accountSelect : null}

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
              <MenuItem value={730}>730 days</MenuItem>
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

          <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <IconButton onClick={toggleFullscreen} size="small" aria-label="toggle register fullscreen">
              {isFullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>

        {!showFinanceHeader && selectedAccount ? (
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

