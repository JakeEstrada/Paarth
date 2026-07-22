import { addDays, format, startOfDay } from 'date-fns';
import {
  PAY_PERIOD_DAYS,
  getPayPeriodDayDates,
  type PayPeriod,
} from './payPeriod';

/** Scans within this window count as one tap (reader sensitivity / double reads). */
export const RFID_SCAN_BURST_MS = 5 * 60 * 1000;

export const RFID_DEFAULT_BREAK_MINUTES = 30;

/** Only auto-apply lunch break when the shift is longer than this (minutes). */
export const RFID_MIN_SHIFT_FOR_BREAK_MINUTES = 60;

export type RfidScanRecord = {
  _id?: string;
  uid?: string;
  pin?: string;
  displayName?: string;
  scannedAt: string | Date;
};

export type RfidEmployeeIdentity = {
  /** Stable key — normalized display name */
  id: string;
  name: string;
  uids: string[];
  pins: string[];
};

export type RfidDayClock = {
  in: string;
  out: string;
  breaks: string;
  scanCount: number;
};

export type RfidManualDayFlags = {
  in?: boolean;
  out?: boolean;
  breaks?: boolean;
};

export function normalizeEmployeeKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function mergeRfidRegistries(
  tags: Array<{ _id: string; uid: string; displayName: string }>,
  pins: Array<{ _id: string; pin: string; displayName: string }>,
): RfidEmployeeIdentity[] {
  const byKey = new Map<string, RfidEmployeeIdentity>();

  for (const tag of tags) {
    const name = String(tag.displayName || '').trim();
    if (!name) continue;
    const key = normalizeEmployeeKey(name);
    let row = byKey.get(key);
    if (!row) {
      row = { id: key, name, uids: [], pins: [] };
      byKey.set(key, row);
    }
    if (tag.uid && !row.uids.includes(tag.uid)) row.uids.push(tag.uid);
  }

  for (const pinEntry of pins) {
    const name = String(pinEntry.displayName || '').trim();
    if (!name) continue;
    const key = normalizeEmployeeKey(name);
    let row = byKey.get(key);
    if (!row) {
      row = { id: key, name, uids: [], pins: [] };
      byKey.set(key, row);
    }
    if (pinEntry.pin && !row.pins.includes(pinEntry.pin)) row.pins.push(pinEntry.pin);
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function scanMatchesEmployee(scan: RfidScanRecord, employee: RfidEmployeeIdentity): boolean {
  const uid = String(scan.uid || '').trim();
  const pin = String(scan.pin || '').trim();
  if (uid && employee.uids.includes(uid)) return true;
  if (pin && employee.pins.includes(pin)) return true;
  const scanName = normalizeEmployeeKey(String(scan.displayName || ''));
  return scanName.length > 0 && scanName === employee.id;
}

export function dedupeScanTimes(sortedTimes: Date[], burstMs = RFID_SCAN_BURST_MS): Date[] {
  if (sortedTimes.length === 0) return [];
  const deduped: Date[] = [sortedTimes[0]];
  for (let i = 1; i < sortedTimes.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    const current = sortedTimes[i];
    if (current.getTime() - prev.getTime() >= burstMs) {
      deduped.push(current);
    }
  }
  return deduped;
}

export function minutesToTimeInput(minutes: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours}${String(mins).padStart(2, '0')}`;
}

function localDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function clockFromScanTimes(times: Date[]): { in: string; out: string } {
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

function shiftDurationMinutes(inToken: string, outToken: string): number {
  if (!inToken || !outToken || inToken === '0' || outToken === '0') return 0;
  const parse = (token: string) => {
    const padded = token.padStart(4, '0');
    return parseInt(padded.substring(0, 2), 10) * 60 + parseInt(padded.substring(2, 4), 10);
  };
  const diff = parse(outToken) - parse(inToken);
  return diff > 0 ? diff : 0;
}

/** Build Fri–Thu clock rows from raw scans for one employee and pay period. */
export function buildRfidDayClocks(
  scans: RfidScanRecord[],
  employee: RfidEmployeeIdentity,
  period: PayPeriod,
): Record<(typeof PAY_PERIOD_DAYS)[number], RfidDayClock> {
  const dayDates = getPayPeriodDayDates(period);
  const dateKeys = dayDates.map((d) => localDateKey(d));
  const scansByDateKey = new Map<string, Date[]>();

  for (const key of dateKeys) {
    scansByDateKey.set(key, []);
  }

  const periodStart = startOfDay(period.start).getTime();
  const periodEnd = addDays(startOfDay(period.end), 1).getTime();

  for (const scan of scans) {
    if (!scanMatchesEmployee(scan, employee)) continue;
    const at = new Date(scan.scannedAt);
    if (Number.isNaN(at.getTime())) continue;
    const ms = at.getTime();
    if (ms < periodStart || ms >= periodEnd) continue;

    const key = localDateKey(at);
    if (!scansByDateKey.has(key)) continue;
    scansByDateKey.get(key)!.push(at);
  }

  const result = {} as Record<(typeof PAY_PERIOD_DAYS)[number], RfidDayClock>;

  PAY_PERIOD_DAYS.forEach((day, index) => {
    const key = dateKeys[index];
    const raw = (scansByDateKey.get(key) || []).sort((a, b) => a.getTime() - b.getTime());
    const deduped = dedupeScanTimes(raw);
    const { in, out } = clockFromScanTimes(deduped);
    const duration = shiftDurationMinutes(in, out);
    const hasShift = in !== '0' && out !== '0';
    result[day] = {
      in,
      out,
      breaks:
        hasShift && duration > RFID_MIN_SHIFT_FOR_BREAK_MINUTES
          ? String(RFID_DEFAULT_BREAK_MINUTES)
          : '0',
      scanCount: deduped.length,
    };
  });

  return result;
}

export function mergeRfidIntoWorkHours<T extends { day: string; in: string; out: string; breaks: string; scanCount: number }>(
  rows: T[],
  rfidByDay: Record<string, RfidDayClock>,
  manualByDay: Record<string, RfidManualDayFlags>,
): T[] {
  return rows.map((row) => {
    const rfid = rfidByDay[row.day];
    if (!rfid) return row;
    const manual = manualByDay[row.day] || {};
    const next = { ...row };
    if (!manual.in) next.in = rfid.in;
    if (!manual.out) next.out = rfid.out;
    if (!manual.breaks) next.breaks = rfid.breaks;
    next.scanCount = rfid.scanCount;
    return next;
  });
}

export function payPeriodScanRangeIso(period: PayPeriod): { from: string; to: string } {
  const from = startOfDay(period.start).toISOString();
  const to = addDays(startOfDay(period.end), 1).toISOString();
  return { from, to };
}
