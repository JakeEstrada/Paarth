import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
import toast from 'react-hot-toast';
import {
  buildSchedulePayloadFromItems,
  computeItemAmount,
  createEmptyScheduleItem,
  formatMoney,
  getContractBase,
  getJobPaymentSummary,
  getJobTotalWithChangeOrders,
  resolvePaymentSchedule,
  roundMoney,
  sumChangeOrdersForFinal,
  validatePaymentSchedule,
} from '../../utils/paymentSchedule';

function inferDueTypeFromLabel(label) {
  const text = String(label || '').trim().toLowerCase();
  if (/\bdeposit\b/.test(text)) return 'deposit';
  if (/\bfinal\b/.test(text) || /\bbalance\b/.test(text)) return 'final';
  return 'milestone';
}

function isFinalScheduleItem(item) {
  return item?.dueType === 'final' || inferDueTypeFromLabel(item?.label) === 'final';
}

function statusChipProps(status) {
  if (status === 'paid') return { label: 'Paid', color: 'success' };
  if (status === 'invoiced') return { label: 'Invoiced', color: 'warning' };
  return { label: 'Pending', color: 'default' };
}


const noSpinnerNumberInputSx = (width) => ({
  width,
  '& input[type=number]': {
    MozAppearance: 'textfield',
  },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
    {
      WebkitAppearance: 'none',
      margin: 0,
    },
});

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

/** Ensure editor state always has a valid amountType and dueType. */
function normalizeItemForEditor(item, contractBase) {
  const amountType = item?.amountType === 'fixed' ? 'fixed' : 'percentage';
  const computed = computeItemAmount({ ...item, amountType }, contractBase);
  const normalized = {
    ...item,
    amountType,
    dueType: inferDueTypeFromLabel(item?.label),
    label: item?.label ?? '',
  };
  if (amountType === 'fixed') {
    normalized.amount = roundMoney(Number(item?.amount) || computed);
    normalized.percentage = undefined;
  } else {
    normalized.percentage = Number.isFinite(Number(item?.percentage))
      ? Number(item.percentage)
      : contractBase > 0
        ? roundMoney((computed / contractBase) * 100)
        : 0;
    normalized.amount = computed;
  }
  return normalized;
}

function cloneItemsFromJob(job) {
  const resolved = resolvePaymentSchedule(job);
  const base = getContractBase(job);
  return withItemLocalIds(resolved.items.map((item) => normalizeItemForEditor(item, base)));
}

