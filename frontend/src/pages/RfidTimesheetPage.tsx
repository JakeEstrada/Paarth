/**
 * RfidTimesheetPage — RFID-derived timesheets by employee & pay period (Fri–Thu).
 * Route: /rfid-timesheets
 * Current week is editable; past weeks are read-only (greyed out).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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
  DirectionsCar as CarIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Edit as EditIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import { isAxiosError } from 'axios';
import toast from 'react-hot-toast';
import api from '../utils/axios';
import { useAuth } from '../context/AuthContext';
import { useSocketConnectionStatus, useSocketSubscription } from '../hooks/useSocketSubscription';
import {
  buildTimesheetRowsFromScans,
  defaultShiftProfile,
  isPayPeriodWorkday,
  mergeRfidRegistries,
  payPeriodScanRangeIso,
  profileMapFromApi,
  scanMatchesEmployee,
  sortEmployeesForTimesheet,
  type RfidEmployeeIdentity,
  type RfidEmployeeShiftProfile,
  type RfidManualDayFlags,
  type RfidScanRecord,
  type RfidTimesheetWeekPayload,
} from '../utils/rfidTimesheetScans';
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
const MIGRATED_PREFIX = 'rfidTimesheetMigrated';
/** IRS-style mileage rate (matches Payroll page). */
const PRICE_PER_MILE = 0.725;

const NO_NUMBER_SPINNER_SX = {
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
  '& input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
};

type RfidEmployeeOption = RfidEmployeeIdentity;

type DayRow = {
  day: string;
  dateLabel: string;
  in: string;
  out: string;
  breaks: string;
  scanCount: number;
  note: string;
};

type ReceiptRow = {
  description: string;
  amount: string;
};

type TravelMileRow = {
  day: string;
  miles: string;
};

type AdditionalHoursRow = {
  id: string;
  description: string;
  hours: string;
};

type WeekSheetData = {
  workHours: DayRow[];
  receipts: ReceiptRow[];
  travelMiles: TravelMileRow[];
  additionalHours: AdditionalHoursRow[];
  ratePerHour: string;
  manualByDay?: Record<string, RfidManualDayFlags>;
};


function sheetPayload(
  workHours: DayRow[],
  receipts: ReceiptRow[],
  travelMiles: TravelMileRow[],
  additionalHours: AdditionalHoursRow[],
  ratePerHour: string,
  manualByDay: Record<string, RfidManualDayFlags>,
): RfidTimesheetWeekPayload {
  return {
    workHours: workHours.map((row) => ({
      day: row.day,
      in: row.in,
      out: row.out,
      breaks: row.breaks,
      scanCount: row.scanCount,
      note: row.note,
    })),
    receipts,
    travelMiles,
    additionalHours,
    ratePerHour,
    manualByDay,
  };
}

function newAdditionalHoursRow(): AdditionalHoursRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    hours: '',
  };
}

function storageKey(employeeId: string, periodId: string) {
  return `${STORAGE_PREFIX}:${employeeId}:${periodId}`;
}

function migrationKey(employeeId: string, periodId: string) {
  return `${MIGRATED_PREFIX}:${employeeId}:${periodId}`;
}

function sheetFromRemotePayload(
  remote: RfidTimesheetWeekPayload,
  period: PayPeriod,
  profile: RfidEmployeeShiftProfile,
): WeekSheetData {
  return {
    workHours: defaultWorkHours(period).map((d) => {
      const saved = (remote.workHours || []).find((r) => r.day === d.day);
      return {
        ...d,
        in: String(saved?.in ?? d.in),
        out: String(saved?.out ?? d.out),
        breaks: String(saved?.breaks ?? d.breaks),
        scanCount: Number(saved?.scanCount) || 0,
        note: String(saved?.note ?? ''),
      };
    }),
    receipts: remote.receipts || [],
    travelMiles: mergeTravelMiles(remote.travelMiles),
    additionalHours: (remote.additionalHours || []).map((row) => ({
      id: row.id || newAdditionalHoursRow().id,
      description: String(row.description ?? ''),
      hours: String(row.hours ?? ''),
    })),
    ratePerHour: String(remote.ratePerHour ?? profile.ratePerHour ?? ''),
    manualByDay: remote.manualByDay || {},
  };
}

function localSheetHasData(sheet: WeekSheetData): boolean {
  return (
    sheet.workHours.some((r) => r.in !== '0' || r.out !== '0') ||
    sheet.receipts.length > 0 ||
    sheet.travelMiles.some((r) => parseFloat(r.miles) > 0) ||
    sheet.additionalHours.length > 0 ||
    Boolean(sheet.ratePerHour) ||
    Object.keys(sheet.manualByDay || {}).length > 0
  );
}

