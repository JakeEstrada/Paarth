/**
 * CommissionLogsPage — Sales commission logs.
 * Route: /commission-logs
 * Docs: ../../../docs/PAGES.md#commissionlogspagetsx
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios, { isAxiosError } from 'axios';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getCommissionPaymentSplits, getJobTotalWithChangeOrders, formatMoney, formatMoneyInput, roundMoney } from '../utils/paymentSchedule';
import { isCommissionEligibleJob } from '../utils/commissionJobEligibility';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const COMMISSION_LOGS_STORAGE_KEY = 'financeHubCommissionLogsRows';
const DEFAULT_COMMISSION_RATE_KEY = 'financeHubCommissionDefaultRate';
const COMMISSION_OVERVIEW_JOB_ORDER_KEY = 'financeHubCommissionOverviewJobOrder';
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

/** Prefer contracted/estimated job values; ignore zero-dollar estimate drafts. Includes change orders. */
function resolveCommissionJobTotal(job: JobDoc, estimate?: EstimateDoc): number {
  let base = 0;

  const contracted = Number(job?.valueContracted);
  if (Number.isFinite(contracted) && contracted > 0) base = roundMoney(contracted);
  else {
    const estimated = Number(job?.valueEstimated);
    if (Number.isFinite(estimated) && estimated > 0) base = roundMoney(estimated);
    else {
      const estimateTotal = Number(estimate?.grandTotal);
      if (Number.isFinite(estimateTotal) && estimateTotal > 0) base = roundMoney(estimateTotal);
    }
  }

  if (base <= 0) {
    const scheduleItems = job?.paymentSchedule?.items;
    if (Array.isArray(scheduleItems) && scheduleItems.length > 0) {
      let scheduleSum = 0;
      for (const item of scheduleItems) {
        const paid = Number(item.paidAmount);
        const fixed = Number(item.amount);
        if (Number.isFinite(paid) && paid > 0) scheduleSum += paid;
        else if (Number.isFinite(fixed) && fixed > 0) scheduleSum += fixed;
      }
      if (scheduleSum > 0) base = roundMoney(scheduleSum);
    }
  }

  if (base <= 0) {
    const deposit = Number(job?.contract?.depositReceived);
    const finalPaid = Number(job?.finalPayment?.amountPaid);
    const legacyTotal =
      (Number.isFinite(deposit) && deposit > 0 ? deposit : 0) +
      (Number.isFinite(finalPaid) && finalPaid > 0 ? finalPaid : 0);
    if (legacyTotal > 0) base = roundMoney(legacyTotal);
  }

  return getJobTotalWithChangeOrders({
    ...job,
    valueContracted: base,
    valueEstimated: base,
  });
}

