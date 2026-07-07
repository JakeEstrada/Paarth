import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
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
import toast from 'react-hot-toast';
import { formatMoney, roundMoney, sumChangeOrders } from '../../utils/paymentSchedule';

const BILLING_OPTIONS = [
  { value: 'separate', label: 'In payment schedule' },
  { value: 'final', label: 'Add to final balance' },
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

function newRowLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
}

interface ChangeOrderRow {
  localId: string;
  description: string;
  amount: string | number;
  billing: 'separate' | 'final';
}

interface JobChangeOrderDoc {
  description?: string;
  amount?: number;
  billing?: string;
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
  }));
}

function buildPayload(rows: ChangeOrderRow[]): JobChangeOrderPayload[] {
  return rows
    .map((row) => ({
      description: String(row.description || '').trim(),
      amount: roundMoney(Number(row.amount) || 0),
      billing: row.billing === 'final' ? 'final' : 'separate',
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
    setRows((prev) => [
      ...prev,
      { localId: newRowLocalId(), description: '', amount: '', billing: 'separate' },
    ]);
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
            Adds to the job total. Collect payment in the schedule above — bump the final balance or
            add a milestone. &ldquo;Add to final balance&rdquo; shows the extra on the final row
            automatically.
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
        <Table size="medium" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, minWidth: 280 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 140 }} align="right">
                Amount
              </TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>How to collect</TableCell>
              {!readOnly && (
                <TableCell sx={{ fontWeight: 700, width: 56 }} align="right">
                  {' '}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 3 : 4}>
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
                      row.billing === 'final' ? 'Add to final balance' : 'In payment schedule'
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
                        sx={{ minWidth: 170 }}
                      >
                        {BILLING_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </MenuItem>
                        ))}
                      </Select>
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
