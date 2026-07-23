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

/** Match RFID timesheet UI — shop local time, not UTC (Render default). */
const SHOP_TIMEZONE = process.env.RFID_SHOP_TIMEZONE || 'America/Los_Angeles';

const shopYmdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const shopClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const shopWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIMEZONE,
  weekday: 'short',
});

const SHOP_WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatToPartsMap(formatter, date) {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function getShopClock(date = new Date()) {
  const parts = formatToPartsMap(shopClockFormatter, date);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second || 0),
  };
}

function getShopWeekday(date = new Date()) {
  const short = shopWeekdayFormatter.format(date);
  return SHOP_WEEKDAY_MAP[short] ?? 0;
}

function formatYmd(date) {
  const parts = formatToPartsMap(shopYmdFormatter, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shopMidnightUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 8, 0, 0);
  for (let offsetMin = -18 * 60; offsetMin <= 18 * 60; offsetMin += 1) {
    const candidate = new Date(guess + offsetMin * 60000);
    const clock = getShopClock(candidate);
    const key = `${clock.year}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`;
    if (key === ymd && clock.hour === 0 && clock.minute === 0) {
      return candidate;
    }
  }
  throw new Error(`Could not resolve shop midnight for ${ymd} (${SHOP_TIMEZONE})`);
}

function shopStartOfDay(date = new Date()) {
  return shopMidnightUtc(formatYmd(date));
}

function normalizeEmployeeKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function getPayPeriodForDate(date = new Date()) {
  const weekday = getShopWeekday(date);
  const todayStart = shopStartOfDay(date);
  let periodStart;

  if (weekday === 5) periodStart = todayStart;
  else if (weekday === 6) periodStart = addDays(todayStart, -1);
  else periodStart = addDays(todayStart, -(weekday + 2));

  const periodEnd = addDays(periodStart, 6);
  return {
    start: periodStart,
    end: periodEnd,
    id: formatYmd(periodStart),
  };
}

function getTodayPayPeriodDay(period, now = new Date()) {
  const nowYmd = formatYmd(now);
  const endYmd = formatYmd(period.end);
  const startYmd = formatYmd(period.start);
  if (nowYmd < startYmd || nowYmd > endYmd) return null;

  for (let index = 0; index < PAY_PERIOD_DAYS.length; index += 1) {
    const dayDate = addDays(period.start, index);
    if (formatYmd(dayDate) === nowYmd) return PAY_PERIOD_DAYS[index];
  }

  return null;
}