export default function JobPaymentScheduleEditor({ job, onSave, saving = false, readOnly = false }) {
  const contractBase = getContractBase(job);
  const [items, setItems] = useState(() => cloneItemsFromJob(job));
  const [dirty, setDirty] = useState(false);

  const scheduleSyncKey = useMemo(
    () => JSON.stringify(job?.paymentSchedule ?? null),
    [job?.paymentSchedule],
  );

  useEffect(() => {
    setItems(cloneItemsFromJob(job));
    setDirty(false);
  }, [job?._id]);

  useEffect(() => {
    if (dirty) return;
    setItems(cloneItemsFromJob(job));
  }, [scheduleSyncKey, dirty, job]);

  const computedItems = useMemo(
    () =>
      items.map((item, idx) => ({
        ...item,
        sortOrder: idx,
        amount: computeItemAmount(item, contractBase),
      })),
    [items, contractBase]
  );

  const jobTotal = useMemo(() => getJobTotalWithChangeOrders(job), [job]);

  const validation = useMemo(
    () => validatePaymentSchedule({ items: computedItems }, contractBase, jobTotal),
    [computedItems, contractBase, jobTotal]
  );

  const coAddedToFinal = useMemo(() => sumChangeOrdersForFinal(job), [job]);

  const paymentSummary = useMemo(() => getJobPaymentSummary(job), [job, computedItems]);

  const getBaseFinalAmount = (item) => {
    if (item.amountType === 'percentage') {
      const pct = Number(item.percentage);
      if (Number.isFinite(pct)) return roundMoney(contractBase * (pct / 100));
    }
    return roundMoney(Number(item.amount) || 0);
  };

  const getEffectiveItemTotal = (item) => {
    const stored = roundMoney(Number(item.amount) || 0);
    if (!isFinalScheduleItem(item) || coAddedToFinal <= 0) return stored;
    const baseFinal = getBaseFinalAmount(item);
    if (stored > baseFinal + 0.01) return stored;
    return roundMoney(stored + coAddedToFinal);
  };

  const updateItem = (index, patch) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? normalizeItemForEditor({ ...item, ...patch }, contractBase) : item)),
    );
    setDirty(true);
  };

  const setItemAmountType = (index, nextType) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const computed = computeItemAmount(item, contractBase);
        if (nextType === 'fixed') {
          return normalizeItemForEditor(
            {
              ...item,
              amountType: 'fixed',
              amount: computed,
              percentage: undefined,
            },
            contractBase,
          );
        }
        const pct =
          contractBase > 0
            ? roundMoney((computed / contractBase) * 100)
            : Number(item.percentage) || 0;
        return normalizeItemForEditor(
          {
            ...item,
            amountType: 'percentage',
            percentage: pct,
          },
          contractBase,
        );
      }),
    );
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
      const effectiveTotal = getEffectiveItemTotal(item);
      updateItem(index, {
        status: 'paid',
        paidAmount: item.paidAmount > 0 ? item.paidAmount : effectiveTotal,
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
    if (!items.length) {
      toast.error('Add at least one payment item before saving.');
      return;
    }
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
            Base contract: {formatMoney(contractBase)} (change orders excluded). Use labels like
            Deposit or Final for special types; everything else is a milestone.
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
          Job total: <strong>{formatMoney(validation.target)}</strong>
        </Typography>
        {Math.abs(validation.remaining) > 0.01 && (
          <Typography variant="body2" color="text.secondary">
            Schedule gap:{' '}
            <strong style={{ color: validation.remaining < -0.01 ? '#d32f2f' : undefined }}>
              {formatMoney(validation.remaining)}
            </strong>
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          Balance due:{' '}
          <strong style={{ color: paymentSummary.balanceDue <= 0 ? 'success.main' : undefined }}>
            {formatMoney(paymentSummary.balanceDue)}
          </strong>
        </Typography>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table
          size="medium"
          sx={{
            tableLayout: 'fixed',
            minWidth: 820,
            '& .MuiTableCell-root': { verticalAlign: 'middle' },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: '30%', minWidth: 260 }}>Label</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '16%', minWidth: 160 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '10%', minWidth: 96 }} align="right">
                Total
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: '12%', minWidth: 120 }}>Paid</TableCell>
              <TableCell sx={{ fontWeight: 700, width: '14%', minWidth: 148 }}>Paid date</TableCell>
              {!readOnly && (
                <TableCell sx={{ fontWeight: 700, width: '18%', minWidth: 200 }} align="right">
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {computedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 5 : 6}>
                  <Typography variant="body2" color="text.secondary">
                    No payment items yet. Add milestones with fixed dollar amounts or percentages.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
            computedItems.map((item, index) => (
              <TableRow key={item.localId || index}>
                <TableCell sx={{ minWidth: 260, pr: 2 }}>
                  {readOnly ? (
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {item.label}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        {...statusChipProps(item.status || 'pending')}
                        sx={{ mt: 0.5, height: 22 }}
                      />
                    </Box>
                  ) : (
                    <TextField
                      label="Payment label"
                      size="medium"
                      value={item.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        updateItem(index, {
                          label,
                          dueType: inferDueTypeFromLabel(label),
                        });
                      }}
                      placeholder="Signing, Deposit, Final…"
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
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={item.amountType === 'fixed' ? 'fixed' : 'percentage'}
                        onChange={(_, nextType) => {
                          if (nextType) setItemAmountType(index, nextType);
                        }}
                        aria-label="Amount type"
                      >
                        <ToggleButton value="percentage" sx={{ px: 1.25, minWidth: 40 }}>
                          %
                        </ToggleButton>
                        <ToggleButton value="fixed" sx={{ px: 1.25, minWidth: 40 }}>
                          $
                        </ToggleButton>
                      </ToggleButtonGroup>
                      {item.amountType === 'percentage' ? (
                        <TextField
                          size="small"
                          type="number"
                          value={item.percentage ?? ''}
                          onChange={(e) =>
                            updateItem(index, { percentage: parseFloat(e.target.value) || 0 })
                          }
                          sx={noSpinnerNumberInputSx(96)}
                          inputProps={{ inputMode: 'decimal' }}
                        />
                      ) : (
                        <TextField
                          size="small"
                          type="number"
                          value={item.amount ?? ''}
                          onChange={(e) =>
                            updateItem(index, { amount: parseFloat(e.target.value) || 0 })
                          }
                          sx={noSpinnerNumberInputSx(120)}
                          inputProps={{ inputMode: 'decimal' }}
                        />
                      )}
                    </Box>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatMoney(getEffectiveItemTotal(item))}
                  </Typography>
                  {isFinalScheduleItem(item) && coAddedToFinal > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      +{formatMoney(coAddedToFinal)} change orders
                    </Typography>
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
                      sx={noSpinnerNumberInputSx(120)}
                      inputProps={{ inputMode: 'decimal' }}
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
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Chip
                        size="small"
                        variant={item.status === 'paid' ? 'filled' : 'outlined'}
                        {...statusChipProps(item.status || 'pending')}
                        sx={{ height: 24, mr: 0.5 }}
                      />
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
                        <Button size="small" variant="contained" onClick={() => markPaid(index)}>
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
                        aria-label={`Remove ${item.label || 'payment item'}`}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                )}
              </TableRow>
            ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
