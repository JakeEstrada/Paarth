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
  Container,
  FormControlLabel,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import axios, { isAxiosError } from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const COMMISSION_LOGS_STORAGE_KEY = 'financeHubCommissionLogsRows';

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

function roundMoneyClient(value: unknown): number {
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

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

interface CommissionLogLocalRow {
  payment1?: string | number;
  payment2?: string | number;
  payment1Check?: string;
  payment2Check?: string;
  isPaid?: boolean;
  updatedAt?: string;
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

interface JobDoc {
  _id?: string;
  title?: string;
  customerId?: string | { name?: string };
  assignedTo?: string | { name?: string };
  stage?: string;
  valueContracted?: number;
  valueEstimated?: number;
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
}

interface CommissionTableRow extends CommissionSourceJobRow {
  payment1: number;
  payment1Check: string;
  payment2: number;
  payment2Check: string;
  isPaid: boolean;
  balance: number;
}

type CommissionRowPatch = Partial<
  Pick<CommissionLogLocalRow, 'payment1' | 'payment2' | 'payment1Check' | 'payment2Check' | 'isPaid'>
>;

function CommissionLogsPage() {
  const [loadingCommissionLogs, setLoadingCommissionLogs] = useState(false);
  const [commissionSourceJobs, setCommissionSourceJobs] = useState<CommissionSourceJobRow[]>([]);
  const [showJoesJobsOnly, setShowJoesJobsOnly] = useState(true);
  const [joeFilter, setJoeFilter] = useState('joe');
  const [commissionLogRows, setCommissionLogRows] = useState<Record<string, CommissionLogLocalRow>>(
    () => readCommissionLogRows(),
  );

  const updateCommissionRow = (jobId: string | undefined, patch: CommissionRowPatch) => {
    const key = String(jobId || '');
    if (!key) return;
    setCommissionLogRows((prev) => {
      const current = prev[key] || {};
      return {
        ...prev,
        [key]: {
          ...current,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      };
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
        const local = commissionLogRows[String(row.jobId)] || {};
        const payment1 = Number(local.payment1 || 0);
        const payment2 = Number(local.payment2 || 0);
        const paidTotal = roundMoneyClient(payment1 + payment2);
        const balance = roundMoneyClient(Number(row.jobTotal || 0) - paidTotal);
        const normalizedBalance = balance < 0 ? 0 : balance;
        const markedPaid = Boolean(local.isPaid) || normalizedBalance <= 0;
        return {
          ...row,
          payment1,
          payment1Check: String(local.payment1Check || ''),
          payment2,
          payment2Check: String(local.payment2Check || ''),
          isPaid: markedPaid,
          balance: normalizedBalance,
        };
      })
      .sort((a, b) => {
        if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
        return String(a.customerName || '').localeCompare(String(b.customerName || ''));
      });
  }, [commissionSourceJobs, commissionLogRows, showJoesJobsOnly, joeFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMMISSION_LOGS_STORAGE_KEY, JSON.stringify(commissionLogRows || {}));
  }, [commissionLogRows]);

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
            jobTotal: roundMoneyClient(fullAmount),
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
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Card>
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
                Spreadsheet view of each job&apos;s full amount, payments, check numbers, and
                remaining balance.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 1100 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Job</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Assigned</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      Job Total
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Payment 1</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Check #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Payment 2</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Check #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">
                      Balance
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Paid</TableCell>
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
                      <TableCell>{row.assignedToName || '-'}</TableCell>
                      <TableCell align="right">${formatMoney(row.jobTotal)}</TableCell>
                      <TableCell sx={{ minWidth: 130 }}>
                        <TextField
                          size="small"
                          value={row.payment1 || ''}
                          onChange={(e) => updateCommissionRow(row.jobId, { payment1: e.target.value })}
                          InputProps={{
                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                            inputProps: { inputMode: 'decimal' },
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <TextField
                          size="small"
                          value={row.payment1Check}
                          onChange={(e) =>
                            updateCommissionRow(row.jobId, { payment1Check: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 130 }}>
                        <TextField
                          size="small"
                          value={row.payment2 || ''}
                          onChange={(e) => updateCommissionRow(row.jobId, { payment2: e.target.value })}
                          InputProps={{
                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                            inputProps: { inputMode: 'decimal' },
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth: 120 }}>
                        <TextField
                          size="small"
                          value={row.payment2Check}
                          onChange={(e) =>
                            updateCommissionRow(row.jobId, { payment2Check: e.target.value })
                          }
                        />
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
    </Container>
  );
}

export default CommissionLogsPage;