function pickLatestPositiveEstimateByJob(estimates: EstimateDoc[]): Map<string, EstimateDoc> {
  const latestEstimateByJob = new Map<string, EstimateDoc>();
  for (const est of estimates) {
    const jid = est?.jobId;
    const jobIdRaw = typeof jid === 'object' && jid !== null ? jid._id : jid;
    const jobId = String(jobIdRaw || '');
    if (!jobId) continue;

    const grandTotal = Number(est?.grandTotal) || 0;
    if (grandTotal <= 0) continue;

    const prev = latestEstimateByJob.get(jobId);
    const estTime = new Date(est?.createdAt || 0).getTime();
    const prevTime = prev ? new Date(prev?.createdAt || 0).getTime() : -1;
    if (!prev || estTime > prevTime) latestEstimateByJob.set(jobId, est);
  }
  return latestEstimateByJob;
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

function readOverviewJobOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(COMMISSION_OVERVIEW_JOB_ORDER_KEY);
    const parsed: unknown = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function hasExplicitManualAmount(saved: CommissionPaymentLocal): boolean {
  if (!saved.amountManual) return false;
  if (saved.amount === undefined || saved.amount === null) return false;
  if (typeof saved.amount === 'string') return saved.amount.trim() !== '';
  return true;
}

interface CommissionPaymentLocal {
  amount?: string | number;
  check?: string;
  date?: string;
  amountManual?: boolean;
  salesmanPaid?: boolean;
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
  color?: string;
  isArchived?: boolean;
  customerId?: string | {
    name?: string;
    primaryPhone?: string;
    primaryEmail?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
  };
  assignedTo?: string | { name?: string };
  stage?: string;
  isDeadEstimate?: boolean;
  valueContracted?: number;
  valueEstimated?: number;
  changeOrders?: Array<{ description?: string; amount?: number }>;
  paymentSchedule?: PaymentScheduleDoc;
  contract?: {
    depositReceived?: number;
    depositReceivedAt?: string;
  };
  finalPayment?: {
    amountPaid?: number;
    paidAt?: string;
  };
  jobAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  jobContact?: {
    phone?: string;
    email?: string;
  };
  notes?: Array<{ content?: string }>;
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
        includeArchived: false,
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
          if (id && !job.isArchived && !jobsById.has(id)) jobsById.set(id, job);
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
  jobColor?: string;
  searchText: string;
  paymentSchedule?: PaymentScheduleDoc;
  contract?: JobDoc['contract'];
  finalPayment?: JobDoc['finalPayment'];
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
  customerPaid: boolean;
  salesmanPaid: boolean;
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

function isCommissionOverpaid(row: CommissionTableRow): boolean {
  return row.balance < -0.01;
}

function isOverviewPaidRow(row: CommissionTableRow): boolean {
  if (isCommissionOverpaid(row)) return false;
  if (row.payments.length > 0 && row.payments.every((payment) => payment.salesmanPaid)) {
    return true;
  }
  return row.isRowSettled;
}

function compareCustomerName(a: CommissionTableRow, b: CommissionTableRow): number {
  return String(a.customerName || '').localeCompare(String(b.customerName || ''));
}

function defaultCommissionRowSort(a: CommissionTableRow, b: CommissionTableRow): number {
  const aPaid = isOverviewPaidRow(a);
  const bPaid = isOverviewPaidRow(b);
  if (aPaid !== bPaid) return aPaid ? 1 : -1;
  return compareCustomerName(a, b);
}

function joinAddressParts(
  addr?: { street?: string; city?: string; state?: string; zip?: string } | null,
): string {
  if (!addr) return '';
  return [addr.street, addr.city, addr.state, addr.zip]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}

function moneySearchTokens(value: unknown): string[] {
  const n = roundMoney(Number(value));
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return [];
  return [String(n), n.toFixed(2), formatMoney(n)];
}

function buildCommissionJobSearchText(job: JobDoc, jobTotal: number): string {
  const parts: string[] = [];
  const customer = typeof job?.customerId === 'object' ? job.customerId : null;

  parts.push(
    String(job?.title || ''),
    String(customer?.name || ''),
    joinAddressParts(job?.jobAddress),
    joinAddressParts(customer?.address),
    String(job?.jobContact?.phone || ''),
    String(job?.jobContact?.email || ''),
    String(customer?.primaryPhone || ''),
    String(customer?.primaryEmail || ''),
  );

  for (const token of moneySearchTokens(jobTotal)) parts.push(token);
  for (const token of moneySearchTokens(job?.valueContracted)) parts.push(token);
  for (const token of moneySearchTokens(job?.valueEstimated)) parts.push(token);
  for (const token of moneySearchTokens(job?.contract?.depositReceived)) parts.push(token);
  for (const token of moneySearchTokens(job?.finalPayment?.amountPaid)) parts.push(token);

  for (const item of job?.paymentSchedule?.items || []) {
    parts.push(String(item?.label || ''));
    for (const token of moneySearchTokens(item?.amount)) parts.push(token);
    for (const token of moneySearchTokens(item?.paidAmount)) parts.push(token);
  }

  for (const co of job?.changeOrders || []) {
    parts.push(String(co?.description || ''));
    for (const token of moneySearchTokens(co?.amount)) parts.push(token);
  }

  for (const note of job?.notes || []) {
    parts.push(String(note?.content || ''));
  }

  return parts
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesCommissionSearch(row: CommissionTableRow, rawQuery: string): boolean {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;

  const qNormalized = q.replace(/[,$]/g, '');
  const haystackParts: unknown[] = [
    row.searchText,
    row.customerName,
    row.jobLabel,
    row.assignedToName,
    row.stageLabel,
    ...moneySearchTokens(row.jobTotal),
    ...moneySearchTokens(row.commissionDue),
    ...moneySearchTokens(row.balance),
    String(row.commissionRate),
    ...row.payments.flatMap((payment) => [
      payment.label,
      payment.check,
      payment.date,
      payment.status,
      payment.displayAmount,
      ...moneySearchTokens(payment.scheduledAmount),
      ...moneySearchTokens(payment.potentialAmount),
      ...moneySearchTokens(payment.amount),
    ]),
  ];

  const haystack = haystackParts
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  const haystackNormalized = haystack.replace(/[,$]/g, '');

  if (haystack.includes(q)) return true;
  return qNormalized.length > 0 && haystackNormalized.includes(qNormalized);
}

function applyOverviewJobOrder(
  rows: CommissionTableRow[],
  order: string[] | undefined,
): CommissionTableRow[] {
  const unpaid = rows.filter((row) => !isOverviewPaidRow(row));
  const paid = rows.filter((row) => isOverviewPaidRow(row)).sort(compareCustomerName);

  let orderedUnpaid: CommissionTableRow[];
  if (!order?.length) {
    orderedUnpaid = [...unpaid].sort(compareCustomerName);
  } else {
    const unpaidById = new Map(unpaid.map((row) => [row.jobId, row]));
    const ordered: CommissionTableRow[] = [];
    const seen = new Set<string>();

    for (const id of order) {
      const row = unpaidById.get(id);
      if (row) {
        ordered.push(row);
        seen.add(id);
      }
    }

    const remaining = unpaid.filter((row) => !seen.has(row.jobId)).sort(compareCustomerName);
    orderedUnpaid = [...ordered, ...remaining];
  }

  return [...orderedUnpaid, ...paid];
}

function tierChipStyles(
  theme: ReturnType<typeof useTheme>,
  payment: CommissionPaymentDisplay,
) {
  if (payment.salesmanPaid) {
    return {
      borderColor: 'success.main',
      bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.32 : 0.18),
      color: theme.palette.success.main,
    };
  }
  if (payment.customerPaid) {
    return {
      borderColor: 'grey.500',
      bgcolor: alpha(theme.palette.grey[500], theme.palette.mode === 'dark' ? 0.24 : 0.14),
      color: theme.palette.text.secondary,
    };
  }
  if (payment.status === 'invoiced') {
    return {
      borderColor: 'warning.main',
      bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.22 : 0.14),
      color: theme.palette.warning.main,
    };
  }
  return {
    borderColor: 'divider',
    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    color: 'text.secondary',
  };
}

interface CommissionOverviewTiersProps {
  payments: CommissionPaymentDisplay[];
}

function CommissionOverviewTiers({ payments }: CommissionOverviewTiersProps) {
  const theme = useTheme();
  const ordered = [...payments].sort((a, b) => a.scheduleIndex - b.scheduleIndex);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
      {ordered.map((payment) => {
        const styles = tierChipStyles(theme, payment);
        const dueAmount = payment.amount > 0 ? payment.amount : payment.potentialAmount;
        const statusLabel = payment.salesmanPaid
          ? 'Salesman paid'
          : payment.customerPaid
            ? 'Customer paid — commission owed'
            : PAYMENT_STATUS_LABELS[payment.status] || payment.status;
        return (
          <Tooltip
            key={payment.scheduleIndex}
            title={`${payment.label}: ${statusLabel} · ${formatMoney(dueAmount)} commission`}
          >
            <Box
              sx={{
                px: 1.25,
                py: 0.75,
                borderRadius: 1,
                border: 1,
                minWidth: 88,
                ...styles,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', lineHeight: 1.2 }}>
                {payment.label}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.9 }}>
                {formatMoney(dueAmount)}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

interface SortableOverviewRowProps {
  row: CommissionTableRow;
  onOpenPayments: (row: CommissionTableRow) => void;
}

function SortableOverviewRow({ row, onOpenPayments }: SortableOverviewRowProps) {
  const theme = useTheme();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.jobId, disabled: isOverviewPaidRow(row) });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      hover
      onClick={() => onOpenPayments(row)}
      sx={{
        cursor: 'pointer',
        ...(isCommissionOverpaid(row)
          ? {
              bgcolor: alpha(
                theme.palette.error.main,
                theme.palette.mode === 'dark' ? 0.12 : 0.08,
              ),
            }
          : row.isRowSettled
          ? {
              bgcolor: alpha(
                theme.palette.success.main,
                theme.palette.mode === 'dark' ? 0.1 : 0.06,
              ),
            }
          : undefined),
      }}
    >
      <TableCell sx={{ width: 40, px: 0.5, verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
        {!isOverviewPaidRow(row) ? (
          <IconButton
            size="small"
            {...attributes}
            {...listeners}
            sx={{
              cursor: 'grab',
              touchAction: 'none',
              color: 'text.secondary',
              '&:active': { cursor: 'grabbing' },
            }}
            aria-label={`Drag to reorder ${row.customerName}`}
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        ) : null}
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.customerName}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.jobLabel || 'Untitled'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {row.stageLabel || '-'}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ fontWeight: 600 }}>
        {formatMoney(row.jobTotal)}
      </TableCell>
      <TableCell sx={{ py: 1 }}>
        <CommissionOverviewTiers payments={row.payments} />
      </TableCell>
    </TableRow>
  );
}

interface CommissionOverviewTableProps {
  rows: CommissionTableRow[];
  onReorder: (order: string[]) => void;
  onOpenPayments: (row: CommissionTableRow) => void;
}

function CommissionOverviewTable({ rows, onReorder, onOpenPayments }: CommissionOverviewTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const rowIds = rows.map((row) => row.jobId);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const unpaidRows = rows.filter((row) => !isOverviewPaidRow(row));
    const unpaidIds = unpaidRows.map((row) => row.jobId);
    const oldIndex = unpaidIds.indexOf(String(active.id));
    const newIndex = unpaidIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(unpaidIds, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <Table stickyHeader size="small" sx={{ minWidth: 680 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 40, bgcolor: 'background.paper' }} />
            <TableCell sx={{ fontWeight: 700, minWidth: 140, bgcolor: 'background.paper' }}>
              Customer
            </TableCell>
            <TableCell sx={{ fontWeight: 700, minWidth: 140, bgcolor: 'background.paper' }}>
              Job
            </TableCell>
            <TableCell
              sx={{ fontWeight: 700, minWidth: 100, bgcolor: 'background.paper' }}
              align="right"
            >
              Job Total
            </TableCell>
            <TableCell sx={{ fontWeight: 700, minWidth: 280, bgcolor: 'background.paper' }}>
              Payment tiers
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            {rows.map((row) => (
              <SortableOverviewRow key={row.jobId} row={row} onOpenPayments={onOpenPayments} />
            ))}
          </SortableContext>
        </TableBody>
      </Table>
    </DndContext>
  );
}

function orderPaymentsForDisplay(
  payments: CommissionPaymentDisplay[],
  paymentOrder: number[] | undefined,
  options?: { preserveOrder?: boolean },
): CommissionPaymentDisplay[] {
  if (options?.preserveOrder) {
    if (Array.isArray(paymentOrder) && paymentOrder.length > 0) {
      const orderMap = new Map(paymentOrder.map((idx, order) => [idx, order]));
      return [...payments].sort((a, b) => {
        const aOrder = orderMap.get(a.scheduleIndex);
        const bOrder = orderMap.get(b.scheduleIndex);
        if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
        if (aOrder !== undefined) return -1;
        if (bOrder !== undefined) return 1;
        return a.scheduleIndex - b.scheduleIndex;
      });
    }
    return [...payments].sort((a, b) => a.scheduleIndex - b.scheduleIndex);
  }

  const active = payments.filter((payment) => !payment.salesmanPaid);
  const settled = payments.filter((payment) => payment.salesmanPaid);

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
  if (payment.salesmanPaid) {
    return {
      borderColor: 'success.main',
      bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.32 : 0.2),
    };
  }
  if (payment.customerPaid) {
    return {
      borderColor: 'grey.500',
      bgcolor: alpha(theme.palette.grey[500], theme.palette.mode === 'dark' ? 0.2 : 0.1),
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

function paymentStatusChipProps(payment: CommissionPaymentDisplay): {
  label: string;
  color: 'success' | 'warning' | 'default';
  variant: 'filled' | 'outlined';
} {
  if (payment.salesmanPaid) {
    return { label: 'Salesman paid', color: 'success', variant: 'filled' };
  }
  if (payment.customerPaid) {
    return { label: 'Customer paid', color: 'default', variant: 'filled' };
  }
  if (payment.status === 'invoiced') {
    return { label: PAYMENT_STATUS_LABELS.invoiced, color: 'warning', variant: 'outlined' };
  }
  return {
    label: PAYMENT_STATUS_LABELS[payment.status] || payment.status,
    color: 'default',
    variant: 'outlined',
  };
}

interface SortablePaymentCardProps {
  payment: CommissionPaymentDisplay;
  jobId: string;
  draggable: boolean;
  layout?: 'vertical' | 'horizontal';
  onUpdateAmount: (scheduleIndex: number, value: string) => void;
  onUpdateDate: (scheduleIndex: number, value: string) => void;
  onUpdateCheck: (scheduleIndex: number, value: string) => void;
  onUpdateSalesmanPaid: (scheduleIndex: number, paid: boolean) => void;
}

const paymentFieldSx = {
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
    { WebkitAppearance: 'none', margin: 0 },
};

function SortablePaymentCard({
  payment,
  jobId,
  draggable,
  layout = 'horizontal',
  onUpdateAmount,
  onUpdateDate,
  onUpdateCheck,
  onUpdateSalesmanPaid,
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
  const statusChip = paymentStatusChipProps(payment);
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  const isVertical = layout === 'vertical';

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        ...(isVertical
          ? { width: '100%', p: 1.5, borderRadius: 1.5 }
          : { minWidth: 196, flex: '0 0 auto', p: 1, borderRadius: 1 }),
        border: 1,
        ...cardStyle,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 0.5,
          mb: isVertical ? 1 : 0.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
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
              <DragIndicatorIcon sx={{ fontSize: isVertical ? 20 : 16 }} />
            </Box>
          )}
          <Typography
            variant={isVertical ? 'subtitle2' : 'caption'}
            sx={{ fontWeight: 700 }}
            noWrap={!isVertical}
          >
            {payment.label}
          </Typography>
        </Box>
        <Chip
          size="small"
          variant={statusChip.variant}
          label={statusChip.label}
          color={statusChip.color}
          sx={{ height: 22, fontSize: '0.7rem', flexShrink: 0 }}
        />
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: isVertical ? 1.25 : 0.75 }}
      >
        Job payment: {formatMoney(payment.scheduledAmount)}
        {!payment.salesmanPaid && payment.potentialAmount > 0
          ? ` · Commission due: ${formatMoney(payment.potentialAmount)}`
          : ''}
      </Typography>
      <Box
        sx={
          isVertical
            ? {
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'minmax(140px, 1fr) minmax(148px, 1fr) minmax(120px, 1fr) auto',
                },
                gap: 1.5,
                alignItems: 'center',
              }
            : undefined
        }
      >
        <TextField
          size="small"
          fullWidth
          label={isVertical ? 'Commission amount' : undefined}
          value={payment.displayAmount}
          onChange={(e) => onUpdateAmount(payment.scheduleIndex, e.target.value)}
          placeholder={
            payment.status === 'paid'
              ? 'Amount'
              : payment.potentialAmount > 0
                ? `Auto: ${formatMoney(payment.potentialAmount)}`
                : 'Amount'
          }
          sx={{ ...(isVertical ? paymentFieldSx : {}), mb: isVertical ? 0 : 0.75 }}
          InputProps={{
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
            inputProps: { inputMode: 'decimal' },
          }}
        />
        <TextField
          size="small"
          fullWidth
          type="date"
          label={isVertical ? 'Paid date' : undefined}
          value={payment.date}
          onChange={(e) => onUpdateDate(payment.scheduleIndex, e.target.value)}
          sx={{ mb: isVertical ? 0 : 0.75 }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          fullWidth
          label={isVertical ? 'Check #' : undefined}
          value={payment.check}
          onChange={(e) => onUpdateCheck(payment.scheduleIndex, e.target.value)}
          placeholder="Check #"
          sx={isVertical ? paymentFieldSx : undefined}
        />
        <FormControlLabel
          sx={{
            mt: isVertical ? 0 : 0.75,
            ml: 0,
            mr: 0,
            justifySelf: isVertical ? { md: 'start' } : undefined,
          }}
          control={
            <Checkbox
              size="small"
              checked={payment.salesmanPaid}
              onChange={(e) => onUpdateSalesmanPaid(payment.scheduleIndex, e.target.checked)}
            />
          }
          label={
            <Typography variant={isVertical ? 'body2' : 'caption'} sx={{ fontWeight: 600 }}>
              Salesman paid
            </Typography>
          }
        />
      </Box>
    </Box>
  );
}

