import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
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
import {
  buildCustomScheduleFromItems,
  buildStandardSchedule,
  computeItemAmount,
  createEmptyScheduleItem,
  getContractBase,
  hasStoredPaymentSchedule,
  resolvePaymentSchedule,
  validatePaymentSchedule,
} from '../../utils/paymentSchedule';

const DUE_TYPE_OPTIONS = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'final', label: 'Final' },
  { value: 'custom', label: 'Custom' },
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

function cloneItems(items) {
  return (items || []).map((item) => ({ ...item }));
}

export default function JobPaymentScheduleEditor({ job, onSave, saving = false, readOnly = false }) {
  const contractBase = getContractBase(job);
  const resolved = useMemo(() => resolvePaymentSchedule(job), [job]);
  const [scheduleType, setScheduleType] = useState(
    hasStoredPaymentSchedule(job) ? job.paymentSchedule.type || 'custom' : 'standard_40_60'
  );
  const [items, setItems] = useState(() => cloneItems(resolved.items));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const nextResolved = resolvePaymentSchedule(job);
    setScheduleType(
      hasStoredPaymentSchedule(job) ? job.paymentSchedule.type || 'custom' : 'standard_40_60'
    );
    setItems(cloneItems(nextResolved.items));
    setDirty(false);
  }, [job?._id, job?.paymentSchedule, job?.valueEstimated, job?.valueContracted]);

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

  const handleScheduleTypeChange = (nextType) => {
    setScheduleType(nextType);
    if (nextType === 'standard_40_60') {
      setItems(cloneItems(buildStandardSchedule(contractBase).items));
    } else if (items.length <= 2 && items.every((i) => i.amountType === 'percentage')) {
      setItems(cloneItems(buildStandardSchedule(contractBase).items));
    }
    setDirty(true);
  };

  const updateItem = (index, patch) => {
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
    setDirty(true);
  };

  const addItem = () => {
    setItems((prev) => [...prev, createEmptyScheduleItem(prev.length)]);
    setScheduleType('custom');
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

  const markPaid = (index) => {
    const item = computedItems[index];
    if (!item) return;
    updateItem(index, {
      status: 'paid',
      paidAmount: item.amount,
      paidAt: new Date().toISOString(),
    });
  };

  const handleSave = async () => {
    const payload =
      scheduleType === 'standard_40_60'
        ? buildStandardSchedule(contractBase)
        : buildCustomScheduleFromItems(items, contractBase);
    await onSave(payload);
    setDirty(false);
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Payment Schedule
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Base contract: {formatMoney(contractBase)} (change orders excluded)
          </Typography>
        </Box>
        {!readOnly && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Schedule type</InputLabel>
              <Select
                label="Schedule type"
                value={scheduleType}
                onChange={(e) => handleScheduleTypeChange(e.target.value)}
              >
                <MenuItem value="standard_40_60">Standard 40 / 60</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>
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
              Save schedule
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

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Label</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Value
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }} align="right">
              Amount
            </TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Due</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            {!readOnly && <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {computedItems.map((item, index) => (
            <TableRow key={`${item.label}-${index}`}>
              <TableCell>
                {readOnly ? (
                  item.label
                ) : (
                  <TextField
                    size="small"
                    value={item.label}
                    onChange={(e) => updateItem(index, { label: e.target.value })}
                    placeholder="Deposit, Bending Rail, etc."
                    fullWidth
                  />
                )}
              </TableCell>
              <TableCell>
                {readOnly ? (
                  item.amountType === 'percentage' ? `${item.percentage}%` : 'Fixed'
                ) : (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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
              <TableCell align="right">
                {item.amountType === 'percentage' && Number.isFinite(Number(item.percentage))
                  ? `${item.percentage}%`
                  : formatMoney(item.amount)}
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
                <Chip
                  size="small"
                  label={item.status || 'pending'}
                  color={STATUS_COLORS[item.status] || 'default'}
                />
              </TableCell>
              {!readOnly && (
                <TableCell align="right">
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
    </Paper>
  );
}
