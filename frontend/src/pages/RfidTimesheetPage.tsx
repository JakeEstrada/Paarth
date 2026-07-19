/**
 * RfidTimesheetPage — RFID-derived timesheets by employee & pay period (Fri–Thu).
 * Route: /rfid-timesheets
 * Placeholder UI: hours/scans are zero until scan→hours logic is implemented.
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
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Nfc as NfcIcon,
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
  listRecentPayPeriods,
  shiftPayPeriod,
  type PayPeriod,
} from '../utils/payPeriod';

type RfidEmployeeOption = {
  id: string;
  uid: string;
  name: string;
};

function buildPlaceholderDayRows(period: PayPeriod) {
  const dates = getPayPeriodDayDates(period);
  return PAY_PERIOD_DAYS.map((day, index) => ({
    day,
    date: dates[index],
    dateLabel: formatPayPeriodDayHeader(dates[index]),
    in: '0',
    out: '0',
    breaks: '0',
    hours: 0,
    scanCount: 0,
  }));
}

function RfidTimesheetPage() {
  const theme = useTheme();
  const [employees, setEmployees] = useState<RfidEmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<RfidEmployeeOption | null>(null);
  const [payPeriod, setPayPeriod] = useState<PayPeriod>(() => getPayPeriodForDate(new Date()));
  const [ratePerHour, setRatePerHour] = useState('');

  const payPeriodOptions = useMemo(() => listRecentPayPeriods(new Date(), 16), []);

  const dayRows = useMemo(() => buildPlaceholderDayRows(payPeriod), [payPeriod]);

  const totalHours = 0;
  const weightedHours = 0;
  const grossPay = (parseFloat(ratePerHour) || 0) * weightedHours;

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

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: theme.palette.primary.main, mb: 0.5 }}>
          RFID Timesheets
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pay periods run <strong>Friday through Thursday</strong>; paychecks go out on the following Friday.
          Hours and scans will populate automatically once check-in logic is wired up.
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Preview mode — all hours and scan counts are placeholders (0). RFID scan → in/out pairing is not enabled yet.
      </Alert>

      <Card sx={{ mb: 3, boxShadow: 2 }}>
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
              type="number"
              value={ratePerHour}
              onChange={(e) => setRatePerHour(e.target.value)}
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
                color="primary"
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Pay date: ${formatPayDate(payPeriod.payDate)}`}
                variant="outlined"
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {!selectedEmployee && !loadingEmployees && (
        <Alert severity="warning">
          No RFID tags found. Register employees on the{' '}
          <strong>RFID scans</strong> page first, then return here.
        </Alert>
      )}

      {selectedEmployee && (
        <>
          <Card sx={{ mb: 3, boxShadow: 2 }}>
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
                  {dayRows.map((row) => (
                    <TableRow key={row.day} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{row.day}</TableCell>
                      <TableCell>{row.dateLabel}</TableCell>
                      <TableCell align="center">{row.in}</TableCell>
                      <TableCell align="center">{row.out}</TableCell>
                      <TableCell align="center">{row.breaks}</TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary' }}>
                        {row.hours.toFixed(2)}
                      </TableCell>
                      <TableCell align="center" sx={{ color: 'text.secondary' }}>
                        {row.scanCount}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow
                    sx={{
                      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.16)' : '#e3f2fd',
                      '& td': { fontWeight: 700, borderTop: `2px solid ${theme.palette.primary.main}` },
                    }}
                  >
                    <TableCell colSpan={5}>Week total</TableCell>
                    <TableCell align="center">{totalHours.toFixed(2)} hrs</TableCell>
                    <TableCell align="center">0</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card sx={{ boxShadow: 2 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Summary
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Total hours
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {totalHours.toFixed(2)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Weighted hours
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#f57c00' }}>
                    {weightedHours.toFixed(2)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Gross pay
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    ${grossPay.toFixed(2)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}

export default RfidTimesheetPage;
