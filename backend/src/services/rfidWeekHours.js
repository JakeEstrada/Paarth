const RfidScan = require('../models/RfidScan');
const RfidTag = require('../models/RfidTag');
const RfidPin = require('../models/RfidPin');
const RfidEmployeeProfile = require('../models/RfidEmployeeProfile');
const RfidTimesheetWeek = require('../models/RfidTimesheetWeek');

const PAY_PERIOD_DAYS = [
  'Friday',
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
];

const RFID_SCAN_BURST_MS = 5 * 60 * 1000;
const RFID_DEFAULT_SHIFT_IN = '600';
const RFID_DEFAULT_SHIFT_OUT = '1430';
const RFID_DEFAULT_BREAK_MINUTES = 30;
const RFID_MIN_SHIFT_FOR_BREAK_MINUTES = 60;
const AUTO_LOGOUT_NOTE = 'Auto log out';

function normalizeEmployeeKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPayPeriodForDate(date = new Date()) {
  const d = startOfDay(date);
  const weekday = d.getDay();
  let periodStart;

  if (weekday === 5) periodStart = d;
  else if (weekday === 6) periodStart = addDays(d, -1);
  else periodStart = addDays(d, -(weekday + 2));

  const periodEnd = addDays(periodStart, 6);
  return {
    start: periodStart,
    end: periodEnd,
    id: formatYmd(periodStart),
  };
}

function timeToMinutes(timeStr) {
  if (!timeStr || timeStr === '0') return 0;
  const padded = String(timeStr).padStart(4, '0');
  const hours = parseInt(padded.substring(0, 2), 10);
  const minutes = parseInt(padded.substring(2, 4), 10);
  return hours * 60 + minutes;
}

function calculateHours(inTime, outTime, breaks) {
  if (!inTime || !outTime || inTime === '0' || outTime === '0') return 0;
  const inMinutes = timeToMinutes(inTime);
  const outMinutes = timeToMinutes(outTime);
  const breakMinutes = parseInt(breaks || '0', 10) || 0;
  if (outMinutes <= inMinutes) return 0;
  return Math.max(0, (outMinutes - inMinutes - breakMinutes) / 60);
}

