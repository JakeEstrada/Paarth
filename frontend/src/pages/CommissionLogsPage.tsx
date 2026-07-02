/**
 * CommissionLogsPage — Sales commission logs.
 * Route: /commission-logs
 * Docs: ../../../docs/PAGES.md#commissionlogspagetsx
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  alpha,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios, { isAxiosError } from 'axios';
import { format } from 'date-fns';
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

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  invoiced: 'Invoiced',
  paid: 'Paid',
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

function toDateInputValue(value: unknown): string {
  if (!value) return '';
  try {
    return format(new Date(String(value)), 'yyyy-MM-dd');
  } catch {
    return '';
  }
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
  amountManual?: boolean;
}

interface CommissionLogLocalRow {
  payments?: CommissionPaymentLocal[];
  paymentOrder?: number[];
  payment1?: string | number;
  payment2?: string | number;
  payment1Check?: string;
  payment2Check?: string;
  payment1Date?: string;
  payment2Date?: string;
  commissionRate?: string | number;
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
      payments.push({
        ...entry,
        amountManual: entry.amount !== undefined,
      });
    }
  }
  if (!payments.length) return local;
  return { ...local, payments };
}

function hasRateOverride(local: CommissionLogLocalRow): boolean {
  return local.commissionRate !== undefined && local.commissionRate !== '';
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
    status?: string;
    paidAt?: string | null;
    paidAmount?: number;
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

interface JobsListResponse {
  jobs?: JobDoc[];
  totalPages?: number;
}

interface CompletedJobsGroup {
  jobs?: JobDoc[];
}

async function fetchAllCommissionJobs(): Promise<JobDoc[]> {
  const jobsById = new Map<string, JobDoc>();
  const limit = 500;
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const { data } = await axios.get<JobsListResponse>(`${API_URL}/jobs`, {
      params: {
        page,
        limit,
        includeCompletedClosedOut: true,
        includeArchived: true,
      },
    });
    const batch = Array.isArray(data?.jobs) ? data.jobs : [];
    for (const job of batch) {
      jobsById.set(String(job._id || ''), job);
    }
    totalPages = Math.max(1, Number(data?.totalPages) || 1);
    page += 1;
  }

  try {
    const { data: completedGroups } = await axios.get<CompletedJobsGroup[]>(
      `${API_URL}/jobs/completed`,
    );
    if (Array.isArray(completedGroups)) {
      for (const group of completedGroups) {
        const groupJobs = Array.isArray(group?.jobs) ? group.jobs : [];
        for (const job of groupJobs) {
          const id = String(job._id || '');
          if (id && !jobsById.has(id)) jobsById.set(id, job);
        }
      }
    }
  } catch (error) {
    console.warn('Could not merge completed jobs into commission logs:', error);
  }

  return Array.from(jobsById.values());
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
  scheduleIndex: number;
  label: string;
  scheduledAmount: number;
  potentialAmount: number;
  amount: number;
  displayAmount: string | number;
  check: string;
  date: string;
  status: string;
  amountManual: boolean;
  isSettled: boolean;
}

interface CommissionTableRow extends CommissionSourceJobRow {
  commissionRate: number;
  rateOverridden: boolean;
  commissionDue: number;
  payments: CommissionPaymentDisplay[];
  hasManualPayments: boolean;
  balance: number;
  isRowSettled: boolean;
}

function isSettledPayment(
  payment: Pick<CommissionPaymentDisplay, 'status' | 'potentialAmount' | 'amount'>,
  commissionRate: number,
): boolean {
  if (commissionRate <= 0) return true;
  if (payment.status === 'paid') return true;
  if (payment.potentialAmount <= 0 && payment.amount <= 0) return true;
  return false;
}

function orderPaymentsForDisplay(
  payments: CommissionPaymentDisplay[],
  paymentOrder: number[] | undefined,
): CommissionPaymentDisplay[] {
  const active = payments.filter((payment) => !payment.isSettled);
  const settled = payments.filter((payment) => payment.isSettled);

  const settledSorted = [...settled].sort((a, b) =>
    String(a.label || '').localeCompare(String(b.label || '')),
  );

  let activeSorted: CommissionPaymentDisplay[];
  if (Array.isArray(paymentOrder) && paymentOrder.length > 0) {
    const orderMap = new Map(paymentOrder.map((idx, order) => [idx, order]));
    activeSorted = [...active].sort((a, b) => {
      const aOrder = orderMap.get(a.scheduleIndex);
      const bOrder = orderMap.get(b.scheduleIndex);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a.scheduleIndex - b.scheduleIndex;
    });
  } else {
    activeSorted = [...active].sort((a, b) => a.scheduleIndex - b.scheduleIndex);
  }

  return [...activeSorted, ...settledSorted];
}

function paymentCardStyles(
  theme: ReturnType<typeof useTheme>,
  payment: CommissionPaymentDisplay,
) {
  if (payment.isSettled) {
    return {
      borderColor: 'success.main',
      bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.32 : 0.2),
    };
  }
  if (payment.status === 'invoiced') {
    return {
      borderColor: 'warning.main',
      bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.18 : 0.12),
    };
  }
  return {
    borderColor: 'divider',
    bgcolor: 'background.paper',
  };
}

interface SortablePaymentCardProps {
  payment: CommissionPaymentDisplay;
  jobId: string;
  draggable: boolean;
  onUpdateAmount: (scheduleIndex: number, value: string) => void;
  onUpdateDate: (scheduleIndex: number, value: string) => void;
  onUpdateCheck: (scheduleIndex: number, value: string) => void;
}

function SortablePaymentCard({
  payment,
  jobId,
  draggable,
  onUpdateAmount,
  onUpdateDate,
  onUpdateCheck,
}: SortablePaymentCardProps) {
  const theme = useTheme();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${jobId}-${payment.scheduleIndex}`,
    disabled: !draggable,
  });

  const cardStyle = paymentCardStyles(theme, payment);
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        minWidth: 196,
        flex: '0 0 auto',
        p: 1,
        border: 1,
        borderRadius: 1,
        ...cardStyle,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 0.5,
          mb: 0.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
          {draggable && (
            <Box
              {...attributes}
              {...listeners}
              sx={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'grab',
                color: 'text.secondary',
                touchAction: 'none',
                '&:active': { cursor: 'grabbing' },
              }}
              aria-label="Drag to reorder payment"
            >
              <DragIndicatorIcon sx={{ fontSize: 16 }} />
            </Box>
          )}
          <Typography variant="caption" sx={{ fontWeight: 700 }} noWrap>
            {payment.label}
          </Typography>
        </Box>
        <Chip
          size="small"
          variant={payment.isSettled || payment.status === 'paid' ? 'filled' : 'outlined'}
          label={PAYMENT_STATUS_LABELS[payment.status] || payment.status}
          color={
            payment.isSettled || payment.status === 'paid'
              ? 'success'
              : payment.status === 'invoiced'
                ? 'warning'
                : 'default'
          }
          sx={{ height: 20, fontSize: '0.65rem', flexShrink: 0 }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        Job: ${formatMoney(payment.scheduledAmount)}
        {!payment.isSettled && payment.potentialAmount > 0
          ? ` · Due: $${formatMoney(payment.potentialAmount)}`
          : ''}
      </Typography>
      <TextField
        size="small"
        fullWidth
        value={payment.displayAmount}
        onChange={(e) => onUpdateAmount(payment.scheduleIndex, e.target.value)}
        placeholder={
          payment.status === 'paid'
            ? 'Amount'
            : payment.potentialAmount > 0
              ? `Auto: $${formatMoney(payment.potentialAmount)}`
              : 'Amount'
        }
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
        onChange={(e) => onUpdateDate(payment.scheduleIndex, e.target.value)}
        sx={{ mb: 0.75 }}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        size="small"
        fullWidth
        value={payment.check}
        onChange={(e) => onUpdateCheck(payment.scheduleIndex, e.target.value)}
        placeholder="Check #"
      />
    </Box>
  );
}

interface JobPaymentCardsProps {
  row: CommissionTableRow;
  onReorder: (jobId: string, order: number[]) => void;
  onUpdateAmount: (jobId: string, scheduleIndex: number, value: string) => void;
  onUpdateDate: (jobId: string, scheduleIndex: number, value: string) => void;
  onUpdateCheck: (jobId: string, scheduleIndex: number, value: string) => void;
  onResetOverrides: (jobId: string) => void;
}

function JobPaymentCards({
  row,
  onReorder,
  onUpdateAmount,
  onUpdateDate,
  onUpdateCheck,
  onResetOverrides,
}: JobPaymentCardsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const activePayments = row.payments.filter((payment) => !payment.isSettled);
  const settledPayments = row.payments.filter((payment) => payment.isSettled);
  const sortableIds = activePayments.map((payment) => `${row.jobId}-${payment.scheduleIndex}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIdx = sortableIds.indexOf(String(active.id));
    const overIdx = sortableIds.indexOf(String(over.id));
    if (activeIdx < 0 || overIdx < 0) return;

    const currentOrder = activePayments.map((payment) => payment.scheduleIndex);
    const nextOrder = arrayMove(currentOrder, activeIdx, overIdx);
    onReorder(row.jobId, nextOrder);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pb: 0.5 }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {activePayments.map((payment) => (
            <SortablePaymentCard
              key={`${row.jobId}-${payment.scheduleIndex}`}
              payment={payment}
              jobId={row.jobId}
              draggable
              onUpdateAmount={(scheduleIndex, value) => onUpdateAmount(row.jobId, scheduleIndex, value)}
              onUpdateDate={(scheduleIndex, value) => onUpdateDate(row.jobId, scheduleIndex, value)}
              onUpdateCheck={(scheduleIndex, value) => onUpdateCheck(row.jobId, scheduleIndex, value)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {settledPayments.map((payment) => (
        <SortablePaymentCard
          key={`${row.jobId}-${payment.scheduleIndex}-settled`}
          payment={payment}
          jobId={row.jobId}
          draggable={false}
          onUpdateAmount={(scheduleIndex, value) => onUpdateAmount(row.jobId, scheduleIndex, value)}
          onUpdateDate={(scheduleIndex, value) => onUpdateDate(row.jobId, scheduleIndex, value)}
          onUpdateCheck={(scheduleIndex, value) => onUpdateCheck(row.jobId, scheduleIndex, value)}
        />
      ))}
      {row.hasManualPayments && (
        <Tooltip title="Reset manual amounts to job payment status">
          <IconButton
            size="small"
            onClick={() => onResetOverrides(row.jobId)}
            aria-label="Reset payment overrides"
            sx={{ mt: 0.5 }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

function CommissionLogsPage() {
  const theme = useTheme();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(1100);
  const [loadingCommissionLogs, setLoadingCommissionLogs] = useState(false);
  const [commissionSourceJobs, setCommissionSourceJobs] = useState<CommissionSourceJobRow[]>([]);
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(() => readDefaultCommissionRate());
  const [commissionLogRows, setCommissionLogRows] = useState<Record<string, CommissionLogLocalRow>>(
    () => readCommissionLogRows(),
  );

  const updateCommissionRow = (jobId: string, patch: Partial<CommissionLogLocalRow>) => {
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

  const clearRateOverride = (jobId: string) => {
    setCommissionLogRows((prev) => {
      const current = migrateLocalRow(prev[jobId] || {});
      const next = { ...current };
      delete next.commissionRate;
      return {
        ...prev,
        [jobId]: {
          ...next,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const updateCommissionPayment = (
    jobId: string,
    scheduleIndex: number,
    patch: Partial<CommissionPaymentLocal>,
    options?: { manual?: boolean },
  ) => {
    setCommissionLogRows((prev) => {
      const current = migrateLocalRow(prev[jobId] || {});
      const payments = [...(current.payments || [])];
      while (payments.length <= scheduleIndex) payments.push({});
      const nextPatch = { ...patch };
      if (options?.manual === true) {
        nextPatch.amountManual = true;
      }
      if (options?.manual === false) {
        nextPatch.amountManual = false;
      }
      payments[scheduleIndex] = { ...payments[scheduleIndex], ...nextPatch };
      return {
        ...prev,
        [jobId]: {
          ...current,
          payments,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  const reorderPayments = (jobId: string, order: number[]) => {
    updateCommissionRow(jobId, { paymentOrder: order });
  };

  const handlePaymentAmountChange = (jobId: string, scheduleIndex: number, value: string) => {
    if (value === '') {
      updateCommissionPayment(jobId, scheduleIndex, { amount: '', amountManual: false }, { manual: false });
    } else {
      updateCommissionPayment(jobId, scheduleIndex, { amount: value }, { manual: true });
    }
  };

  const resetPaymentOverrides = (jobId: string) => {
    updateCommissionRow(jobId, { payments: [], paymentOrder: [] });
  };

  const commissionTableRows = useMemo((): CommissionTableRow[] => {
    return commissionSourceJobs
      .map((row) => {
        const local = migrateLocalRow(commissionLogRows[String(row.jobId)] || {});
        const rateOverridden = hasRateOverride(local);
        const rateRaw = rateOverridden ? local.commissionRate : defaultCommissionRate;
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
        const builtPayments: CommissionPaymentDisplay[] = splits.map((split, idx) => {
          const saved = savedPayments[idx] || {};
          const status = split.status || 'pending';
          const potentialAmount = split.amount;
          const autoDate = status === 'paid' ? toDateInputValue(split.paidAt) : '';

          let amount = 0;
          let displayAmount: string | number = '';
          const amountManual = Boolean(saved.amountManual);

          if (amountManual) {
            displayAmount = saved.amount ?? '';
            amount = roundMoney(Number(saved.amount || 0));
          } else if (status === 'paid') {
            amount = potentialAmount;
            displayAmount = potentialAmount || '';
          }

          const payment: CommissionPaymentDisplay = {
            scheduleIndex: idx,
            label: split.label,
            scheduledAmount: split.scheduledAmount,
            potentialAmount,
            amount,
            displayAmount,
            check: String(saved.check || ''),
            date: String(saved.date || autoDate),
            status,
            amountManual,
            isSettled: false,
          };
          payment.isSettled = isSettledPayment(payment, safeRate);
          return payment;
        });

        const payments = orderPaymentsForDisplay(builtPayments, local.paymentOrder);

        const paidTotal = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
        const balance = roundMoney(commissionDue - paidTotal);
        const normalizedBalance = balance < 0 ? 0 : balance;
        const hasManualPayments = payments.some((payment) => payment.amountManual);
        const isRowSettled = safeRate <= 0 || normalizedBalance <= 0;

        return {
          ...row,
          commissionRate: safeRate,
          rateOverridden,
          commissionDue,
          payments,
          hasManualPayments,
          balance: normalizedBalance,
          isRowSettled,
        };
      })
      .sort((a, b) => {
        if (a.isRowSettled !== b.isRowSettled) return a.isRowSettled ? 1 : -1;
        return String(a.customerName || '').localeCompare(String(b.customerName || ''));
      });
  }, [commissionSourceJobs, commissionLogRows, defaultCommissionRate]);

  useEffect(() => {
    const tableEl = tableInnerRef.current;
    if (!tableEl) return;
    const updateWidth = () => setTableScrollWidth(tableEl.scrollWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, [commissionTableRows, loadingCommissionLogs]);

  useEffect(() => {
    const tableScroll = tableScrollRef.current;
    const bottomScroll = bottomScrollRef.current;
    if (!tableScroll || !bottomScroll) return;

    const syncFromTable = () => {
      bottomScroll.scrollLeft = tableScroll.scrollLeft;
    };
    const syncFromBottom = () => {
      tableScroll.scrollLeft = bottomScroll.scrollLeft;
    };

    tableScroll.addEventListener('scroll', syncFromTable);
    bottomScroll.addEventListener('scroll', syncFromBottom);
    return () => {
      tableScroll.removeEventListener('scroll', syncFromTable);
      bottomScroll.removeEventListener('scroll', syncFromBottom);
    };
  }, [commissionTableRows, loadingCommissionLogs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMMISSION_LOGS_STORAGE_KEY, JSON.stringify(commissionLogRows || {}));
  }, [commissionLogRows]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DEFAULT_COMMISSION_RATE_KEY, String(defaultCommissionRate));
  }, [defaultCommissionRate]);

  const loadCommissionJobs = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      setLoadingCommissionLogs(true);
      const [jobs, estimatesData] = await Promise.all([
        fetchAllCommissionJobs(),
        axios.get<EstimateDoc[]>(`${API_URL}/estimates`),
      ]);
      if (signal?.cancelled) return;
      const estimates = Array.isArray(estimatesData.data) ? estimatesData.data : [];
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
      setCommissionSourceJobs(rows);
    } catch (error) {
      console.error('Error loading commission logs:', error);
      if (!signal?.cancelled) {
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
      if (!signal?.cancelled) setLoadingCommissionLogs(false);
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    void loadCommissionJobs(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadCommissionJobs]);

  useEffect(() => {
    const handleFocus = () => {
      void loadCommissionJobs();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadCommissionJobs]);

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
                Amounts auto-fill when a job payment is marked paid in the job modal. Default rate
                applies to all rows unless you override rate or amount.
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
            </Box>
          </Box>

          {loadingCommissionLogs ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : commissionTableRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No jobs found.
            </Typography>
          ) : (
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(100vh - 240px)',
              }}
            >
              <Box
                ref={tableScrollRef}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                }}
              >
                <Box ref={tableInnerRef} sx={{ display: 'inline-block', minWidth: '100%' }}>
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
                  </TableRow>
                </TableHead>
                <TableBody>
                  {commissionTableRows.map((row) => (
                    <TableRow
                      key={row.jobId}
                      hover
                      sx={
                        row.isRowSettled
                          ? {
                              bgcolor: alpha(
                                theme.palette.success.main,
                                theme.palette.mode === 'dark' ? 0.14 : 0.08,
                              ),
                            }
                          : undefined
                      }
                    >
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
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                          <TextField
                            size="small"
                            value={row.commissionRate}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '') {
                                clearRateOverride(row.jobId);
                              } else {
                                updateCommissionRow(row.jobId, { commissionRate: value });
                              }
                            }}
                            InputProps={{
                              endAdornment: <InputAdornment position="end">%</InputAdornment>,
                              inputProps: { inputMode: 'decimal', min: 0, step: 0.1 },
                            }}
                            sx={{ width: 88 }}
                          />
                          {row.rateOverridden && (
                            <Tooltip title="Use default rate">
                              <IconButton
                                size="small"
                                onClick={() => clearRateOverride(row.jobId)}
                                aria-label="Reset rate to default"
                              >
                                <RefreshIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        ${formatMoney(row.commissionDue)}
                      </TableCell>
                      <TableCell sx={{ p: 1 }}>
                        <JobPaymentCards
                          row={row}
                          onReorder={reorderPayments}
                          onUpdateAmount={handlePaymentAmountChange}
                          onUpdateDate={(jobId, scheduleIndex, value) =>
                            updateCommissionPayment(jobId, scheduleIndex, { date: value })
                          }
                          onUpdateCheck={(jobId, scheduleIndex, value) =>
                            updateCommissionPayment(jobId, scheduleIndex, { check: value })
                          }
                          onResetOverrides={resetPaymentOverrides}
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
                </Box>
              </Box>
              <Box
                ref={bottomScrollRef}
                sx={{
                  overflowX: 'scroll',
                  overflowY: 'hidden',
                  flexShrink: 0,
                  minHeight: 14,
                  borderTop: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  '&::-webkit-scrollbar': { height: 12 },
                  '&::-webkit-scrollbar-thumb': {
                    bgcolor: 'action.disabled',
                    borderRadius: 6,
                  },
                }}
              >
                <Box sx={{ width: tableScrollWidth, height: 1 }} />
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

export default CommissionLogsPage;
