/**
 * CommissionLogsPage — Sales commission logs.
 * Route: /commission-logs
 * Docs: ../../../docs/PAGES.md#commissionlogspagetsx
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import ViewListIcon from '@mui/icons-material/ViewList';
import GridViewIcon from '@mui/icons-material/GridView';
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
import { getCommissionPaymentSplits, roundMoney } from '../utils/paymentSchedule';
import { isCommissionEligibleJob } from '../utils/commissionJobEligibility';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const COMMISSION_LOGS_STORAGE_KEY = 'financeHubCommissionLogsRows';
const DEFAULT_COMMISSION_RATE_KEY = 'financeHubCommissionDefaultRate';
const COMMISSION_VIEW_MODE_KEY = 'financeHubCommissionViewMode';
const COMMISSION_OVERVIEW_JOB_ORDER_KEY = 'financeHubCommissionOverviewJobOrder';
const DEFAULT_COMMISSION_RATE = 5;

type CommissionViewMode = 'detail' | 'overview';

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

function readCommissionViewMode(): CommissionViewMode {
  if (typeof window === 'undefined') return 'detail';
  try {
    const raw = window.localStorage.getItem(COMMISSION_VIEW_MODE_KEY);
    return raw === 'overview' ? 'overview' : 'detail';
  } catch {
    return 'detail';
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

function tierChipStyles(
  theme: ReturnType<typeof useTheme>,
  payment: CommissionPaymentDisplay,
) {
  if (payment.status === 'paid' || payment.isSettled) {
    return {
      borderColor: 'success.main',
      bgcolor: alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.32 : 0.18),
      color: theme.palette.success.main,
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
        const paid = payment.status === 'paid' || payment.isSettled;
        return (
          <Tooltip
            key={payment.scheduleIndex}
            title={`${payment.label}: ${paid ? 'Paid' : PAYMENT_STATUS_LABELS[payment.status] || payment.status} · $${formatMoney(dueAmount)} commission`}
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
                ${formatMoney(dueAmount)}
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
  } = useSortable({ id: row.jobId });

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
        ...(row.isRowSettled
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
        ${formatMoney(row.jobTotal)}
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

    const oldIndex = rowIds.indexOf(String(active.id));
    const newIndex = rowIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    onReorder(arrayMove(rowIds, oldIndex, newIndex));
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
  isDeadEstimate?: boolean;
  valueContracted?: number;
  valueEstimated?: number;
  paymentSchedule?: PaymentScheduleDoc;
  contract?: {
    depositReceived?: number;
    depositReceivedAt?: string;
  };
  finalPayment?: {
    amountPaid?: number;
    paidAt?: string;
  };
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

function defaultCommissionRowSort(a: CommissionTableRow, b: CommissionTableRow): number {
  if (a.isRowSettled !== b.isRowSettled) return a.isRowSettled ? 1 : -1;
  return String(a.customerName || '').localeCompare(String(b.customerName || ''));
}

function applyOverviewJobOrder(
  rows: CommissionTableRow[],
  order: string[] | undefined,
): CommissionTableRow[] {
  if (!order?.length) {
    return [...rows].sort(defaultCommissionRowSort);
  }

  const rowById = new Map(rows.map((row) => [row.jobId, row]));
  const ordered: CommissionTableRow[] = [];
  const seen = new Set<string>();

  for (const id of order) {
    const row = rowById.get(id);
    if (row) {
      ordered.push(row);
      seen.add(id);
    }
  }

  const remaining = rows.filter((row) => !seen.has(row.jobId)).sort(defaultCommissionRowSort);
  return [...ordered, ...remaining];
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
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pb: 0.5, width: 'max-content' }}>
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
  onResetOverrides,
}: CommissionPaymentModalProps) {
  if (!row) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {row.customerName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {row.jobLabel || 'Untitled'} · {row.stageLabel || '-'}
        </Typography>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            mb: 2,
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              Job total
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              ${formatMoney(row.jobTotal)}
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
                sx={{ width: 88 }}
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
              ${formatMoney(row.commissionDue)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Balance
            </Typography>
            <Typography
              variant="body1"
              sx={{
                fontWeight: 700,
                color: row.balance <= 0 ? 'success.main' : 'text.primary',
              }}
            >
              ${formatMoney(row.balance)}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ overflowX: 'auto', pb: 1 }}>
          <JobPaymentCards
            row={row}
            onReorder={onReorder}
            onUpdateAmount={onUpdateAmount}
            onUpdateDate={onUpdateDate}
            onUpdateCheck={onUpdateCheck}
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
  const theme = useTheme();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(1100);
  const [loadingCommissionLogs, setLoadingCommissionLogs] = useState(false);
  const [commissionSourceJobs, setCommissionSourceJobs] = useState<CommissionSourceJobRow[]>([]);
  const [defaultCommissionRate, setDefaultCommissionRate] = useState(() => readDefaultCommissionRate());
  const [viewMode, setViewMode] = useState<CommissionViewMode>(() => readCommissionViewMode());
  const [overviewJobOrder, setOverviewJobOrder] = useState<string[]>(() => readOverviewJobOrder());
  const [paymentModalJobId, setPaymentModalJobId] = useState<string | null>(null);
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

          if (amountManual && hasExplicitManualAmount(saved)) {
            displayAmount = saved.amount ?? '';
            amount = roundMoney(Number(saved.amount || 0));
          } else if (status === 'paid') {
            amount = potentialAmount;
            displayAmount = potentialAmount > 0 ? potentialAmount : '';
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
      });
  }, [commissionSourceJobs, commissionLogRows, defaultCommissionRate]);

  const detailTableRows = useMemo(
    () => [...commissionTableRows].sort(defaultCommissionRowSort),
    [commissionTableRows],
  );

  const overviewTableRows = useMemo(
    () => applyOverviewJobOrder(commissionTableRows, overviewJobOrder),
    [commissionTableRows, overviewJobOrder],
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMMISSION_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

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
      const rows: CommissionSourceJobRow[] = jobs
        .filter((job) => isCommissionEligibleJob(job))
        .map((job) => {
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
                {viewMode === 'overview'
                  ? 'Drag rows to reorder. Click a row to edit payments.'
                  : 'Shows accepted jobs only (deposit pending and beyond). Amounts auto-fill when a job payment is marked paid in the job modal.'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={viewMode}
                onChange={(_, next: CommissionViewMode | null) => {
                  if (next) setViewMode(next);
                }}
                aria-label="Commission view mode"
              >
                <ToggleButton value="detail" aria-label="Detail view">
                  <ViewListIcon fontSize="small" sx={{ mr: 0.5 }} />
                  Detail
                </ToggleButton>
                <ToggleButton value="overview" aria-label="Overview view">
                  <GridViewIcon fontSize="small" sx={{ mr: 0.5 }} />
                  Overview
                </ToggleButton>
              </ToggleButtonGroup>
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
                  {viewMode === 'overview' ? (
                    <CommissionOverviewTable
                      rows={overviewTableRows}
                      onReorder={setOverviewJobOrder}
                      onOpenPayments={(row) => setPaymentModalJobId(row.jobId)}
                    />
                  ) : (
                  <Table
                    stickyHeader
                    size="small"
                    sx={{
                      minWidth: 1280,
                      tableLayout: 'fixed',
                      width: '100%',
                    }}
                  >
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        width: '12%',
                        minWidth: 130,
                        bgcolor: 'background.paper',
                      }}
                    >
                      Customer
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, width: '14%', minWidth: 150, bgcolor: 'background.paper' }}
                    >
                      Job
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, width: '9%', minWidth: 96, bgcolor: 'background.paper' }}
                      align="right"
                    >
                      Job Total
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, width: '8%', minWidth: 88, bgcolor: 'background.paper' }}
                      align="right"
                    >
                      Rate
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, width: '10%', minWidth: 104, bgcolor: 'background.paper' }}
                      align="right"
                    >
                      Commission
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        width: 'auto',
                        minWidth: 420,
                        bgcolor: 'background.paper',
                      }}
                    >
                      Payments
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 700,
                        width: 120,
                        minWidth: 120,
                        pl: 3,
                        bgcolor: 'background.paper',
                        position: 'sticky',
                        right: 0,
                        zIndex: 3,
                        whiteSpace: 'nowrap',
                        boxShadow: (t) =>
                          `-6px 0 10px ${alpha(t.palette.common.black, t.palette.mode === 'dark' ? 0.35 : 0.08)}`,
                      }}
                      align="right"
                    >
                      Balance
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detailTableRows.map((row) => (
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
                      <TableCell sx={{ p: 1, overflow: 'hidden', verticalAlign: 'top' }}>
                        <Box sx={{ overflowX: 'auto', maxWidth: '100%', pr: 1 }}>
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
                        </Box>
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          width: 120,
                          minWidth: 120,
                          pl: 3,
                          pr: 2,
                          whiteSpace: 'nowrap',
                          verticalAlign: 'top',
                          position: 'sticky',
                          right: 0,
                          zIndex: 1,
                          bgcolor: row.isRowSettled
                            ? alpha(
                                theme.palette.success.main,
                                theme.palette.mode === 'dark' ? 0.14 : 0.08,
                              )
                            : 'background.paper',
                          boxShadow: (t) =>
                            `-6px 0 10px ${alpha(t.palette.common.black, t.palette.mode === 'dark' ? 0.35 : 0.08)}`,
                        }}
                      >
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
                  )}
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
        onResetOverrides={resetPaymentOverrides}
      />
    </Box>
  );
}

export default CommissionLogsPage;