function defaultTravelMiles(): TravelMileRow[] {
  return PAY_PERIOD_DAYS.map((day) => ({ day, miles: '' }));
}

function mergeTravelMiles(saved: TravelMileRow[] | undefined): TravelMileRow[] {
  const byDay = Object.fromEntries((saved || []).map((r) => [r.day, r]));
  return PAY_PERIOD_DAYS.map((day) => ({
    day,
    miles: String(byDay[day]?.miles ?? ''),
  }));
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
    note: '',
  }));
}

function loadWeekSheet(employeeId: string, period: PayPeriod): WeekSheetData {
  try {
    const raw = localStorage.getItem(storageKey(employeeId, period.id));
    if (!raw) {
      return {
        workHours: defaultWorkHours(period),
        receipts: [],
        travelMiles: defaultTravelMiles(),
        additionalHours: [],
        ratePerHour: '',
        manualByDay: {},
      };
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
        note: String(byDay[d.day]?.note ?? ''),
      })),
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
      travelMiles: mergeTravelMiles(parsed.travelMiles),
      additionalHours: Array.isArray(parsed.additionalHours)
        ? parsed.additionalHours.map((row: AdditionalHoursRow) => ({
            id: row.id || newAdditionalHoursRow().id,
            description: String(row.description ?? ''),
            hours: String(row.hours ?? ''),
          }))
        : [],
      ratePerHour: String(parsed.ratePerHour ?? ''),
      manualByDay:
        parsed.manualByDay && typeof parsed.manualByDay === 'object' ? parsed.manualByDay : {},
    };
  } catch {
    return {
      workHours: defaultWorkHours(period),
      receipts: [],
      travelMiles: defaultTravelMiles(),
      additionalHours: [],
      ratePerHour: '',
      manualByDay: {},
    };
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

function calculateWeightedHours(workHours: DayRow[], additionalHours: AdditionalHoursRow[]) {
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
  const manualHours = additionalHours.reduce((sum, row) => sum + (parseFloat(row.hours) || 0), 0);
  totalRegular += manualHours;
  totalWeighted += manualHours;
  return { regular: totalRegular, overtime: totalOvertime, weighted: totalWeighted, manualHours };
}

function normalizeTenantRoomId(raw: unknown): string | null {
  const value =
    typeof raw === 'object' && raw !== null && '_id' in raw
      ? String((raw as { _id: unknown })._id)
      : String(raw || '').trim();
  if (!/^[a-fA-F0-9]{24}$/.test(value)) return null;
  return value;
}

function RfidTimesheetPage() {
  const theme = useTheme();
  const { tenantIdForBranding } = useAuth();
  const [employees, setEmployees] = useState<RfidEmployeeOption[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<Record<string, RfidEmployeeShiftProfile>>({});
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingScans, setLoadingScans] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [scans, setScans] = useState<RfidScanRecord[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<RfidEmployeeOption | null>(null);
  const [payPeriod, setPayPeriod] = useState<PayPeriod>(() => getPayPeriodForDate(new Date()));
  const [workHours, setWorkHours] = useState<DayRow[]>(() => defaultWorkHours(getPayPeriodForDate(new Date())));
  const [manualByDay, setManualByDay] = useState<Record<string, RfidManualDayFlags>>({});
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [travelMiles, setTravelMiles] = useState<TravelMileRow[]>(() => defaultTravelMiles());
  const [additionalHours, setAdditionalHours] = useState<AdditionalHoursRow[]>([]);
  const [ratePerHour, setRatePerHour] = useState('');
  const [shiftIn, setShiftIn] = useState(defaultShiftProfile().shiftIn);
  const [shiftOut, setShiftOut] = useState(defaultShiftProfile().shiftOut);
  const [shiftBreak, setShiftBreak] = useState(String(defaultShiftProfile().breakMinutes));

  const manualByDayRef = useRef(manualByDay);
  const scansRef = useRef(scans);
  const isEditModeRef = useRef(isEditMode);
  const lastPersistedRef = useRef('');
  const sheetReadyRef = useRef(false);
  manualByDayRef.current = manualByDay;
  scansRef.current = scans;
  isEditModeRef.current = isEditMode;

  const tenantId = normalizeTenantRoomId(tenantIdForBranding);
  const tenantRoom = tenantId ? `tenant:${tenantId}` : null;
  const socketConnected = useSocketConnectionStatus();

  const isCurrentWeek = isCurrentPayPeriod(payPeriod);
  const isPastWeek = isPastPayPeriod(payPeriod);
  const canEdit = isCurrentWeek && isEditMode;
  const currentPeriodId = getPayPeriodForDate(new Date()).id;

  const activeShiftProfile = useMemo((): RfidEmployeeShiftProfile => {
    if (!selectedEmployee) return defaultShiftProfile();
    return (
      employeeProfiles[selectedEmployee.id] || {
        shiftIn,
        shiftOut,
        breakMinutes: parseInt(shiftBreak || '0', 10) || 0,
        ratePerHour,
      }
    );
  }, [selectedEmployee, employeeProfiles, shiftIn, shiftOut, shiftBreak, ratePerHour]);

  const payPeriodOptions = useMemo(() => listRecentPayPeriods(new Date(), 16), []);

  const scheduleHours = workHours.reduce(
    (sum, day) => sum + calculateHours(day.in, day.out, day.breaks),
    0,
  );
  const weightedHoursData = calculateWeightedHours(workHours, additionalHours);
  const totalHours = scheduleHours + weightedHoursData.manualHours;
  const totalReceipts = receipts.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const totalMiles = travelMiles.reduce((sum, row) => sum + (parseFloat(row.miles) || 0), 0);
  const travelCost = totalMiles * PRICE_PER_MILE;
  const grossPay = (parseFloat(ratePerHour) || 0) * weightedHoursData.weighted;
  const overallTotal = grossPay + travelCost + totalReceipts;

  const loadEmployees = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      const [tagsRes, pinsRes, profilesRes] = await Promise.all([
        api.get<{ tags: { _id: string; uid: string; displayName: string }[] }>('/rfid/tags'),
        api.get<{ pins: { _id: string; pin: string; displayName: string }[] }>('/rfid/pins'),
        api.get<{
          profiles: Array<{
            employeeKey: string;
            shiftIn?: string;
            shiftOut?: string;
            breakMinutes?: number;
            ratePerHour?: string;
          }>;
        }>('/rfid/employee-profiles'),
      ]);
      const options = sortEmployeesForTimesheet(
        mergeRfidRegistries(tagsRes.data?.tags || [], pinsRes.data?.pins || []),
      );
      setEmployees(options);
      setEmployeeProfiles(profileMapFromApi(profilesRes.data?.profiles || []));
      setSelectedEmployee((prev) => {
        if (!prev) return options[0] ?? null;
        return options.find((e) => e.id === prev.id) ?? options[0] ?? null;
      });
    } catch (error) {
      console.error('Failed to load RFID employees:', error);
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.error || 'Failed to load RFID registry');
      } else {
        toast.error('Failed to load RFID registry');
      }
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  const fetchTimesheet = useCallback(async (employeeKey: string, periodId: string) => {
    const res = await api.get<{ timesheet: RfidTimesheetWeekPayload | null }>(
      `/rfid/timesheets/${encodeURIComponent(employeeKey)}/${encodeURIComponent(periodId)}`,
    );
    return res.data?.timesheet ?? null;
  }, []);

  const persistTimesheet = useCallback(
    async (
      employeeKey: string,
      periodId: string,
      payload: RfidTimesheetWeekPayload,
      options?: { quiet?: boolean },
    ) => {
      await api.put(
        `/rfid/timesheets/${encodeURIComponent(employeeKey)}/${encodeURIComponent(periodId)}`,
        payload,
      );
      lastPersistedRef.current = JSON.stringify(payload);
      if (!options?.quiet) {
        try {
          localStorage.removeItem(storageKey(employeeKey, periodId));
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const fetchScans = useCallback(async (period: PayPeriod) => {
    const { from, to } = payPeriodScanRangeIso(period);
    const res = await api.get<{ scans: RfidScanRecord[] }>('/rfid/scans', {
      params: { from, to, limit: 500 },
    });
    return res.data?.scans || [];
  }, []);

  const applyRfidToRows = useCallback(
    (
      scanList: RfidScanRecord[],
      employee: RfidEmployeeOption,
      period: PayPeriod,
      manual: Record<string, RfidManualDayFlags>,
      profile: RfidEmployeeShiftProfile,
      savedWorkHours: DayRow[] = [],
    ) => {
      return buildTimesheetRowsFromScans(
        period,
        scanList,
        employee,
        profile,
        manual,
        savedWorkHours,
      );
    },
    [],
  );

  const mergeSheetWithScans = useCallback(
    (
      sheet: WeekSheetData,
      scanList: RfidScanRecord[],
      employee: RfidEmployeeOption,
      period: PayPeriod,
      profile: RfidEmployeeShiftProfile,
    ) => {
      return buildTimesheetRowsFromScans(
        period,
        scanList,
        employee,
        profile,
        sheet.manualByDay || {},
        sheet.workHours,
      );
    },
    [],
  );

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (!selectedEmployee) return undefined;
    setIsEditMode(false);
    lastPersistedRef.current = '';
    sheetReadyRef.current = false;

    let cancelled = false;

    (async () => {
      setLoadingScans(true);
      const profile =
        employeeProfiles[selectedEmployee.id] ||
        defaultShiftProfile();

      let sheet: WeekSheetData = {
        workHours: defaultWorkHours(payPeriod),
        receipts: [],
        travelMiles: defaultTravelMiles(),
        additionalHours: [],
        ratePerHour: profile.ratePerHour || '',
        manualByDay: {},
      };

      let timesheetLoadFailed = false;

      try {
        let remoteSheet: RfidTimesheetWeekPayload | null = null;
        try {
          remoteSheet = await fetchTimesheet(selectedEmployee.id, payPeriod.id);
        } catch (error) {
          timesheetLoadFailed = true;
          console.error('Failed to load saved timesheet:', error);
        }

        const migratedFlag = localStorage.getItem(
          migrationKey(selectedEmployee.id, payPeriod.id),
        );

        if (!remoteSheet) {
          const localSheet = loadWeekSheet(selectedEmployee.id, payPeriod);
          if (localSheetHasData(localSheet) && !migratedFlag) {
            try {
              const migratePayload = sheetPayload(
                localSheet.workHours,
                localSheet.receipts,
                localSheet.travelMiles,
                localSheet.additionalHours,
                localSheet.ratePerHour,
                localSheet.manualByDay || {},
              );
              await persistTimesheet(
                selectedEmployee.id,
                payPeriod.id,
                migratePayload,
                { quiet: true },
              );
              localStorage.setItem(
                migrationKey(selectedEmployee.id, payPeriod.id),
                '1',
              );
              remoteSheet = await fetchTimesheet(selectedEmployee.id, payPeriod.id);
            } catch (error) {
              console.error('Timesheet migration failed:', error);
              sheet = localSheet;
            }
          } else if (localSheetHasData(localSheet) && migratedFlag) {
            sheet = localSheet;
          }
        }

        if (remoteSheet) {
          sheet = sheetFromRemotePayload(remoteSheet, payPeriod, profile);
        }

        setShiftIn(profile.shiftIn);
        setShiftOut(profile.shiftOut);
        setShiftBreak(String(profile.breakMinutes));
        setRatePerHour(sheet.ratePerHour || profile.ratePerHour || '');

        const scanList = await fetchScans(payPeriod);
        if (cancelled) return;

        setScans(scanList);
        const merged = mergeSheetWithScans(sheet, scanList, selectedEmployee, payPeriod, profile);
        setManualByDay(merged.manual);
        setWorkHours(merged.rows);
        setReceipts(sheet.receipts);
        setTravelMiles(sheet.travelMiles);
        setAdditionalHours(sheet.additionalHours);
        lastPersistedRef.current = JSON.stringify(
          sheetPayload(
            merged.rows,
            sheet.receipts,
            sheet.travelMiles,
            sheet.additionalHours,
            sheet.ratePerHour || profile.ratePerHour || '',
            merged.manual,
          ),
        );
        sheetReadyRef.current = true;

        if (timesheetLoadFailed) {
          toast.error('Could not load saved adjustments — showing RFID scan hours');
        }
      } catch (error) {
        console.error('Failed to load RFID timesheet:', error);
        if (!cancelled) {
          toast.error(
            isAxiosError(error)
              ? error.response?.data?.error || 'Could not load RFID scans for this pay period'
              : 'Could not load RFID scans for this pay period',
          );
        }
      } finally {
        if (!cancelled) setLoadingScans(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedEmployee,
    payPeriod,
    fetchScans,
    fetchTimesheet,
    mergeSheetWithScans,
    employeeProfiles,
  ]);

  const recomputeFromScans = useCallback(
    (
      scanList: RfidScanRecord[],
      employee: RfidEmployeeOption,
      period: PayPeriod,
      profile: RfidEmployeeShiftProfile,
    ) => {
      const merged = applyRfidToRows(
        scanList,
        employee,
        period,
        manualByDayRef.current,
        profile,
      );
      setManualByDay(merged.manual);
      setWorkHours(merged.rows);
    },
    [applyRfidToRows],
  );

  const handleRealtimeScan = useCallback(
    (payload: unknown) => {
      if (isEditModeRef.current) return;
      const scan = (payload as { scan?: RfidScanRecord })?.scan;
      if (!scan?._id || !selectedEmployee) return;
      if (!scanMatchesEmployee(scan, selectedEmployee)) return;
      const at = new Date(scan.scannedAt);
      const { from, to } = payPeriodScanRangeIso(payPeriod);
      if (Number.isNaN(at.getTime()) || at < new Date(from) || at >= new Date(to)) return;

      setScans((prev) => {
        if (prev.some((s) => s._id === scan._id)) return prev;
        const next = [scan, ...prev];
        scansRef.current = next;
        recomputeFromScans(next, selectedEmployee, payPeriod, activeShiftProfile);
        return next;
      });
    },
    [selectedEmployee, payPeriod, recomputeFromScans, activeShiftProfile],
  );

  useSocketSubscription(tenantRoom, 'rfid.scan.created', handleRealtimeScan);

  const handleRemoteTimesheet = useCallback(
    (payload: unknown) => {
      if (isEditModeRef.current || !selectedEmployee) return;
      const data = payload as {
        employeeKey?: string;
        periodId?: string;
        timesheet?: RfidTimesheetWeekPayload;
      };
      if (data.employeeKey !== selectedEmployee.id || data.periodId !== payPeriod.id) return;
      const remote = data.timesheet;
      if (!remote) return;

      const sheet: WeekSheetData = {
        workHours: defaultWorkHours(payPeriod).map((d) => {
          const saved = (remote.workHours || []).find((r) => r.day === d.day);
          return {
            ...d,
            in: String(saved?.in ?? d.in),
            out: String(saved?.out ?? d.out),
            breaks: String(saved?.breaks ?? d.breaks),
            scanCount: Number(saved?.scanCount) || 0,
            note: String(saved?.note ?? ''),
          };
        }),
        receipts: remote.receipts || [],
        travelMiles: mergeTravelMiles(remote.travelMiles),
        additionalHours: (remote.additionalHours || []).map((row) => ({
          id: row.id || newAdditionalHoursRow().id,
          description: String(row.description ?? ''),
          hours: String(row.hours ?? ''),
        })),
        ratePerHour: String(remote.ratePerHour ?? ''),
        manualByDay: remote.manualByDay || {},
      };

      const merged = mergeSheetWithScans(
        sheet,
        scansRef.current,
        selectedEmployee,
        payPeriod,
        activeShiftProfile,
      );
      setManualByDay(merged.manual);
      setReceipts(sheet.receipts);
      setTravelMiles(sheet.travelMiles);
      setAdditionalHours(sheet.additionalHours);
      setRatePerHour(sheet.ratePerHour);
      setWorkHours(merged.rows);
    },
    [selectedEmployee, payPeriod, mergeSheetWithScans, activeShiftProfile],
  );

  const handleRemoteProfile = useCallback(
    (payload: unknown) => {
      const data = payload as {
        employeeKey?: string;
        profile?: {
          shiftIn?: string;
          shiftOut?: string;
          breakMinutes?: number;
          ratePerHour?: string;
        };
      };
      if (!data.employeeKey || !data.profile) return;
      const key = data.employeeKey;
      const profile: RfidEmployeeShiftProfile = {
        shiftIn: data.profile.shiftIn || defaultShiftProfile().shiftIn,
        shiftOut: data.profile.shiftOut || defaultShiftProfile().shiftOut,
        breakMinutes: Number(data.profile.breakMinutes ?? defaultShiftProfile().breakMinutes),
        ratePerHour: String(data.profile.ratePerHour ?? ''),
      };
      setEmployeeProfiles((prev) => ({ ...prev, [key]: profile }));
      if (selectedEmployee?.id === key) {
        setShiftIn(profile.shiftIn);
        setShiftOut(profile.shiftOut);
        setShiftBreak(String(profile.breakMinutes));
        if (profile.ratePerHour && !isEditModeRef.current) setRatePerHour(profile.ratePerHour);
        recomputeFromScans(scansRef.current, selectedEmployee, payPeriod, profile);
      }
    },
    [selectedEmployee, payPeriod, recomputeFromScans],
  );

  useSocketSubscription(tenantRoom, 'rfid.timesheet.updated', handleRemoteTimesheet);
  useSocketSubscription(tenantRoom, 'rfid.employee-profile.updated', handleRemoteProfile);

  /** Re-check auto-logout at 11:59 PM and on a short interval while viewing today. */
  useEffect(() => {
    if (!selectedEmployee) return undefined;
    const tick = () => {
      if (isEditModeRef.current) return;
      recomputeFromScans(scansRef.current, selectedEmployee, payPeriod, activeShiftProfile);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [selectedEmployee, payPeriod, activeShiftProfile, recomputeFromScans]);

  useEffect(() => {
    if (!selectedEmployee || !isCurrentWeek || !isEditMode || !sheetReadyRef.current) return undefined;
    const payload = sheetPayload(workHours, receipts, travelMiles, additionalHours, ratePerHour, manualByDay);
    const serialized = JSON.stringify(payload);
    if (serialized === lastPersistedRef.current) return undefined;

    const timer = window.setTimeout(() => {
      void persistTimesheet(selectedEmployee.id, payPeriod.id, payload, { quiet: true }).catch(
        (error) => {
          console.error('Failed to save timesheet while editing:', error);
        },
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    selectedEmployee,
    payPeriod.id,
    isCurrentWeek,
    isEditMode,
    workHours,
    receipts,
    travelMiles,
    additionalHours,
    ratePerHour,
    manualByDay,
    persistTimesheet,
  ]);

  const handleWorkHoursChange = (index: number, field: 'in' | 'out' | 'breaks' | 'note', value: string) => {
    if (!canEdit) return;
    const day = workHours[index]?.day;
    if (day) {
      setManualByDay((prev) => ({
        ...prev,
        [day]: { ...prev[day], [field]: true },
      }));
    }
    setWorkHours((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleTravelMilesChange = (index: number, value: string) => {
    if (!canEdit) return;
    setTravelMiles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], miles: value.replace(/[^\d.]/g, '') };
      return next;
    });
  };

  const handleReceiptChange = (index: number, field: keyof ReceiptRow, value: string) => {
    if (!canEdit) return;
    setReceipts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddReceipt = () => {
    if (!canEdit) return;
    setReceipts((prev) => [...prev, { description: '', amount: '' }]);
  };

  const handleRemoveReceipt = (index: number) => {
    if (!canEdit) return;
    setReceipts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApplyDayShift = () => {
    if (!canEdit || !selectedEmployee) return;
    const profile = activeShiftProfile;
    const nextManual: Record<string, RfidManualDayFlags> = {};
    const nextRows = workHours.map((row) => {
      if (!isPayPeriodWorkday(row.day)) {
        nextManual[row.day] = { in: true, out: true, breaks: true, note: true };
        return { ...row, in: '0', out: '0', breaks: '0', note: '' };
      }
      nextManual[row.day] = { in: true, out: true, breaks: true, note: true };
      return {
        ...row,
        in: profile.shiftIn,
        out: profile.shiftOut,
        breaks: String(profile.breakMinutes),
        note: '',
      };
    });
    setManualByDay(nextManual);
    setWorkHours(nextRows);
    toast.success(`Applied shift (${profile.shiftIn}–${profile.shiftOut}) Mon–Fri; Sat/Sun cleared`);
  };

  const handleClearWeekHours = () => {
    if (!canEdit || !selectedEmployee) return;
    setManualByDay({});
    const merged = applyRfidToRows(
      scans,
      selectedEmployee,
      payPeriod,
      {},
      activeShiftProfile,
    );
    setWorkHours(merged.rows);
    setManualByDay(merged.manual);
  };

  const handleSaveShiftProfile = async () => {
    if (!canEdit || !selectedEmployee) return;
    try {
      const res = await api.put<{ profile: { employeeKey: string } }>(
        `/rfid/employee-profiles/${encodeURIComponent(selectedEmployee.id)}`,
        {
          displayName: selectedEmployee.name,
          shiftIn,
          shiftOut,
          breakMinutes: parseInt(shiftBreak || '0', 10) || 0,
          ratePerHour,
        },
      );
      const profile: RfidEmployeeShiftProfile = {
        shiftIn,
        shiftOut,
        breakMinutes: parseInt(shiftBreak || '0', 10) || 0,
        ratePerHour,
      };
      setEmployeeProfiles((prev) => ({
        ...prev,
        [selectedEmployee.id]: profile,
      }));
      recomputeFromScans(scans, selectedEmployee, payPeriod, profile);
      toast.success(`Saved shift for ${selectedEmployee.name}`);
      void res;
    } catch (error) {
      console.error(error);
      toast.error('Could not save employee shift');
    }
  };

  const handleExitEditMode = () => {
    if (!selectedEmployee) return;
    const payload = sheetPayload(workHours, receipts, travelMiles, additionalHours, ratePerHour, manualByDay);
    void persistTimesheet(selectedEmployee.id, payPeriod.id, payload)
      .then(() => {
        toast.success('Timesheet saved');
        setIsEditMode(false);
      })
      .catch((error) => {
        console.error('Failed to save timesheet:', error);
        toast.error('Could not save timesheet to server — try again');
      });
  };

  const handleAdditionalHoursChange = (
    index: number,
    field: keyof AdditionalHoursRow,
    value: string,
  ) => {
    if (!canEdit) return;
    setAdditionalHours((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddAdditionalHours = () => {
    if (!canEdit) return;
    setAdditionalHours((prev) => [...prev, newAdditionalHoursRow()]);
  };

  const handleRemoveAdditionalHours = (index: number) => {
    if (!canEdit) return;
    setAdditionalHours((prev) => prev.filter((_, i) => i !== index));
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
          Hours auto-fill live from RFID/PIN scans. Click <strong>Edit</strong> on the current week to adjust times,
          set each employee&apos;s expected shift, or add miles and receipts. Missing clock-outs after 11:59 PM use the
          employee&apos;s shift end time with an &quot;Auto log out&quot; note. Past pay weeks are greyed out and locked after payday Friday.
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
                  label="Employee"
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
              onChange={(e) => canEdit && setRatePerHour(e.target.value.replace(/[^\d.]/g, ''))}
              disabled={!canEdit}
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
              {loadingScans && (
                <Chip
                  size="small"
                  icon={<CircularProgress size={12} color="inherit" />}
                  label="Syncing scans…"
                  variant="outlined"
                />
              )}
              {socketConnected ? (
                <Chip size="small" label="Live" color="success" variant="outlined" />
              ) : (
                <Chip size="small" label="Connecting…" variant="outlined" />
              )}
              <Chip
                size="small"
                label={`Expected shift: ${activeShiftProfile.shiftIn}–${activeShiftProfile.shiftOut}`}
                variant="outlined"
              />
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
              {isCurrentWeek && !isEditMode && (
                <Chip size="small" label="Viewing" color="info" variant="outlined" />
              )}
              {isCurrentWeek && isEditMode && (
                <Chip size="small" label="Editing" color="warning" variant="outlined" />
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
          No RFID tags or kiosk PINs found. Register employees on the <strong>RFID scans</strong> page first
          (use the same name for tag and PIN so they appear as one person), then return here.
        </Alert>
      )}

      {selectedEmployee && (
        <>
          <Card sx={{ mb: 3, boxShadow: 2, ...readOnlyCardSx }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                  mb: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TimeIcon sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {selectedEmployee.name} — {payPeriod.label}
                  </Typography>
                </Box>
                {isCurrentWeek && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {!isEditMode ? (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<EditIcon />}
                        onClick={() => setIsEditMode(true)}
                        sx={{ textTransform: 'none' }}
                      >
                        Edit
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={handleExitEditMode}
                          sx={{ textTransform: 'none' }}
                        >
                          Done
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={handleApplyDayShift}
                          sx={{ textTransform: 'none' }}
                        >
                          Apply shift to week
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          onClick={handleClearWeekHours}
                          sx={{ textTransform: 'none' }}
                        >
                          Clear week
                        </Button>
                      </>
                    )}
                  </Box>
                )}
              </Box>

              {canEdit && (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    mb: 2,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 2,
                    alignItems: 'flex-end',
                  }}
                >
                  <Typography variant="subtitle2" sx={{ width: '100%', fontWeight: 600 }}>
                    Employee shift (used for auto clock-out at 11:59 PM if no scan out)
                  </Typography>
                  <TextField
                    label="Shift in"
                    value={shiftIn}
                    onChange={(e) => setShiftIn(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    size="small"
                    placeholder="600"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="Shift out"
                    value={shiftOut}
                    onChange={(e) => setShiftOut(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    size="small"
                    placeholder="1430"
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label="Break (min)"
                    value={shiftBreak}
                    onChange={(e) => setShiftBreak(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    size="small"
                    sx={{ width: 100, ...NO_NUMBER_SPINNER_SX }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => void handleSaveShiftProfile()}
                    sx={{ textTransform: 'none' }}
                  >
                    Save shift
                  </Button>
                </Paper>
              )}

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
                    <TableCell sx={{ fontWeight: 700 }}>Note</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workHours.map((row, index) => {
                    const hours = calculateHours(row.in, row.out, row.breaks);
                    return (
                      <TableRow
                        key={row.day}
                        hover={canEdit}
                        sx={isPastWeek ? { color: 'text.secondary' } : undefined}
                      >
                        <TableCell sx={{ fontWeight: 600 }}>{row.day}</TableCell>
                        <TableCell>{row.dateLabel}</TableCell>
                        <TableCell align="center">
                          {canEdit ? (
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
                          {canEdit ? (
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
                          {canEdit ? (
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
                        <TableCell sx={{ color: row.note ? 'warning.main' : 'text.secondary', fontSize: '0.85rem' }}>
                          {canEdit ? (
                            <TextField
                              value={row.note}
                              onChange={(e) => handleWorkHoursChange(index, 'note', e.target.value)}
                              size="small"
                              placeholder="—"
                              sx={{ minWidth: 120 }}
                            />
                          ) : (
                            row.note || '—'
                          )}
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
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>

              <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Additional hours
                  </Typography>
                  {canEdit && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddAdditionalHours}
                      sx={{ textTransform: 'none' }}
                    >
                      Add hours
                    </Button>
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Manual entries for extra time not captured by RFID (e.g. off-site work, adjustments).
                </Typography>

                {additionalHours.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    {canEdit
                      ? 'No additional hours. Click "Add hours" to record extra time.'
                      : 'No additional hours for this week.'}
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {additionalHours.map((row, index) => (
                      <Box
                        key={row.id}
                        sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}
                      >
                        <TextField
                          label="Description"
                          value={row.description}
                          onChange={(e) =>
                            handleAdditionalHoursChange(index, 'description', e.target.value)
                          }
                          size="small"
                          disabled={!canEdit}
                          placeholder="e.g. Off-site install"
                          sx={{ flex: '1 1 200px' }}
                        />
                        <TextField
                          label="Hours"
                          value={row.hours}
                          onChange={(e) =>
                            handleAdditionalHoursChange(
                              index,
                              'hours',
                              e.target.value.replace(/[^\d.]/g, ''),
                            )
                          }
                          size="small"
                          disabled={!canEdit}
                          inputProps={{ inputMode: 'decimal' }}
                          placeholder="0.00"
                          sx={{ width: 120 }}
                        />
                        {canEdit && (
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => handleRemoveAdditionalHours(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}

                {additionalHours.length > 0 && (
                  <Typography variant="body2" sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>
                    Additional: {weightedHoursData.manualHours.toFixed(2)} hrs
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3, mb: 3 }}>
            <Card sx={{ flex: 1, boxShadow: 2, ...readOnlyCardSx }}>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <CarIcon sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Travel miles
                  </Typography>
                </Box>

                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Day</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">Miles</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {travelMiles.map((row, index) => (
                      <TableRow key={row.day} hover={canEdit}>
                        <TableCell sx={{ fontWeight: 600 }}>{row.day}</TableCell>
                        <TableCell align="right">
                          {canEdit ? (
                            <TextField
                              value={row.miles}
                              onChange={(e) => handleTravelMilesChange(index, e.target.value)}
                              size="small"
                              placeholder="0"
                              inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                              sx={{ maxWidth: 100, ...NO_NUMBER_SPINNER_SX }}
                            />
                          ) : (
                            row.miles ? `${row.miles} mi` : '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow
                      sx={{
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(25, 118, 210, 0.16)' : '#e3f2fd',
                        '& td': { fontWeight: 700, borderTop: `2px solid ${theme.palette.primary.main}` },
                      }}
                    >
                      <TableCell>Total</TableCell>
                      <TableCell align="right" sx={{ color: 'primary.main' }}>
                        {totalMiles.toFixed(1)} mi
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <Paper sx={{ p: 2, mt: 2, bgcolor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Rate per mile
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ${PRICE_PER_MILE.toFixed(3)}
                    </Typography>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Travel reimbursement
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      ${travelCost.toFixed(2)}
                    </Typography>
                  </Box>
                </Paper>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1, boxShadow: 2, ...readOnlyCardSx }}>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ReceiptIcon sx={{ color: 'primary.main' }} />
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      Receipts
                    </Typography>
                  </Box>
                  {canEdit && (
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
                    {canEdit
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
                          disabled={!canEdit}
                          sx={{ flex: '1 1 180px' }}
                        />
                        <TextField
                          label="Amount"
                          value={receipt.amount}
                          onChange={(e) =>
                            handleReceiptChange(index, 'amount', e.target.value.replace(/[^\d.]/g, ''))
                          }
                          size="small"
                          disabled={!canEdit}
                          inputProps={{ inputMode: 'decimal' }}
                          InputProps={{
                            startAdornment: <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>$</Typography>,
                          }}
                          sx={{ width: 140 }}
                        />
                        {canEdit && (
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
                    <Typography color="text.secondary">Travel ({totalMiles.toFixed(1)} mi)</Typography>
                    <Typography sx={{ fontWeight: 600 }}>${travelCost.toFixed(2)}</Typography>
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
