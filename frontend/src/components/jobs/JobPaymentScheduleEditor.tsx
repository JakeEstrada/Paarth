import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import {
  buildSchedulePayloadFromItems,
  computeItemAmount,
  createEmptyScheduleItem,
  getContractBase,
  resolvePaymentSchedule,
  validatePaymentSchedule,
} from '../../utils/paymentSchedule';

const DUE_TYPE_OPTIONS = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'final', label: 'Final' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
];

const STATUS_COLORS = {
  pending: 'default',
  invoiced: 'warning',
  paid: 'success',
};

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function toDateInputValue(value) {
  if (!value) return '';
  try {
    return format(new Date(value), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

function newItemLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function withItemLocalIds(items) {
  return (items || []).map((item) => ({
    ...item,
    localId: item?.localId || newItemLocalId(),
  }));
}

function cloneItems(items) {
  return withItemLocalIds(items);
}

export default function JobPaymentScheduleEditor({ job, onSave, saving = false, readOnly = false }) {
  const contractBase = getContractBase(job);
  const resolved = useMemo(() => resolvePaymentSchedule(job), [job]);
  const [items, setItems] = useState(() => cloneItems(resolved.items));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const nextResolved = resolvePaymentSchedule(job);
    setItems(cloneItems(nextResolved.items));
    setDirty(false);
  }, [job?._id]);

  useEffect(() => {
    if (dirty) return;
    const nextResolved = resolvePaymentSchedule(job);
    setItems(cloneItems(nextResolved.items));
  }, [job?.paymentSchedule, job?.valueEstimated, job?.valueContracted, dirty, job]);

  const computedItems = useMemo(
    () =>
      items.map((item, idx) => ({
        ...item,
        sortOrder: idx,
        amount: computeItemAmount(item, contractBase),
      })),
    [items, contractBase]
  );

  const validation = useMemo(
    () => validatePaymentSchedule({ items: computedItems }, contractBase),
    [computedItems, contractBase]
  );

  const updateItem = (index, patch) => {
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
    setDirty(true);
  };

  const addItem = () => {
    setItems((prev) => [...prev, createEmptyScheduleItem(prev.length)]);
    setDirty(true);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    setDirty(true);
  };

  const moveItem = (index, direction) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const handleStatusChange = (index, status) => {
    const item = computedItems[index];
    if (!item) return;

    if (status === 'paid') {
      updateItem(index, {
        status: 'paid',
        paidAmount: item.paidAmount > 0 ? item.paidAmount : item.amount,
        paidAt: item.paidAt || new Date().toISOString(),
      });
      return;
    }

    if (status === 'invoiced') {
      updateItem(index, {
        status: 'invoiced',
        paidAmount: 0,
        paidAt: null,
      });
      return;
    }

    updateItem(index, {
      status: 'pending',
      paidAmount: 0,
      paidAt: null,
    });
  };

  const markPaid = (index) => {
    handleStatusChange(index, 'paid');
  };

  const clearPayment = (index) => {
    updateItem(index, {
      status: 'pending',
      paidAmount: 0,
      paidAt: null,
    });
  };

  const handleSave = async () => {
    const payload = buildSchedulePayloadFromItems(items, contractBase);
    await onSave(payload);
    setDirty(false);
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Payment Schedule & History
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Base contract: {formatMoney(contractBase)} (change orders excluded). Defaults to 40% /
            60% until you edit the schedule.
          </Typography>
        </Box>
        {!readOnly && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addItem}>
              Add item
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              Save
            </Button>
          </Box>
        )}
      </Box>

      {validation.warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {validation.warnings.map((warning) => (
            <Typography key={warning} variant="body2">
              {warning}
            </Typography>
          ))}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          Scheduled: <strong>{formatMoney(validation.scheduledTotal)}</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Remaining:{' '}
          <strong style={{ color: validation.remaining < -0.01 ? '#d32f2f' : undefined }}>
            {formatMoney(validation.remaining)}
          </strong>
        </Typography>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table
          size="medium"
          sx={{
            tableLayout: 'fixed',
            minWidth: 960,
            '& .MuiTableCell-root': { verticalAlign: 'middle' },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: '26%', minWidth: 260 }}>Label</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '14%', minWidth: 140 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '10%', minWidth: 96 }} align="right">
                Total
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: '12%', minWidth: 120 }}>Due</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '12%', minWidth: 120 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '10%', minWidth: 100 }}>Paid</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '12%', minWidth: 148 }}>Paid date</TableCell>
              {!readOnly && (
                <TableCell sx={{ fontWeight: 700, width: '14%', minWidth: 160 }} align="right">
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {computedItems.map((item, index) => (
              <TableRow key={item.localId || index}>
                <TableCell sx={{ minWidth: 260, pr: 2 }}>
                  {readOnly ? (
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {item.label}
                    </Typography>
                  ) : (
                    <TextField
                      label="Payment label"
                      size="medium"
                      value={item.label}
                      onChange={(e) => updateItem(index, { label: e.target.value })}
                      placeholder="Deposit, Bending Rail, Final Balance…"
                      fullWidth
                      sx={{
                        minWidth: 240,
                        '& .MuiInputBase-root': { fontSize: '1rem' },
                        '& .MuiInputBase-input': { py: 1.25 },
                      }}
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    item.amountType === 'percentage' ? `${item.percentage}%` : 'Fixed'
                  ) : (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 150 }}>
                      <Select
                        size="small"
                        value={item.amountType}
                        onChange={(e) =>
                          updateItem(index, {
                            amountType: e.target.value,
                            percentage: e.target.value === 'percentage' ? item.percentage || 0 : undefined,
                          })
                        }
                      >
                        <MenuItem value="percentage">%</MenuItem>
                        <MenuItem value="fixed">$</MenuItem>
                      </Select>
                      {item.amountType === 'percentage' ? (
                        <TextField
                          size="small"
                          type="number"
                          value={item.percentage ?? ''}
                          onChange={(e) =>
                            updateItem(index, { percentage: parseFloat(e.target.value) || 0 })
                          }
                          sx={{ width: 72 }}
                        />
                      ) : (
                        <TextField
                          size="small"
                          type="number"
                          value={item.amount ?? ''}
                          onChange={(e) =>
                            updateItem(index, { amount: parseFloat(e.target.value) || 0 })
                          }
                          sx={{ width: 100 }}
                        />
                      )}
                    </Box>
                  )}
                </TableCell>
                <TableCell align="right">{formatMoney(item.amount)}</TableCell>
                <TableCell>
                  {readOnly ? (
                    item.dueType
                  ) : (
                    <Select
                      size="small"
                      value={item.dueType || 'custom'}
                      onChange={(e) => updateItem(index, { dueType: e.target.value })}
                    >
                      {DUE_TYPE_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    <Chip
                      size="small"
                      label={item.status || 'pending'}
                      color={STATUS_COLORS[item.status] || 'default'}
                    />
                  ) : (
                    <Select
                      size="small"
                      value={item.status || 'pending'}
                      onChange={(e) => handleStatusChange(index, e.target.value)}
                      sx={{ minWidth: 110 }}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    item.status === 'paid' ? formatMoney(item.paidAmount || item.amount) : '—'
                  ) : item.status === 'paid' ? (
                    <TextField
                      size="small"
                      type="number"
                      value={item.paidAmount ?? item.amount ?? ''}
                      onChange={(e) =>
                        updateItem(index, { paidAmount: parseFloat(e.target.value) || 0 })
                      }
                      sx={{ width: 110 }}
                    />
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    item.paidAt ? format(new Date(item.paidAt), 'MMM dd, yyyy') : '—'
                  ) : item.status === 'paid' ? (
                    <TextField
                      size="small"
                      type="date"
                      value={toDateInputValue(item.paidAt)}
                      onChange={(e) =>
                        updateItem(index, {
                          paidAt: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null,
                        })
                      }
                      InputLabelProps={{ shrink: true }}
                    />
                  ) : (
                    '—'
                  )}
                </TableCell>
                {!readOnly && (
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton size="small" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                      <ArrowUpIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => moveItem(index, 1)}
                      disabled={index === computedItems.length - 1}
                    >
                      <ArrowDownIcon fontSize="small" />
                    </IconButton>
                    {item.status !== 'paid' && (
                      <Button size="small" onClick={() => markPaid(index)}>
                        Mark paid
                      </Button>
                    )}
                    {(item.status === 'paid' || item.status === 'invoiced') && (
                      <Button size="small" color="warning" onClick={() => clearPayment(index)}>
                        Clear
                      </Button>
                    )}
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeItem(index)}
                      disabled={computedItems.length <= 1}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