interface JobPaymentCardsProps {
  row: CommissionTableRow;
  layout?: 'vertical' | 'horizontal';
  preserveOrder?: boolean;
  onReorder: (jobId: string, order: number[]) => void;
  onUpdateAmount: (jobId: string, scheduleIndex: number, value: string) => void;
  onUpdateDate: (jobId: string, scheduleIndex: number, value: string) => void;
  onUpdateCheck: (jobId: string, scheduleIndex: number, value: string) => void;
  onUpdateSalesmanPaid: (jobId: string, scheduleIndex: number, paid: boolean) => void;
  onResetOverrides: (jobId: string) => void;
}

function JobPaymentCards({
  row,
  layout = 'horizontal',
  preserveOrder = false,
  onReorder,
  onUpdateAmount,
  onUpdateDate,
  onUpdateCheck,
  onUpdateSalesmanPaid,
  onResetOverrides,
}: JobPaymentCardsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const isVertical = layout === 'vertical';
  const orderedPayments = preserveOrder
    ? [...row.payments].sort((a, b) => a.scheduleIndex - b.scheduleIndex)
    : row.payments;
  const activePayments = preserveOrder
    ? orderedPayments.filter((payment) => !payment.salesmanPaid)
    : row.payments.filter((payment) => !payment.salesmanPaid);
  const settledPayments = preserveOrder
    ? []
    : row.payments.filter((payment) => payment.salesmanPaid);
  const sortableIds = activePayments.map((payment) => `${row.jobId}-${payment.scheduleIndex}`);
  const sortStrategy = isVertical ? verticalListSortingStrategy : horizontalListSortingStrategy;

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

  const renderPaymentCard = (payment: CommissionPaymentDisplay, draggable: boolean, keySuffix = '') => (
    <SortablePaymentCard
      key={`${row.jobId}-${payment.scheduleIndex}${keySuffix}`}
      payment={payment}
      jobId={row.jobId}
      layout={layout}
      draggable={draggable}
      onUpdateAmount={(scheduleIndex, value) => onUpdateAmount(row.jobId, scheduleIndex, value)}
      onUpdateDate={(scheduleIndex, value) => onUpdateDate(row.jobId, scheduleIndex, value)}
      onUpdateCheck={(scheduleIndex, value) => onUpdateCheck(row.jobId, scheduleIndex, value)}
      onUpdateSalesmanPaid={(scheduleIndex, paid) =>
        onUpdateSalesmanPaid(row.jobId, scheduleIndex, paid)
      }
    />
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        alignItems: 'flex-start',
        gap: isVertical ? 1.5 : 1,
        pb: 0.5,
        width: isVertical ? '100%' : 'max-content',
      }}
    >
      {preserveOrder ? (
        <>
          {orderedPayments.map((payment) => renderPaymentCard(payment, false))}
        </>
      ) : (
        <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={sortStrategy}>
          {activePayments.map((payment) => renderPaymentCard(payment, true))}
        </SortableContext>
      </DndContext>
      {settledPayments.map((payment) => renderPaymentCard(payment, false, '-settled'))}
        </>
      )}
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

