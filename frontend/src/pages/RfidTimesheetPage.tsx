/**
 * RfidTimesheetPage — RFID-derived timesheets by employee & pay period (Fri–Thu).
 * Route: /rfid-timesheets
 * Current week is editable; past weeks are read-only (greyed out).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
  useTheme,
} from '@mui/material';
import {
  AccessTime as TimeIcon,
  Add as AddIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Nfc as NfcIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import api from '../utils/axios';
import {
  PAY_PERIOD_DAYS,
  formatPayDate,
  formatPayPeriodDayHeader,
  getPayPeriodDayDates,
  getPayPeriodForDate,
  isCurrentPayPeriod,
  isPastPayPeriod,
  listRecentPayPeriods,
  shiftPayPeriod,
  type PayPeriod,
} from '../utils/payPeriod';

const STORAGE_PREFIX = 'rfidTimesheetWeek';

const NO_NUMBER_SPINNER_SX = {
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
  '& input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
};

type RfidEmployeeOption = {
  id: string;
  uid: string;
  name: string;
};

type DayRow = {
  day: string;
  dateLabel: string;
  in: string;
  out: string;
  breaks: string;
  scanCount: number;
};

type ReceiptRow = {
  description: string;
  amount: string;
};

type WeekSheetData = {
  workHours: DayRow[];
  receipts: ReceiptRow[];
  ratePerHour: string;
};

function storageKey(employeeId: string, periodId: string) {
  return `${STORAGE_PREFIX}:${employeeId}:${periodId}`;
}

function defaultWorkHours(period: PayPeriod): DayRow[] {
  const dates = getPayPeriodDayDates(period);
  return PAY_PERIOD_DAYS.map((day, index) => ({
    day,
    dateLabel: formatPayPeriodDayHeader(dates[index]),
    in: '0',
    out: '0',
    breaks: '0',
    scanCount: 0,
  }));
}

function loadWeekSheet(employeeId: string, period: PayPeriod): WeekSheetData {
  try {
    const raw = localStorage.getItem(storageKey(employeeId, period.id));
    if (!raw) {
      return { workHours: defaultWorkHours(period), receipts: [], ratePerHour: '' };
    }
    const parsed = JSON.parse(raw);
    const defaults = defaultWorkHours(period);
    const byDay = Object.fromEntries((parsed.workHours || []).map((r: DayRow) => [r.day, r]));
    return {
      workHours: defaults.map((d) => ({
        ...d,
        in: String(byDay[d.day]?.in ?? d.in),
        out: String(byDay[d.day]?.out ?? d.out),
        breaks: String(byDay[d.day]?.breaks ?? d.breaks),
        scanCount: Number(byDay[d.day]?.scanCount) || 0,
      })),
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
      ratePerHour: String(parsed.ratePerHour ?? ''),
    };
  } catch {
    return { workHours: defaultWorkHours(period), receipts: [], ratePerHour: '' };
  }
}

function saveWeekSheet(employeeId: string, periodId: string, data: WeekSheetData) {
  try {
    localStorage.setItem(storageKey(employeeId, periodId), JSON.stringify(data));
  } catch {
    toast.error('Could not save timesheet adjustments');
  }
}

function timeToMinutes(timeStr: string) {
  if (!timeStr || timeStr === '0') return 0;
  const padded = timeStr.padStart(4, '0');
  const hours = parseInt(padded.substring(0, 2), 10);
  const minutes = parseInt(padded.substring(2, 4), 10);
  return hours * 60 + minutes;
}

function calculateHours(inTime: string, outTime: string, breaks: string) {
  if (!inTime || !outTime || inTime === '0' || outTime === '0') return 0;
  const inMinutes = timeToMinutes(inTime);
  const outMinutes = timeToMinutes(outTime);
  const breakMinutes = parseInt(breaks || '0', 10);
  if (outMinutes <= inMinutes) return 0;
  return Math.max(0, (outMinutes - inMinutes - breakMinutes) / 60);
}

function calculateWeightedHours(workHours: DayRow[]) {
  let totalRegular = 0;
  let totalOvertime = 0;
  let totalWeighted = 0;
  for (const day of workHours) {
    const dayHours = calculateHours(day.in, day.out, day.breaks);
    if (dayHours <= 8) {
      totalRegular += dayHours;
      totalWeighted += dayHours;
    } else {
      totalRegular += 8;
      totalOvertime += dayHours - 8;
      totalWeighted += 8 + (dayHours - 8) * 1.5;
    }
  }
  return { regular: totalRegular, overtime: totalOvertime, weighted: totalWeighted };
}

function RfidTimesheetPage() {
  const theme = useTheme();
  const [employees, setEmployees] = useState<RfidEmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<RfidEmployeeOption | null>(null);
  const [payPeriod, setPayPeriod] = useState<PayPeriod>(() => getPayPeriodForDate(new Date()));
  const [workHours, setWorkHours] = useState<DayRow[]>(() => defaultWorkHours(getPayPeriodForDate(new Date())));
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [ratePerHour, setRatePerHour] = useState('');

  const isCurrentWeek = isCurrentPayPeriod(payPeriod);
  const isPastWeek = isPastPayPeriod(payPeriod);
  const isEditable = isCurrentWeek;
  const currentPeriodId = getPayPeriodForDate(new Date()).id;

  const payPeriodOptions = useMemo(() => listRecentPayPeriods(new Date(), 16), []);

  const totalHours = workHours.reduce(
    (sum, day) => sum + calculateHours(day.in, day.out, day.breaks),
    0,
  );
  const weightedHoursData = calculateWeightedHours(workHours);
  const totalReceipts = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const grossPay = (parseFloat(ratePerHour) || 0) * weightedHoursData.weighted;
  const overallTotal = grossPay + totalReceipts;

  const loadEmployees = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      const res = await api.get<{ tags: { _id: string; uid: string; displayName: string }[] }>('/rfid/tags');
      const tags = res.data?.tags || [];
      const options = tags
        .filter((t) => t.displayName?.trim())
        .map((t) => ({
          id: t._id,
          uid: t.uid,
          name: t.displayName.trim(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(options);
      setSelectedEmployee((prev) => prev ?? options[0] ?? null);
    } catch (error) {
      console.error('Failed to load RFID employees:', error);
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.error || 'Failed to load RFID tag registry');
      } else {
        toast.error('Failed to load RFID tag registry');
      }
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (!selectedEmployee) return;
    const sheet = loadWeekSheet(selectedEmployee.id, payPeriod);
    setWorkHours(sheet.workHours);
    setReceipts(sheet.receipts);
    setRatePerHour(sheet.ratePerHour);
  }, [selectedEmployee, payPeriod]);

  useEffect(() => {
    if (!selectedEmployee || !isCurrentWeek) return;
    saveWeekSheet(selectedEmployee.id, payPeriod.id, {
      workHours,
      receipts,
      ratePerHour,
    });
  }, [selectedEmployee, payPeriod.id, isCurrentWeek, workHours, receipts, ratePerHour]);

  const handleWorkHoursChange = (index: number, field: 'in' | 'out' | 'breaks', value: string) => {
    if (!isEditable) return;
    setWorkHours((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleReceiptChange = (index: number, field: keyof ReceiptRow, value: string) => {
    if (!isEditable) return;
    setReceipts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddReceipt = () => {
    if (!isEditable) return;
    setReceipts((prev) => [...prev, { description: '', amount: '' }]);
  };

  const handleRemoveReceipt = (index: number) => {
    if (!isEditable) return;
    setReceipts((prev) => prev.filter((_, i) => i !== index));
  };

  const readOnlyCardSx = isPastWeek
    ? {
        opacity: 0.72,
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      }
    : {};

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: theme.palette.primary.main, mb: 0.5 }}>
          RFID Timesheets
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pay periods run <strong>Friday through Thursday</strong>; paychecks go out on the following Friday.
          Only the <strong>current week</strong> can be edited — past weeks are locked.
        </Typography>
      </Box>

      {!isCurrentWeek && (
        <Alert severity={isPastWeek ? 'warning' : 'info'} sx={{ mb: 3 }}>
          {isPastWeek
            ? 'This is a past pay period. Hours and receipts are read-only.'
            : 'This pay period is in the future. Editing opens when this becomes the current week.'}
        </Alert>
      )}

      <Card sx={{ mb: 3, boxShadow: 2, ...readOnlyCardSx }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: { xs: 'stretch', md: 'flex-end' },
            }}
          >
            <Autocomplete
              sx={{ flex: '1 1 260px', minWidth: 220 }}
              options={employees}
              value={selectedEmployee}
              loading={loadingEmployees}
              onChange={(_, value) => setSelectedEmployee(value)}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Employee (RFID tag)"
                  placeholder={loadingEmployees ? 'Loading…' : 'Select employee'}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingEmployees ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            <TextField
              label="Rate per hour ($)"
              value={ratePerHour}
              onChange={(e) => isEditable && setRatePerHour(e.target.value.replace(/[^\d.]/g, ''))}
              disabled={!isEditable}
              inputProps={{ inputMode: 'decimal' }}
              sx={{ flex: '0 1 160px', minWidth: 140 }}
            />

            <FormControl sx={{ flex: '1 1 240px', minWidth: 200 }}>
              <InputLabel>Pay period</InputLabel>
              <Select
                label="Pay period"
                value={payPeriod.id}
                onChange={(e) => {
                  const match = payPeriodOptions.find((p) => p.id === e.target.value);
                  if (match) setPayPeriod(match);
                }}
              >
                {payPeriodOptions.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.label}
                    {p.id === currentPeriodId ? ' (current)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton
                aria-label="Previous pay period"
                onClick={() => setPayPeriod((p) => shiftPayPeriod(p, -1))}
              >
                <ChevronLeftIcon />
              </IconButton>
              <IconButton
                aria-label="Next pay period"
                onClick={() => setPayPeriod((p) => shiftPayPeriod(p, 1))}
              >
                <ChevronRightIcon />
              </IconButton>
              <Button
                size="small"
                variant="text"
                onClick={() => setPayPeriod(getPayPeriodForDate(new Date()))}
                sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
              >
                This week
              </Button>
            </Box>
          </Box>

          {selectedEmployee && (
            <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <Chip size="small" icon={<NfcIcon />} label={`UID: ${selectedEmployee.uid}`} variant="outlined" />
              <Chip
                size="small"
                label={`Work week: ${payPeriod.label}`}
                color={isCurrentWeek ? 'primary' : 'default'}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Pay date: ${formatPayDate(payPeriod.payDate)}`}
                variant="outlined"
              />
              {isCurrentWeek && (
                <Chip size="small" label="Editable" color="success" variant="outlined" />
              )}
              {isPastWeek && (
                <Chip size="small" label="Locked" color="default" variant="filled" />
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {!selectedEmployee && !loadingEmployees && (
        <Alert severity="warning">
          No RFID tags found. Register employees on the <strong>RFID scans</strong> page first, then return here.
        </Alert>
      )}

      {selectedEmployee && (
        <>
          <Card sx={{ mb: 3, boxShadow: 2, ...readOnlyCardSx }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <TimeIcon sx={{ color: 'primary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {selectedEmployee.name} — {payPeriod.label}
                </Typography>
              </Box>

              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Day</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">In</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Out</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Break (min)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Hours</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">RFID scans</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workHours.map((row, index) => {
                    const hours = calculateHours(row.in, row.out, row.breaks);
                    return (
                      <TableRow
                        key={row.day}
                        hover={isEditable}
                        sx={isPastWeek ? { color: 'text.secondary' } : undefined}
                      >
                        <TableCell sx={{ fontWeight: 600 }}>{row.day}</TableCell>
                        <TableCell>{row.dateLabel}</TableCell>
                        <TableCell align="center">
                          {isEditable ? (
                            <TextField
                              value={row.in}
                              onChange={(e) => handleWorkHoursChange(index, 'in', e.target.value)}
                              size="small"
                              placeholder="600"
                              inputProps={{ style: { textAlign: 'center' }, maxLength: 4 }}
                              sx={{ maxWidth: 88 }}
                            />
                          ) : (
                            row.in || '0'
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {isEditable ? (
                            <TextField
                              value={row.out}
                              onChange={(e) => handleWorkHoursChange(index, 'out', e.target.value)}
                              size="small"
                              placeholder="1430"
                              inputProps={{ style: { textAlign: 'center' }, maxLength: 4 }}
                              sx={{ maxWidth: 88 }}
                            />
                          ) : (
                            row.out || '0'
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {isEditable ? (
                            <TextField
                              value={row.breaks}
                              onChange={(e) => handleWorkHoursChange(index, 'breaks', e.target.value)}
                              size="small"
                              placeholder="30"
                              inputProps={{ style: { textAlign: 'center' }, maxLength: 3 }}
                              sx={{ maxWidth: 72, ...NO_NUMBER_SPINNER_SX }}
                            />
                          ) : (
                            row.breaks || '0'
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: hours > 0 ? 'primary.main' : 'text.secondary' }}>
                          {hours.toFixed(2)}
                        </TableCell>
                        <TableCell align="center" sx={{ color: 'text.secondary' }}>
                          {row.scanCount}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow
                    sx={{
                      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.16)' : '#e3f2fd',
                      '& td': { fontWeight: 700, borderTop: `2px solid ${theme.palette.primary.main}` },
                    }}
                  >
                    <TableCell colSpan={5}>Week total</TableCell>
                    <TableCell align="center">{totalHours.toFixed(2)} hrs</TableCell>
                    <TableCell align="center">
                      {workHours.reduce((s, r) => s + r.scanCount, 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3, mb: 3 }}>
            <Card sx={{ flex: 1, boxShadow: 2, ...readOnlyCardSx }}>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ReceiptIcon sx={{ color: 'primary.main' }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Receipts
                    </Typography>
                  </Box>
                  {isEditable && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddReceipt}
                      sx={{ textTransform: 'none' }}
                    >
                      Add receipt
                    </Button>
                  )}
                </Box>

                {receipts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    {isEditable
                      ? 'No receipts yet. Click "Add receipt" for this week.'
                      : 'No receipts recorded for this week.'}
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {receipts.map((receipt, index) => (
                      <Box key={index} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <TextField
                          label="Description"
                          value={receipt.description}
                          onChange={(e) => handleReceiptChange(index, 'description', e.target.value)}
                          size="small"
                          disabled={!isEditable}
                          sx={{ flex: '1 1 180px' }}
                        />
                        <TextField
                          label="Amount"
                          value={receipt.amount}
                          onChange={(e) =>
                            handleReceiptChange(index, 'amount', e.target.value.replace(/[^\d.]/g, ''))
                          }
                          size="small"
                          disabled={!isEditable}
                          inputProps={{ inputMode: 'decimal' }}
                          InputProps={{
                            startAdornment: <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>$</Typography>,
                          }}
                          sx={{ width: 140 }}
                        />
                        {isEditable && (
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => handleRemoveReceipt(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}

                {receipts.length > 0 && (
                  <Paper sx={{ p: 2, mt: 2, textAlign: 'center', bgcolor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                    <Typography variant="body2" color="text.secondary">
                      Total receipts
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      ${totalReceipts.toFixed(2)}
                    </Typography>
                  </Paper>
                )}
              </CardContent>
            </Card>

            <Card sx={{ flex: 1, boxShadow: 2, ...readOnlyCardSx }}>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Summary
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Total hours</Typography>
                    <Typography sx={{ fontWeight: 600 }}>{totalHours.toFixed(2)} hrs</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Weighted hours</Typography>
                    <Typography sx={{ fontWeight: 600, color: '#f57c00' }}>
                      {weightedHoursData.weighted.toFixed(2)} hrs
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Gross pay</Typography>
                    <Typography sx={{ fontWeight: 600 }}>${grossPay.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Receipts</Typography>
                    <Typography sx={{ fontWeight: 600 }}>${totalReceipts.toFixed(2)}</Typography>
                  </Box>
                  <Paper sx={{ p: 2, mt: 1, textAlign: 'center', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Week total
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      ${overallTotal.toFixed(2)}
                    </Typography>
                  </Paper>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </>
      )}
    </Box>
  );
}

export default RfidTimesheetPage;