function minutesToTimeInput(minutes) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours}${String(mins).padStart(2, '0')}`;
}

function shiftDurationMinutes(inToken, outToken) {
  if (!inToken || !outToken || inToken === '0' || outToken === '0') return 0;
  const diff = timeToMinutes(outToken) - timeToMinutes(inToken);
  return diff > 0 ? diff : 0;
}

function shouldAutoLogoutForDay(dayDate, now) {
  const dayStart = startOfDay(dayDate);
  const todayStart = startOfDay(now);
  if (dayStart.getTime() < todayStart.getTime()) return true;
  if (dayStart.getTime() > todayStart.getTime()) return false;
  const cutoff = new Date(dayDate);
  cutoff.setHours(23, 59, 0, 0);
  return now.getTime() >= cutoff.getTime();
}

function breakForShift(inToken, outToken, profile) {
  const duration = shiftDurationMinutes(inToken, outToken);
  if (duration <= RFID_MIN_SHIFT_FOR_BREAK_MINUTES) return '0';
  return String(profile.breakMinutes ?? RFID_DEFAULT_BREAK_MINUTES);
}

function dedupeScanTimes(sortedTimes, burstMs = RFID_SCAN_BURST_MS) {
  if (sortedTimes.length === 0) return [];
  const deduped = [sortedTimes[0]];
  for (let i = 1; i < sortedTimes.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    const current = sortedTimes[i];
    if (current.getTime() - prev.getTime() >= burstMs) deduped.push(current);
  }
  return deduped;
}

function clockFromScanTimes(times) {
  if (times.length === 0) return { in: '0', out: '0' };
  const first = times[0];
  const inToken = minutesToTimeInput(first.getHours() * 60 + first.getMinutes());
  if (times.length === 1) return { in: inToken, out: '0' };
  const last = times[times.length - 1];
  return {
    in: inToken,
    out: minutesToTimeInput(last.getHours() * 60 + last.getMinutes()),
  };
}

function scanMatchesEmployee(scan, employee) {
  const uid = String(scan.uid || '').trim();
  const pin = String(scan.pin || '').trim();
  if (uid && employee.uids.includes(uid)) return true;
  if (pin && employee.pins.includes(pin)) return true;
  const scanName = normalizeEmployeeKey(scan.displayName);
  return scanName.length > 0 && scanName === employee.id;
}

function buildEmployeeIdentity(displayName, tags, pins) {
  const employeeKey = normalizeEmployeeKey(displayName);
  const employee = {
    id: employeeKey,
    name: String(displayName || '').trim(),
    uids: [],
    pins: [],
  };

  for (const tag of tags) {
    if (normalizeEmployeeKey(tag.displayName) !== employeeKey) continue;
    if (tag.uid && !employee.uids.includes(tag.uid)) employee.uids.push(tag.uid);
  }

  for (const pinEntry of pins) {
    if (normalizeEmployeeKey(pinEntry.displayName) !== employeeKey) continue;
    if (pinEntry.pin && !employee.pins.includes(pinEntry.pin)) employee.pins.push(pinEntry.pin);
  }

  return employee;
}

function buildRfidDayClocks(scans, employee, period, shiftProfile, now = new Date()) {
  const dayDates = PAY_PERIOD_DAYS.map((_, index) => addDays(period.start, index));
  const dateKeys = dayDates.map((d) => formatYmd(d));
  const scansByDateKey = new Map(dateKeys.map((key) => [key, []]));

  const periodStart = startOfDay(period.start).getTime();
  const periodEnd = addDays(startOfDay(period.end), 1).getTime();

  for (const scan of scans) {
    if (!scanMatchesEmployee(scan, employee)) continue;
    const at = new Date(scan.scannedAt);
    if (Number.isNaN(at.getTime())) continue;
    const ms = at.getTime();
    if (ms < periodStart || ms >= periodEnd) continue;
    const key = formatYmd(at);
    if (!scansByDateKey.has(key)) continue;
    scansByDateKey.get(key).push(at);
  }

  const result = {};

  PAY_PERIOD_DAYS.forEach((day, index) => {
    const dayDate = dayDates[index];
    const key = dateKeys[index];
    const raw = (scansByDateKey.get(key) || []).sort((a, b) => a.getTime() - b.getTime());
    const deduped = dedupeScanTimes(raw);
    const clock = clockFromScanTimes(deduped);
    let outToken = clock.out;
    let note = '';

    if (clock.in !== '0' && outToken === '0' && shouldAutoLogoutForDay(dayDate, now)) {
      outToken = shiftProfile.shiftOut || RFID_DEFAULT_SHIFT_OUT;
      note = AUTO_LOGOUT_NOTE;
    }

    result[day] = {
      in: clock.in,
      out: outToken,
      breaks: breakForShift(clock.in, outToken, shiftProfile),
      scanCount: deduped.length,
      note,
    };
  });

  return result;
}

function mergeRfidIntoWorkHours(rows, rfidByDay, manualByDay) {
  return rows.map((row) => {
    const rfid = rfidByDay[row.day];
    if (!rfid) return row;
    const manual = manualByDay[row.day] || {};
    const next = { ...row };
    if (!manual.in) next.in = rfid.in;
    if (!manual.out) next.out = rfid.out;
    if (!manual.breaks) next.breaks = rfid.breaks;
    if (!manual.note) next.note = rfid.note;
    next.scanCount = rfid.scanCount;
    return next;
  });
}

function defaultWorkHours() {
  return PAY_PERIOD_DAYS.map((day) => ({
    day,
    in: '0',
    out: '0',
    breaks: '0',
    scanCount: 0,
    note: '',
  }));
}

async function computeWeekTotalHours(displayName, options = {}) {
  const employeeKey = normalizeEmployeeKey(displayName);
  if (!employeeKey || /^unknown (tag|pin)/i.test(String(displayName || '').trim())) {
    return null;
  }

  const now = options.now || new Date();
  const period = getPayPeriodForDate(now);

  const [tags, pins, profile, timesheet, scans] = await Promise.all([
    RfidTag.find({ isActive: { $ne: false } }).lean(),
    RfidPin.find({ isActive: { $ne: false } }).lean(),
    RfidEmployeeProfile.findOne({ employeeKey }).lean(),
    RfidTimesheetWeek.findOne({ employeeKey, periodId: period.id }).lean(),
    RfidScan.find({
      scannedAt: {
        $gte: startOfDay(period.start),
        $lt: addDays(startOfDay(period.end), 1),
      },
    }).lean(),
  ]);

  const employee = buildEmployeeIdentity(displayName, tags, pins);
  const shiftProfile = {
    shiftIn: profile?.shiftIn || RFID_DEFAULT_SHIFT_IN,
    shiftOut: profile?.shiftOut || RFID_DEFAULT_SHIFT_OUT,
    breakMinutes: Number(profile?.breakMinutes ?? RFID_DEFAULT_BREAK_MINUTES) || 0,
  };

  const baseRows = defaultWorkHours().map((defaultRow) => {
    const saved = (timesheet?.workHours || []).find((row) => row.day === defaultRow.day);
    if (!saved) return defaultRow;
    return {
      ...defaultRow,
      in: String(saved.in ?? defaultRow.in),
      out: String(saved.out ?? defaultRow.out),
      breaks: String(saved.breaks ?? defaultRow.breaks),
      scanCount: Number(saved.scanCount) || 0,
      note: String(saved.note ?? ''),
    };
  });

  const manualByDay =
    timesheet?.manualByDay && typeof timesheet.manualByDay === 'object' ? timesheet.manualByDay : {};
  const rfidByDay = buildRfidDayClocks(scans, employee, period, shiftProfile, now);
  const rows = mergeRfidIntoWorkHours(baseRows, rfidByDay, manualByDay);

  const scheduleHours = rows.reduce(
    (sum, row) => sum + calculateHours(row.in, row.out, row.breaks),
    0,
  );
  const additionalHours = (timesheet?.additionalHours || []).reduce(
    (sum, row) => sum + (parseFloat(row.hours) || 0),
    0,
  );
  const totalHours = scheduleHours + additionalHours;

  return {
    weekTotalHours: Math.round(totalHours * 100) / 100,
    periodId: period.id,
    employeeKey,
  };
}

module.exports = {
  computeWeekTotalHours,
  getPayPeriodForDate,
};