function rfidLiveDayNames(period, now = new Date()) {
  const today = getTodayPayPeriodDay(period, now);
  return today ? [today] : [];
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
  const dayStart = shopStartOfDay(dayDate);
  const todayStart = shopStartOfDay(now);
  if (dayStart.getTime() < todayStart.getTime()) return true;
  if (dayStart.getTime() > todayStart.getTime()) return false;
  const nextDayStart = shopStartOfDay(addDays(dayStart, 1));
  const cutoff = new Date(nextDayStart.getTime() - 60000);
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
  const first = getShopClock(times[0]);
  const inToken = minutesToTimeInput(first.hour * 60 + first.minute);
  if (times.length === 1) return { in: inToken, out: '0' };
  const last = getShopClock(times[times.length - 1]);
  return {
    in: inToken,
    out: minutesToTimeInput(last.hour * 60 + last.minute),
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

  const periodStart = period.start.getTime();
  const periodEnd = addDays(period.end, 1).getTime();

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

function inferManualFromSavedRows(rows, rfidByDay, existingManual = {}) {
  const result = { ...existingManual };

  for (const row of rows) {
    const rfid = rfidByDay[row.day];
    if (!rfid) continue;
    const flags = { ...(result[row.day] || {}) };
    if (!flags.in && row.in !== '0' && row.in !== rfid.in) flags.in = true;
    if (!flags.out && row.out !== '0' && row.out !== rfid.out) flags.out = true;
    if (!flags.breaks && row.breaks !== '0' && row.breaks !== rfid.breaks) flags.breaks = true;
    const rowNote = row.note || '';
    if (!flags.note && rowNote.length > 0 && rowNote !== (rfid.note || '')) flags.note = true;
    if (flags.in || flags.out || flags.breaks || flags.note) {
      result[row.day] = flags;
    }
  }

  return result;
}

function sanitizeManualByDay(manual, workHours) {
  const savedByDay = Object.fromEntries((workHours || []).map((r) => [r.day, r]));
  const result = {};

  for (const [day, flags] of Object.entries(manual || {})) {
    const saved = savedByDay[day];
    const cleaned = {};
    if (flags.in && saved?.in && saved.in !== '0') cleaned.in = true;
    if (flags.out && saved?.out && saved.out !== '0') cleaned.out = true;
    if (flags.breaks && saved?.breaks && saved.breaks !== '0') cleaned.breaks = true;
    const note = String(saved?.note ?? '').trim();
    if (flags.note && note.length > 0) cleaned.note = true;
    if (Object.keys(cleaned).length > 0) result[day] = cleaned;
  }

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
        $gte: period.start,
        $lt: addDays(period.end, 1),
      },
    }).lean(),
  ]);

  const employee = buildEmployeeIdentity(displayName, tags, pins);
  const shiftProfile = {
    shiftIn: profile?.shiftIn || RFID_DEFAULT_SHIFT_IN,
    shiftOut: profile?.shiftOut || RFID_DEFAULT_SHIFT_OUT,
    breakMinutes: Number(profile?.breakMinutes ?? RFID_DEFAULT_BREAK_MINUTES) || 0,
  };

  const baseRows = defaultWorkHours();
  const savedWorkHours = (timesheet?.workHours || []).map((row) => ({
    day: row.day,
    in: String(row.in ?? '0'),
    out: String(row.out ?? '0'),
    breaks: String(row.breaks ?? '0'),
    scanCount: Number(row.scanCount) || 0,
    note: String(row.note ?? ''),
  }));

  const rfidByDay = buildRfidDayClocks(scans, employee, period, shiftProfile, now);
  let manualByDay = sanitizeManualByDay(
    timesheet?.manualByDay && typeof timesheet.manualByDay === 'object' ? timesheet.manualByDay : {},
    savedWorkHours,
  );
  manualByDay = inferManualFromSavedRows(savedWorkHours, rfidByDay, manualByDay);
  manualByDay = sanitizeManualByDay(manualByDay, savedWorkHours);

  const liveDays = rfidLiveDayNames(period, now);
  const ignoreManual = new Set(liveDays);
  const effectiveManual = Object.fromEntries(
    Object.entries(manualByDay).filter(([day]) => !ignoreManual.has(day)),
  );
  const savedByDay = Object.fromEntries(savedWorkHours.map((row) => [row.day, row]));
  let rows = mergeRfidIntoWorkHours(baseRows, rfidByDay, effectiveManual);
  rows = rows.map((row) => {
    const flags = effectiveManual[row.day];
    const saved = savedByDay[row.day];
    if (!flags || !saved) return row;
    return {
      ...row,
      in: flags.in ? String(saved.in) : row.in,
      out: flags.out ? String(saved.out) : row.out,
      breaks: flags.breaks ? String(saved.breaks) : row.breaks,
      note: flags.note ? String(saved.note ?? '') : row.note,
    };
  });

  // Today always reflects live scans — ignore stale saved/manual clock times.
  for (const day of liveDays) {
    const rfid = rfidByDay[day];
    const row = rows.find((entry) => entry.day === day);
    if (!rfid || !row) continue;
    row.in = rfid.in;
    row.out = rfid.out;
    row.breaks = rfid.breaks;
    row.note = rfid.note;
    row.scanCount = rfid.scanCount;
  });

  const scheduleHours = rows.reduce(
    (sum, row) => sum + calculateHours(row.in, row.out, row.breaks),
    0,
  );
  const additionalHours = (timesheet?.additionalHours || []).reduce(
    (sum, row) => sum + (parseFloat(row.hours) || 0),
    0,
  );
  const totalHours = scheduleHours + additionalHours;

  const weekDays = rows.map((row) => ({
    day: row.day,
    in: row.in,
    out: row.out,
    breaks: row.breaks,
    hours: Math.round(calculateHours(row.in, row.out, row.breaks) * 100) / 100,
  }));

  return {
    weekTotalHours: Math.round(totalHours * 100) / 100,
    weekDays,
    periodId: period.id,
    employeeKey,
  };
}

module.exports = {
  computeWeekTotalHours,
  getPayPeriodForDate,
  sanitizeManualByDay,
};