interface CommissionPaymentModalProps {
  row: CommissionTableRow | null;
  open: boolean;
  onClose: () => void;
  onClearRateOverride: (jobId: string) => void;
  onUpdateRate: (jobId: string, value: string) => void;
  onReorder: (jobId: string, order: number[]) => void;
  onUpdateAmount: (jobId: string, scheduleIndex: number, value: string) => void;
  onUpdateDate: (jobId: string, scheduleIndex: number, value: string) => void;
  onUpdateCheck: (jobId: string, scheduleIndex: number, value: string) => void;
  onUpdateSalesmanPaid: (jobId: string, scheduleIndex: number, paid: boolean) => void;
  onResetOverrides: (jobId: string) => void;
}

function CommissionPaymentModal({
  row,
  open,
  onClose,
  onClearRateOverride,
  onUpdateRate,
  onReorder,
  onUpdateAmount,
  onUpdateDate,
  onUpdateCheck,
  onUpdateSalesmanPaid,
  onResetOverrides,
}: CommissionPaymentModalProps) {
  const theme = useTheme();
  if (!row) return null;

  const balanceColor = isCommissionOverpaid(row)
    ? 'error.main'
    : row.balance <= 0.01
      ? 'success.main'
      : 'text.primary';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          minHeight: { xs: '88vh', sm: '80vh' },
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle
        sx={{
          pr: 6,
          pt: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {row.customerName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {row.jobLabel || 'Untitled'} · {row.stageLabel || '-'}
          </Typography>
        </Box>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          px: { xs: 2, sm: 3 },
          py: 2.5,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            mb: 3,
            alignItems: 'flex-end',
            p: 2,
            borderRadius: 1.5,
            border: 1,
            borderColor: 'divider',
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              Job total
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {formatMoney(row.jobTotal)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Rate
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TextField
                size="small"
                value={row.commissionRate}
                onChange={(e) => onUpdateRate(row.jobId, e.target.value)}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  inputProps: { inputMode: 'decimal', min: 0, step: 0.1 },
                }}
                sx={{ width: 96, ...paymentFieldSx }}
              />
              {row.rateOverridden && (
                <Tooltip title="Use default rate">
                  <IconButton
                    size="small"
                    onClick={() => onClearRateOverride(row.jobId)}
                    aria-label="Reset rate to default"
                  >
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Commission
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {formatMoney(row.commissionDue)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {isCommissionOverpaid(row) ? 'Overpaid (owed back)' : 'Balance'}
            </Typography>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 700,
                color: balanceColor,
              }}
            >
              {formatMoney(row.balance)}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', width: '100%', minHeight: 0, pr: 0.5 }}>
          <JobPaymentCards
            row={row}
            layout="vertical"
            preserveOrder
            onReorder={onReorder}
            onUpdateAmount={onUpdateAmount}
            onUpdateDate={onUpdateDate}
            onUpdateCheck={onUpdateCheck}
            onUpdateSalesmanPaid={onUpdateSalesmanPaid}
            onResetOverrides={onResetOverrides}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function CommissionLogsPage() {
  const [loadingCommissionLogs, setLoadingCommissionLogs] = useState(false);
  const [commissionSourceJobs, setCommissionSourceJobs] = useState<CommissionSourceJobRow[]>([]);
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(() => readDefaultCommissionRate());
  const [overviewJobOrder, setOverviewJobOrder] = useState<string[]>(() => readOverviewJobOrder());
  const [paymentModalJobId, setPaymentModalJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
    updateCommissionPayment(jobId, scheduleIndex, { amount: value }, { manual: true });
  };

  const handleSalesmanPaidChange = (jobId: string, scheduleIndex: number, paid: boolean) => {
    updateCommissionPayment(jobId, scheduleIndex, { salesmanPaid: paid });
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
            contract: row.contract,
            finalPayment: row.finalPayment,
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
            const rawAmount = saved.amount;
            amount =
              rawAmount === '' || rawAmount === undefined || rawAmount === null
                ? 0
                : roundMoney(Number(rawAmount) || 0);
          } else if (status === 'paid') {
            amount = potentialAmount;
            displayAmount = potentialAmount > 0 ? formatMoneyInput(potentialAmount) : '';
          }

          const customerPaid = status === 'paid';
          const salesmanPaid = safeRate <= 0 ? true : Boolean(saved.salesmanPaid);

          return {
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
            customerPaid,
            salesmanPaid,
          };
        });

        const payments = orderPaymentsForDisplay(builtPayments, local.paymentOrder);

        const paidTotal = roundMoney(
          payments.reduce(
            (sum, payment) => sum + (payment.salesmanPaid ? payment.amount : 0),
            0,
          ),
        );
        const balance = roundMoney(commissionDue - paidTotal);
        const hasManualPayments = payments.some((payment) => payment.amountManual);
        const isRowSettled =
          safeRate <= 0 || (jobTotal > 0 && balance >= -0.01 && balance <= 0.01);

        return {
          ...row,
          commissionRate: safeRate,
          rateOverridden,
          commissionDue,
          payments,
          hasManualPayments,
          balance,
          isRowSettled,
        };
      });
  }, [commissionSourceJobs, commissionLogRows, defaultCommissionRate]);

  const overviewTableRows = useMemo(
    () => applyOverviewJobOrder(commissionTableRows, overviewJobOrder),
    [commissionTableRows, overviewJobOrder],
  );

  const visibleTableRows = useMemo(
    () => overviewTableRows.filter((row) => matchesCommissionSearch(row, searchQuery)),
    [overviewTableRows, searchQuery],
  );

  const paymentModalRow = useMemo(
    () => commissionTableRows.find((row) => row.jobId === paymentModalJobId) ?? null,
    [commissionTableRows, paymentModalJobId],
  );

  const handleUpdateRate = (jobId: string, value: string) => {
    if (value === '') {
      clearRateOverride(jobId);
    } else {
      updateCommissionRow(jobId, { commissionRate: value });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMMISSION_LOGS_STORAGE_KEY, JSON.stringify(commissionLogRows || {}));
  }, [commissionLogRows]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DEFAULT_COMMISSION_RATE_KEY, String(defaultCommissionRate));
  }, [defaultCommissionRate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMMISSION_OVERVIEW_JOB_ORDER_KEY, JSON.stringify(overviewJobOrder));
  }, [overviewJobOrder]);

  const loadCommissionJobs = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      setLoadingCommissionLogs(true);
      const [jobs, estimatesData] = await Promise.all([
        fetchAllCommissionJobs(),
        axios.get<EstimateDoc[]>(`${API_URL}/estimates`),
      ]);
      if (signal?.cancelled) return;
      const estimates = Array.isArray(estimatesData.data) ? estimatesData.data : [];
      const latestEstimateByJob = pickLatestPositiveEstimateByJob(estimates);
      const rows: CommissionSourceJobRow[] = jobs
        .filter((job) => isCommissionEligibleJob(job))
        .map((job) => {
          const estimate = latestEstimateByJob.get(String(job?._id || ''));
          const fullAmount = resolveCommissionJobTotal(job, estimate);
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
            jobColor: job?.color,
            searchText: buildCommissionJobSearchText(job, roundMoney(fullAmount)),
            paymentSchedule: job?.paymentSchedule,
            contract: job?.contract,
            finalPayment: job?.finalPayment,
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
                Active and completed jobs only. Drag rows to reorder. Click a row to edit payments.
              </Typography>
            </Box>
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

          <TextField
            size="small"
            fullWidth
            label="Search commission logs"
            placeholder="Customer, address, job, amount, payment, check #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ mb: 2, maxWidth: 420 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    edge="end"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />

          {loadingCommissionLogs ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : commissionTableRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No jobs found.
            </Typography>
          ) : visibleTableRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No jobs match &ldquo;{searchQuery.trim()}&rdquo;. Try a different search or clear the filter.
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
              <CommissionOverviewTable
                rows={visibleTableRows}
                onReorder={setOverviewJobOrder}
                onOpenPayments={(row) => setPaymentModalJobId(row.jobId)}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      <CommissionPaymentModal
        row={paymentModalRow}
        open={Boolean(paymentModalJobId && paymentModalRow)}
        onClose={() => setPaymentModalJobId(null)}
        onClearRateOverride={clearRateOverride}
        onUpdateRate={handleUpdateRate}
        onReorder={reorderPayments}
        onUpdateAmount={handlePaymentAmountChange}
        onUpdateDate={(jobId, scheduleIndex, value) =>
          updateCommissionPayment(jobId, scheduleIndex, { date: value })
        }
        onUpdateCheck={(jobId, scheduleIndex, value) =>
          updateCommissionPayment(jobId, scheduleIndex, { check: value })
        }
        onUpdateSalesmanPaid={handleSalesmanPaidChange}
        onResetOverrides={resetPaymentOverrides}
      />
    </Box>
  );
}

export default CommissionLogsPage;
