/**
 * CommissionLogsPage — Sales commission logs.
 * Route: /commission-logs
 * Docs: ../../../docs/PAGES.md#commissionlogspagetsx
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios, { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import { getCommissionPaymentSplits, roundMoney } from '../utils/paymentSchedule';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const COMMISSION_LOGS_STORAGE_KEY = 'financeHubCommissionLogsRows';
const DEFAULT_COMMISSION_RATE_KEY = 'financeHubCommissionDefaultRate';
const DEFAULT_COMMISSION_RATE = 5;

const ESTIMATE_STAGE_LABELS: Record<string, string> = {
  APPOINTMENT_SCHEDULED: 'Appointment',
  ESTIMATE_IN_PROGRESS: 'Estimate current',
  ESTIMATE_SENT: 'Estimate sent',
  ENGAGED_DESIGN_REVIEW: 'Design review',
  CONTRACT_OUT: 'Contract out',
  CONTRACT_SIGNED: 'Contract signed',
  DEPOSIT_PENDING: 'Deposit pending',
  JOB_PREP: 'Job prep',
  TAKEOFF_COMPLETE: 'Fabrication',
  READY_TO_SCHEDULE: 'Ready to schedule',
  SCHEDULED: 'Scheduled',
  IN_PRODUCTION: 'In production',
  INSTALLED: 'Installed',
  FINAL_PAYMENT_CLOSED: 'Final payment closed',
};

function formatMoney(value: unknown): string {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function jobTitleAfterPipe(rawTitle: unknown): string {
  const t = String(rawTitle || '').trim();
  if (!t) return 'Untitled';
  const i = t.indexOf('|');
  if (i >= 0) {
    const tail = t.slice(i + 1).trim();
    return tail || t;
  }
  return t;
}

function readDefaultCommissionRate(): number {
  if (typeof window === 'undefined') return DEFAULT_COMMISSION_RATE;
  try {
    const raw = window.localStorage.getItem(DEFAULT_COMMISSION_RATE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COMMISSION_RATE;
  } catch {
    return DEFAULT_COMMISSION_RATE;
  }
}

interface CommissionPaymentLocal {
  amount?: string | number;
  check?: string;
  date?: string;
}

interface CommissionLogLocalRow {
  payments?: CommissionPaymentLocal[];
  payment1?: string | number;
  payment2?: string | number;
  payment1Check?: string;
  payment2Check?: string;
  payment1Date?: string;
  payment2Date?: string;
  commissionRate?: string | number;
  paymentsManual?: boolean;
  isPaid?: boolean;
  updatedAt?: string;
}

function migrateLocalRow(local: CommissionLogLocalRow): CommissionLogLocalRow {
  if (Array.isArray(local.payments)) return local;
  const payments: CommissionPaymentLocal[] = [];
  const legacy = [
    { amount: local.payment1, check: local.payment1Check, date: local.payment1Date },
    { amount: local.payment2, check: local.payment2Check, date: local.payment2Date },
  ];
  for (const entry of legacy) {
    if (entry.amount !== undefined || entry.check || entry.date) {
      payments.push(entry);
    }
  }
  if (!payments.length) return local;
  return { ...local, payments };
}

function hasExplicitAmount(value: string | number | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function isPaymentsManual(local: CommissionLogLocalRow): boolean {
  const migrated = migrateLocalRow(local);
  if (migrated.paymentsManual) return true;
  if (Array.isArray(migrated.payments)) {
    return migrated.payments.some((payment) => hasExplicitAmount(payment.amount));
  }
  return hasExplicitAmount(local.payment1) || hasExplicitAmount(local.payment2);
}

function readCommissionLogRows(): Record<string, CommissionLogLocalRow> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COMMISSION_LOGS_STORAGE_KEY);
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, CommissionLogLocalRow>)
      : {};
  } catch {
    return {};
  }
}

interface PaymentScheduleDoc {
  type?: string;
  items?: Array<{
    label?: string;
    amountType?: string;
    percentage?: number;
    amount?: number;
    dueType?: string;
    sortOrder?: number;
  }>;
}

interface JobDoc {
  _id?: string;
  title?: string;
  customerId?: string | { name?: string };
  assignedTo?: string | { name?: string };
  stage?: string;
  valueContracted?: number;
  valueEstimated?: number;
  paymentSchedule?: PaymentScheduleDoc;
}

interface EstimateDoc {
  jobId?: string | { _id?: string };
  grandTotal?: number;
  createdAt?: string;
}

interface CommissionSourceJobRow {
  jobId: string;
  customerName: string;
  jobLabel: string;
  assignedToName: string;
  stageLabel: string;
  jobTotal: number;
  paymentSchedule?: PaymentScheduleDoc;
}

interface CommissionPaymentDisplay {
  label: string;
  scheduledAmount: number;
  amount: number;
  check: string;
  date: string;
}

interface CommissionTableRow extends CommissionSourceJobRow {
  commissionRate: number;
  commissionDue: number;
  payments: CommissionPaymentDisplay[];
  paymentsManual: boolean;
  isPaid: boolean;
  balance: number;
}

function CommissionLogsPage() {
  const [loadingCommissionLogs, setLoadingCommissionLogs] = useState(false);
  const [commissionSourceJobs, setCommissionSourceJobs] = useState<CommissionSourceJobRow[]>([]);
  const [showJoesJobsOnly, setShowJoesJobsOnly] = useState(true);
  const [joeFilter, setJoeFilter] = useState('joe');
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(() => readDefaultCommissionRate());
  const [commissionLogRows, setCommissionLogRows] = useState<Record<string, CommissionLogLocalRow>>(
    () => readCommissionLogRows(),
  );

  const updateCommissionRow = (
    jobId: string,
    patch: Partial<CommissionLogLocalRow>,
  ) => {
    setCommissionLogRows((prev) => {
      const current = migrateLocalRow(prev[jobId] || {});
      return {
        ...prev,
        [jobId]: {
          ...current,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const updateCommissionPayment = (
    jobId: string,
    index: number,
    patch: Partial<CommissionPaymentLocal>,
    options?: { manual?: boolean },
  ) => {
    setCommissionLogRows((prev) => {
      const current = migrateLocalRow(prev[jobId] || {});
      const payments = [...(current.payments || [])];
      while (payments.length <= index) payments.push({});
      payments[index] = { ...payments[index], ...patch };
      return {
        ...prev,
        [jobId]: {
          ...current,
          payments,
          paymentsManual: options?.manual !== false ? true : current.paymentsManual,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const resetPaymentSplit = (jobId: string) => {
    updateCommissionRow(jobId, {
      paymentsManual: false,
      payments: [],
    });
  };

  const commissionTableRows = useMemo((): CommissionTableRow[] => {
    const needle = String(joeFilter || '').trim().toLowerCase();
    return commissionSourceJobs
      .filter((row) => {
        if (!showJoesJobsOnly) return true;
        const assignee = String(row.assignedToName || '').toLowerCase();
        if (!needle) return assignee.includes('joe');
        return assignee.includes(needle);
      })
      .map((row) => {
        const local = migrateLocalRow(commissionLogRows[String(row.jobId)] || {});
        const manual = isPaymentsManual(local);
        const rateRaw = local.commissionRate ?? defaultCommissionRate;
        const commissionRate = Number(rateRaw);
        const safeRate = Number.isFinite(commissionRate) && commissionRate >= 0 ? commissionRate : 0;
        const jobTotal = roundMoney(row.jobTotal);
        const commissionDue = roundMoney(jobTotal * (safeRate / 100));

        const splits = getCommissionPaymentSplits(
          {
            paymentSchedule: row.paymentSchedule,
            valueContracted: jobTotal,
            valueEstimated: jobTotal,
          },
          jobTotal,
          commissionDue,
        );

        const savedPayments = local.payments || [];
        const payments: CommissionPaymentDisplay[] = splits.map((split, idx) => {
          const saved = savedPayments[idx] || {};
          const amount =
            manual && hasExplicitAmount(saved.amount)
              ? roundMoney(Number(saved.amount || 0))
              : split.amount;
          return {
            label: split.label,
            scheduledAmount: split.scheduledAmount,
            amount,
            check: String(saved.check || ''),
            date: String(saved.date || ''),
          };
        });

        const paidTotal = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
        const balance = roundMoney(commissionDue - paidTotal);
        const normalizedBalance = balance < 0 ? 0 : balance;
        const markedPaid = Boolean(local.isPaid) || normalizedBalance <= 0;

        return {
          ...row,
          commissionRate: safeRate,
          commissionDue,
          payments,
          paymentsManual: manual,
          isPaid: markedPaid,
          balance: normalizedBalance,
        };
      })
      .sort((a, b) => {
        if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
        return String(a.customerName || '').localeCompare(String(b.customerName || ''));
      });
  }, [commissionSourceJobs, commissionLogRows, showJoesJobsOnly, joeFilter, defaultCommissionRate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMMISSION_LOGS_STORAGE_KEY, JSON.stringify(commissionLogRows || {}));
  }, [commissionLogRows]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DEFAULT_COMMISSION_RATE_KEY, String(defaultCommissionRate));
  }, [defaultCommissionRate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoadingCommissionLogs(true);
        const [{ data: jobsData }, { data: estimatesData }] = await Promise.all([
          axios.get<{ jobs?: JobDoc[] }>(`${API_URL}/jobs`, {
            params: { limit: 1000, includeCompletedClosedOut: true },
          }),
          axios.get<EstimateDoc[]>(`${API_URL}/estimates`),
        ]);
        const jobs = Array.isArray(jobsData?.jobs) ? jobsData.jobs : [];
        const estimates = Array.isArray(estimatesData) ? estimatesData : [];
        const latestEstimateByJob = new Map<string, EstimateDoc>();
        for (const est of estimates) {
          const jid = est?.jobId;
          const jobIdRaw = typeof jid === 'object' && jid !== null ? jid._id : jid;
          const jobId = String(jobIdRaw || '');
          if (!jobId) continue;
          const prev = latestEstimateByJob.get(jobId);
          const estTime = new Date(est?.createdAt || 0).getTime();
          const prevTime = prev ? new Date(prev?.createdAt || 0).getTime() : -1;
          if (!prev || estTime > prevTime) latestEstimateByJob.set(jobId, est);
        }
        const rows: CommissionSourceJobRow[] = jobs.map((job) => {
          const estimate = latestEstimateByJob.get(String(job?._id || ''));
          const fullAmount =
            Number(estimate?.grandTotal ?? job?.valueContracted ?? job?.valueEstimated ?? 0) || 0;
          return {
            jobId: String(job?._id || ''),
            customerName:
              (typeof job?.customerId === 'object' && job?.customerId?.name) || 'Unknown customer',
            jobLabel: jobTitleAfterPipe(job?.title),
            assignedToName:
              (typeof job?.assignedTo === 'object' && job?.assignedTo?.name) ||
              String(job?.assignedTo || ''),
            stageLabel: ESTIMATE_STAGE_LABELS[job?.stage ?? ''] || String(job?.stage || ''),
            jobTotal: roundMoney(fullAmount),
            paymentSchedule: job?.paymentSchedule,
          };
        });
        if (!cancelled) setCommissionSourceJobs(rows);
      } catch (error) {
        console.error('Error loading commission logs:', error);
        if (!cancelled) {
          setCommissionSourceJobs([]);
          const message =
            isAxiosError(error) &&
            error.response?.data &&
            typeof error.response.data === 'object' &&
            'error' in error.response.data
              ? String((error.response.data as { error?: unknown }).error ?? 'Failed to load commission logs')
              : 'Failed to load commission logs';
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoadingCommissionLogs(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', py: 1 }}>
      <Card sx={{ width: '100%' }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1.5,
              mb: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                Commission Logs
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Commission due is job total × rate. Each payment follows that job&apos;s payment
                schedule (1, 2, 3, or more); edit amounts to override.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                label="Default rate"
                value={defaultCommissionRate}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDefaultCommissionRate(Number.isFinite(n) && n >= 0 ? n : 0);
                }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  inputProps: { inputMode: 'decimal', min: 0, step: 0.1 },
                }}
                sx={{ width: 130 }}
              />
              <Button
                variant={showJoesJobsOnly ? 'contained' : 'outlined'}
                onClick={() => setShowJoesJobsOnly(true)}
              >
                Joe&apos;s Jobs
              </Button>
              <Button
                variant={!showJoesJobsOnly ? 'contained' : 'outlined'}
                onClick={() => setShowJoesJobsOnly(false)}
              >
                All Jobs
              </Button>
            </Box>
          </Box>

          {showJoesJobsOnly && (
            <TextField
              size="small"
              label="Salesperson filter"
              value={joeFilter}
              onChange={(e) => setJoeFilter(e.target.value)}
              helperText="Leave as joe to track Joe's jobs, or type another name."
              sx={{ mb: 2, minWidth: 280 }}
            />
          )}

          {loadingCommissionLogs ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : commissionTableRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No jobs matched this filter.
            </Typography>
          ) : (
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                overflow: 'auto',
                maxHeight: 'calc(100vh - 240px)',
              }}
            >
              <Table stickyHeader size="small" sx={{ minWidth: 1100 }}>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        minWidth: 140,
                        bgcolor: 'background.paper',
                      }}
                    >
                      Customer
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 160, bgcolor: 'background.paper' }}>
                      Job
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, minWidth: 100, bgcolor: 'background.paper' }}
                      align="right"
                    >
                      Job Total
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, minWidth: 90, bgcolor: 'background.paper' }}
                      align="right"
                    >
                      Rate
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, minWidth: 110, bgcolor: 'background.paper' }}
                      align="right"
                    >
                      Commission
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 360, bgcolor: 'background.paper' }}>
                      Payments
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, minWidth: 100, bgcolor: 'background.paper' }}
                      align="right"
                    >
                      Balance
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, minWidth: 90, bgcolor: 'background.paper' }}>
                      Paid
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {commissionTableRows.map((row) => (
                    <TableRow key={row.jobId} hover>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {row.jobLabel || 'Untitled'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.stageLabel || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">${formatMoney(row.jobTotal)}</TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small"
                          value={row.commissionRate}
                          onChange={(e) =>
                            updateCommissionRow(row.jobId, { commissionRate: e.target.value })
                          }
                          InputProps={{
                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                            inputProps: { inputMode: 'decimal', min: 0, step: 0.1 },
                          }}
                          sx={{ width: 88 }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        ${formatMoney(row.commissionDue)}
                      </TableCell>
                      <TableCell sx={{ p: 1 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1,
                            overflowX: 'auto',
                            pb: 0.5,
                          }}
                        >
                          {row.payments.map((payment, idx) => (
                            <Box
                              key={`${row.jobId}-${idx}`}
                              sx={{
                                minWidth: 196,
                                flex: '0 0 auto',
                                p: 1,
                                border: 1,
                                borderColor: 'divider',
                                borderRadius: 1,
                                bgcolor: 'action.hover',
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 700, display: 'block', mb: 0.25 }}
                              >
                                {payment.label}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mb: 0.75 }}
                              >
                                Job: ${formatMoney(payment.scheduledAmount)}
                              </Typography>
                              <TextField
                                size="small"
                                fullWidth
                                value={payment.amount || ''}
                                onChange={(e) =>
                                  updateCommissionPayment(row.jobId, idx, { amount: e.target.value })
                                }
                                placeholder="Amount"
                                sx={{ mb: 0.75 }}
                                InputProps={{
                                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                                  inputProps: { inputMode: 'decimal' },
                                }}
                              />
                              <TextField
                                size="small"
                                fullWidth
                                type="date"
                                value={payment.date}
                                onChange={(e) =>
                                  updateCommissionPayment(row.jobId, idx, { date: e.target.value }, {
                                    manual: false,
                                  })
                                }
                                sx={{ mb: 0.75 }}
                                InputLabelProps={{ shrink: true }}
                              />
                              <TextField
                                size="small"
                                fullWidth
                                value={payment.check}
                                onChange={(e) =>
                                  updateCommissionPayment(row.jobId, idx, { check: e.target.value }, {
                                    manual: false,
                                  })
                                }
                                placeholder="Check #"
                              />
                            </Box>
                          ))}
                          {row.paymentsManual && (
                            <Tooltip title="Reset to schedule split">
                              <IconButton
                                size="small"
                                onClick={() => resetPaymentSplit(row.jobId)}
                                aria-label="Reset payment split"
                                sx={{ mt: 0.5 }}
                              >
                                <RefreshIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            color: row.balance <= 0 ? 'success.main' : 'text.primary',
                          }}
                        >
                          ${formatMoney(row.balance)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <FormControlLabel
                          sx={{ mr: 0 }}
                          control={
                            <Checkbox
                              checked={row.isPaid}
                              onChange={(e) =>
                                updateCommissionRow(row.jobId, { isPaid: e.target.checked })
                              }
                            />
                          }
                          label={row.isPaid ? 'Paid' : 'Open'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default CommissionLogsPage;
