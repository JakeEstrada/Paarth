import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { roundMoney, sumChangeOrders } from '../../utils/paymentSchedule';

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

interface ChangeOrderRow {
  localId: string;
  description: string;
  amount: string | number;
}

interface JobChangeOrderDoc {
  description?: string;
  amount?: number;
}

interface JobChangeOrdersEditorProps {
  job: {
    changeOrders?: JobChangeOrderDoc[];
  };
  onSave: (changeOrders: Array<{ description: string; amount: number }>) => Promise<void>;
  saving?: boolean;
  readOnly?: boolean;
}

function rowsFromJob(changeOrders: JobChangeOrderDoc[] | undefined): ChangeOrderRow[] {
  return (changeOrders || []).map((row) => ({
    localId: newRowLocalId(),
    description: String(row?.description || ''),
    amount: row?.amount ?? '',
  }));
}

function buildPayload(rows: ChangeOrderRow[]) {
  return rows
    .map((row) => ({
      description: String(row.description || '').trim(),
      amount: roundMoney(Number(row.amount) || 0),
    }))
    .filter((row) => row.description || row.amount > 0);
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
    setRows((prev) => [...prev, { localId: newRowLocalId(), description: '', amount: '' }]);
    setDirty(true);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
    setDirty(true);
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
            Add amount + description entries. These are added on top of the base contract total.
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
        <Table size="medium" sx={{ minWidth: 520 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, minWidth: 280 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 160 }} align="right">
                Amount
              </TableCell>
              {!readOnly && (
                <TableCell sx={{ fontWeight: 700, width: 72 }} align="right">
                  {' '}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 2 : 3}>
                  <Typography variant="body2" color="text.secondary">
                    No change orders yet.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
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
                        placeholder="Extra outlet, upgraded material…"
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
                        sx={{
                          width: 140,
                          '& input[type=number]': { MozAppearance: 'textfield' },
                          '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
                            { WebkitAppearance: 'none', margin: 0 },
                        }}
                        inputProps={{ inputMode: 'decimal' }}
                      />
                    )}
                  </TableCell>
                  {!readOnly && (
                    <TableCell align="right">
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
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}
