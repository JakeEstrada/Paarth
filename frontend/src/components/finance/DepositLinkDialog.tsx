import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as LinkIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../utils/axios';
import {
  formatMoney,
  resolvePaymentSchedule,
  getScheduleItemTotal,
  sumChangeOrdersForFinal,
  getContractBase,
} from '../../utils/paymentSchedule';

export type DepositTransaction = {
  transaction_id: string;
  account_id?: string;
  date?: string;
  name?: string;
  amount?: number;
};

export type DepositAllocation = {
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

type DepositSuggestion = {
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

type JobOption = {
  _id: string;
  title?: string;
  customerId?: { name?: string } | string;
};

type ScheduleChoice = {
  sortOrder: number;
  label: string;
  amount: number;
  status: string;
};

function depositAmountFromTransaction(transaction: DepositTransaction | null) {
  return Math.abs(Number(transaction?.amount || 0));
}

function formatJobLabel(job: JobOption) {
  const customer =
    job.customerId && typeof job.customerId === 'object'
      ? String(job.customerId.name || '').trim()
      : '';
  const title = String(job.title || 'Untitled job').trim();
  const idSuffix = String(job._id || '').slice(-8);
  return customer ? `${customer} — ${title} · ID ${idSuffix}` : `${title} · ID ${idSuffix}`;
}

type DepositLinkDialogProps = {
  open: boolean;
  transaction: DepositTransaction | null;
  existingAllocation?: DepositAllocation | null;
  onClose: () => void;
  onLinked: () => void;
};

export default function DepositLinkDialog({
  open,
  transaction,
  existingAllocation,
  onClose,
  onLinked,
}: DepositLinkDialogProps) {
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<DepositSuggestion[]>([]);
  const [connectingKey, setConnectingKey] = useState('');
  const [unlinking, setUnlinking] = useState(false);

  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);
  const [scheduleChoices, setScheduleChoices] = useState<ScheduleChoice[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [manualSortOrder, setManualSortOrder] = useState<number | ''>('');
  const [manualConnecting, setManualConnecting] = useState(false);

  const depositAmount = depositAmountFromTransaction(transaction);

  const resetManual = useCallback(() => {
    setSelectedJob(null);
    setScheduleChoices([]);
    setManualSortOrder('');
  }, []);

  useEffect(() => {
    if (!open) {
      setSuggestions([]);
      resetManual();
      return;
    }

    if (!transaction || existingAllocation) return undefined;

    let cancelled = false;
    (async () => {
      setLoadingSuggestions(true);
      try {
        const res = await api.get<{ suggestions: DepositSuggestion[] }>(
          '/deposit-allocations/suggestions',
          {
            params: {
              amount: depositAmount,
              description: transaction.name || '',
            },
          },
        );
        if (!cancelled) setSuggestions(res.data?.suggestions || []);
      } catch (error) {
        console.error(error);
        if (!cancelled) toast.error('Could not load payment match suggestions');
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, transaction, existingAllocation, depositAmount]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingJobs(true);
      try {
        const res = await api.get('/jobs', {
          params: {
            limit: 250,
            includeCompletedClosedOut: 1,
            includeArchived: 1,
          },
        });
        const list = Array.isArray(res.data?.jobs) ? res.data.jobs : res.data;
        if (!cancelled) setJobs(Array.isArray(list) ? list : []);
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoadingJobs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!selectedJob?._id) {
      setScheduleChoices([]);
      setManualSortOrder('');
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoadingSchedule(true);
      try {
        const res = await api.get(`/jobs/${selectedJob._id}`);
        const job = res.data;
        const contractBase = getContractBase(job);
        const coAddedToFinal = sumChangeOrdersForFinal(job);
        const schedule = resolvePaymentSchedule(job);
        const choices = (schedule.items || []).map((item) => ({
          sortOrder: Number(item.sortOrder) || 0,
          label: String(item.label || '').trim() || 'Payment',
          amount: getScheduleItemTotal(item, contractBase, coAddedToFinal),
          status: String(item.status || 'pending'),
        }));
        if (!cancelled) {
          setScheduleChoices(choices);
          setManualSortOrder(choices[0]?.sortOrder ?? '');
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) toast.error('Could not load payment schedule for that job');
      } finally {
        if (!cancelled) setLoadingSchedule(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedJob]);

  const connectPayload = useMemo(
    () => ({
      plaidTransactionId: transaction?.transaction_id,
      accountId: transaction?.account_id || '',
      transactionDate: transaction?.date || '',
      transactionName: transaction?.name || '',
      depositAmount,
    }),
    [transaction, depositAmount],
  );

  const handleConnect = async (jobId: string, paymentSortOrder: number, key: string) => {
    if (!transaction?.transaction_id) return;
    setConnectingKey(key);
    try {
      await api.post('/deposit-allocations', {
        ...connectPayload,
        jobId,
        paymentSortOrder,
        applyMarkPaid: true,
      });
      toast.success('Deposit linked and payment marked paid');
      onLinked();
      onClose();
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Could not link deposit';
      toast.error(message);
    } finally {
      setConnectingKey('');
    }
  };

  const handleManualConnect = async () => {
    if (!selectedJob?._id || manualSortOrder === '') return;
    setManualConnecting(true);
    try {
      await handleConnect(selectedJob._id, Number(manualSortOrder), 'manual');
    } finally {
      setManualConnecting(false);
    }
  };

  const handleUnlink = async () => {
    if (!existingAllocation?._id) return;
    setUnlinking(true);
    try {
      await api.delete(`/deposit-allocations/${existingAllocation._id}`);
      toast.success('Deposit link removed');
      onLinked();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Could not remove link');
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Connect deposit to payment</DialogTitle>
      <DialogContent dividers>
        {transaction ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {transaction.date} · {transaction.name}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
              {formatMoney(depositAmount)}
            </Typography>
          </Box>
        ) : null}

        {existingAllocation ? (
          <Stack spacing={2}>
            <Alert severity="success">
              Linked to{' '}
              <strong>
                {existingAllocation.customerName || 'Customer'} · {existingAllocation.paymentLabel}
              </strong>
              {existingAllocation.jobTitle ? ` (${existingAllocation.jobTitle})` : ''}.
              {existingAllocation.markPaidApplied ? ' Payment was marked paid.' : ''}
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Job ID ending in {String(existingAllocation.jobId || '').slice(-8)}
            </Typography>
            <Button component={Link} href="/pipeline" target="_blank" rel="noreferrer" startIcon={<LinkIcon />}>
              Open pipeline
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Suggested matches
              </Typography>
              {loadingSuggestions ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : suggestions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No close amount matches found. Pick a job and payment manually below.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {suggestions.map((suggestion) => {
                    const key = `${suggestion.jobId}:${suggestion.paymentSortOrder}`;
                    return (
                      <Box
                        key={key}
                        sx={{
                          p: 1.5,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          display: 'flex',
                          gap: 1.5,
                          alignItems: { xs: 'stretch', sm: 'center' },
                          flexDirection: { xs: 'column', sm: 'row' },
                          justifyContent: 'space-between',
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {suggestion.customerName} · {suggestion.paymentLabel}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {suggestion.jobTitle} · ID {suggestion.jobIdShort} ·{' '}
                            {formatMoney(suggestion.scheduledAmount)} · {suggestion.paymentStatus}
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                            {suggestion.reasons.map((reason) => (
                              <Chip key={reason} size="small" label={reason} variant="outlined" />
                            ))}
                          </Box>
                        </Box>
                        <Button
                          variant="contained"
                          disabled={Boolean(connectingKey)}
                          onClick={() =>
                            void handleConnect(
                              suggestion.jobId,
                              suggestion.paymentSortOrder,
                              key,
                            )
                          }
                        >
                          {connectingKey === key ? 'Connecting…' : 'Connect'}
                        </Button>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Manual match
              </Typography>
              <Stack spacing={1.5}>
                <Autocomplete
                  options={jobs}
                  loading={loadingJobs}
                  value={selectedJob}
                  onChange={(_, value) => setSelectedJob(value)}
                  getOptionLabel={(option) => formatJobLabel(option)}
                  isOptionEqualToValue={(a, b) => a._id === b._id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Job"
                      placeholder="Search customer or job title"
                    />
                  )}
                />
                <FormControl size="small" fullWidth disabled={!selectedJob || loadingSchedule}>
                  <InputLabel id="deposit-payment-label">Payment</InputLabel>
                  <Select
                    labelId="deposit-payment-label"
                    label="Payment"
                    value={manualSortOrder}
                    onChange={(e) => setManualSortOrder(Number(e.target.value))}
                  >
                    {scheduleChoices.map((choice) => (
                      <MenuItem key={choice.sortOrder} value={choice.sortOrder}>
                        {choice.label} · {formatMoney(choice.amount)} · {choice.status}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  disabled={!selectedJob || manualSortOrder === '' || manualConnecting}
                  onClick={() => void handleManualConnect()}
                >
                  {manualConnecting ? 'Connecting…' : 'Connect manually'}
                </Button>
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {existingAllocation ? (
          <Button color="error" onClick={() => void handleUnlink()} disabled={unlinking}>
            {unlinking ? 'Removing…' : 'Remove link'}
          </Button>
        ) : null}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
