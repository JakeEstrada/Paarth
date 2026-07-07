import { useEffect, useMemo, useState } from 'react';
import {
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
import { Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon } from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { roundMoney, sumChangeOrders } from '../../utils/paymentSchedule';

const BILLING_OPTIONS = [
  { value: 'separate', label: 'Separate payment' },
  { value: 'final', label: 'Add to final' },
];

const SCHEDULE_SELECT_MENU_PROPS = {
  disableScrollLock: true,
  slotProps: {
    paper: {
      sx: (theme) => ({
        zIndex: theme.zIndex.modal + 10,
        maxHeight: 320,
      }),
    },
  },
};

function formatMoney(value: unknown) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function newRowLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toDateInputValue(value: unknown): string {
  if (!value) return '';
  try {
    return format(new Date(String(value)), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

const noSpinnerNumberInputSx = (width: number) => ({
  width,
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
    { WebkitAppearance: 'none', margin: 0 },
});

export interface JobChangeOrderPayload {
  description: string;
  amount: number;
  billing: 'separate' | 'final';
  status: 'pending' | 'paid';
  paidAmount: number;
  paidAt: string | null;
}

interface ChangeOrderRow {
  localId: string;
  description: string;
  amount: string | number;
  billing: 'separate' | 'final';
  status: 'pending' | 'paid';
  paidAmount: string | number;
  paidAt: string;
}

interface JobChangeOrderDoc {
  description?: string;
  amount?: number;
  billing?: string;
  status?: string;
  paidAmount?: number;
  paidAt?: string;
}

interface JobChangeOrdersEditorProps {
  job: {
    changeOrders?: JobChangeOrderDoc[];
  };
  onSave: (changeOrders: JobChangeOrderPayload[]) => Promise<void>;
  saving?: boolean;
  readOnly?: boolean;
}

function rowsFromJob(changeOrders: JobChangeOrderDoc[] | undefined): ChangeOrderRow[] {
  return (changeOrders || []).map((row) => ({
    localId: newRowLocalId(),
    description: String(row?.description || ''),
    amount: row?.amount ?? '',
    billing: String(row?.billing || 'separate') === 'final' ? 'final' : 'separate',
    status: row?.status === 'paid' ? 'paid' : 'pending',
    paidAmount: row?.paidAmount ?? row?.amount ?? '',
    paidAt: toDateInputValue(row?.paidAt),
  }));
}

function buildPayload(rows: ChangeOrderRow[]): JobChangeOrderPayload[] {
  return rows
    .map((row) => {
      const amount = roundMoney(Number(row.amount) || 0);
      const status = row.status === 'paid' ? 'paid' : 'pending';
      return {
        description: String(row.description || '').trim(),
        amount,
        billing: row.billing === 'final' ? 'final' : 'separate',
        status,
        paidAmount:
          status === 'paid' ? roundMoney(Number(row.paidAmount) || amount) : 0,
        paidAt:
          status === 'paid' && row.paidAt
            ? new Date(`${row.paidAt}T12:00:00`).toISOString()
            : null,
      };
    })
    .filter((row) => row.description || row.amount > 0);
}

function statusChipProps(status: string) {
  if (status === 'paid') return { label: 'Paid', color: 'success' as const };
  return { label: 'Pending', color: 'default' as const };
}

export default function JobChangeOrdersEditor({
  job,
  onSave,
  saving = false,
  readOnly = false,
}: JobChangeOrdersEditorProps) {
  const [rows, setRows] = useState<ChangeOrderRow[]>(() => rowsFromJob(job?.changeOrders));
  const [dirty, setDirty] = useState(false);

  const syncKey = useMemo(() => JSON.stringify(job?.changeOrders ?? []), [job?.changeOrders]);

  useEffect(() => {
    setRows(rowsFromJob(job?.changeOrders));
    setDirty(false);
  }, [syncKey]);

  const total = useMemo(
    () => roundMoney(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)),
    [rows],
  );

  const savedTotal = sumChangeOrders(job);

  const updateRow = (index: number, patch: Partial<ChangeOrderRow>) => {
    setRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        localId: newRowLocalId(),
        description: '',
        amount: '',
        billing: 'separate',
        status: 'pending',
        paidAmount: '',
        paidAt: '',
      },
    ]);
    setDirty(true);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
    setDirty(true);
  };

  const markPaid = (index: number) => {
    const row = rows[index];
    if (!row) return;
    const amount = roundMoney(Number(row.amount) || 0);
    updateRow(index, {
      status: 'paid',
      paidAmount: amount > 0 ? amount : row.paidAmount,
      paidAt: row.paidAt || toDateInputValue(new Date()),
    });
  };

  const clearPaid = (index: number) => {
    updateRow(index, {
      status: 'pending',
      paidAmount: '',
      paidAt: '',
    });
  };

  const handleSave = async () => {
    const payload = buildPayload(rows);
    const hasIncomplete = rows.some(
      (row) =>
        (String(row.description || '').trim() && !(Number(row.amount) > 0)) ||
        (!String(row.description || '').trim() && Number(row.amount) > 0),
    );
    if (hasIncomplete) {
      toast.error('Each change order needs both a description and an amount.');
      return;
    }
    await onSave(payload);
    setDirty(false);
  };

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 1,
          flexWrap: 'wrap',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Change Orders
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Added on top of the base contract. Mark paid when collected, or choose &ldquo;Add to
            final&rdquo; to roll into the final balance milestone.
          </Typography>
        </Box>
        {!readOnly && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addRow}>
              Add change order
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

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          Change orders total: <strong>{formatMoney(readOnly ? savedTotal : total)}</strong>
        </Typography>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="medium" sx={{ minWidth: 880 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 120 }} align="right">
                Amount
              </TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 160 }}>Billing</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 120 }}>Paid</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 148 }}>Paid date</TableCell>
              {!readOnly && (
                <TableCell sx={{ fontWeight: 700, minWidth: 200 }} align="right">
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 5 : 6}>
                  <Typography variant="body2" color="text.secondary">
                    No change orders yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => {
                const chip = statusChipProps(row.status);
                const isFinalBilling = row.billing === 'final';
                return (
                  <TableRow key={row.localId}>
                    <TableCell>
                      {readOnly ? (
                        <Typography variant="body2">{row.description || '—'}</Typography>
                      ) : (
                        <TextField
                          size="small"
                          fullWidth
                          value={row.description}
                          onChange={(e) => updateRow(index, { description: e.target.value })}
                          placeholder="Baluster charge, extra outlet…"
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {readOnly ? (
                        formatMoney(row.amount)
                      ) : (
                        <TextField
                          size="small"
                          type="number"
                          value={row.amount}
                          onChange={(e) => updateRow(index, { amount: e.target.value })}
                          sx={noSpinnerNumberInputSx(120)}
                          inputProps={{ inputMode: 'decimal' }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {readOnly ? (
                        isFinalBilling ? 'Add to final' : 'Separate payment'
                      ) : (
                        <Select
                          size="small"
                          value={row.billing}
                          onChange={(e) =>
                            updateRow(index, {
                              billing: e.target.value === 'final' ? 'final' : 'separate',
                            })
                          }
                          MenuProps={SCHEDULE_SELECT_MENU_PROPS}
                          sx={{ minWidth: 150 }}
                        >
                          {BILLING_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </MenuItem>
                          ))}
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {readOnly ? (
                        row.status === 'paid' ? formatMoney(row.paidAmount || row.amount) : '—'
                      ) : row.status === 'paid' ? (
                        <TextField
                          size="small"
                          type="number"
                          value={row.paidAmount ?? row.amount ?? ''}
                          onChange={(e) => updateRow(index, { paidAmount: e.target.value })}
                          sx={noSpinnerNumberInputSx(110)}
                          inputProps={{ inputMode: 'decimal' }}
                        />
                      ) : isFinalBilling ? (
                        <Typography variant="caption" color="text.secondary">
                          Via final
                        </Typography>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {readOnly ? (
                        row.paidAt ? format(new Date(row.paidAt), 'MMM dd, yyyy') : '—'
                      ) : row.status === 'paid' ? (
                        <TextField
                          size="small"
                          type="date"
                          value={row.paidAt}
                          onChange={(e) => updateRow(index, { paidAt: e.target.value })}
                          InputLabelProps={{ shrink: true }}
                        />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    {!readOnly && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Chip
                          size="small"
                          variant={row.status === 'paid' ? 'filled' : 'outlined'}
                          label={chip.label}
                          color={chip.color}
                          sx={{ height: 24, mr: 0.5 }}
                        />
                        {row.status !== 'paid' && !isFinalBilling && (
                          <Button size="small" variant="contained" onClick={() => markPaid(index)}>
                            Mark paid
                          </Button>
                        )}
                        {row.status === 'paid' && (
                          <Button size="small" color="warning" onClick={() => clearPaid(index)}>
                            Clear
                          </Button>
                        )}
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeRow(index)}
                          aria-label="Remove change order"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
