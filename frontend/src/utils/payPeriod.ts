import { addDays, format, startOfDay, subDays } from 'date-fns';

/** Pay week runs Friday → Thursday; paycheck on the following Friday. */
export const PAY_PERIOD_DAYS = [
  'Friday',
  'Saturday',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
] as const;

export type PayPeriodDay = (typeof PAY_PERIOD_DAYS)[number];

export type PayPeriod = {
  /** Friday that starts the work week */
  start: Date;
  /** Thursday that ends the work week */
  end: Date;
  /** Payday — the Friday after the work week */
  payDate: Date;
  label: string;
  /** yyyy-MM-dd of period start (stable key) */
  id: string;
};

function buildPayPeriod(start: Date): PayPeriod {
  const periodStart = startOfDay(start);
  const periodEnd = addDays(periodStart, 6);
  const payDate = addDays(periodStart, 7);
  return {
    start: periodStart,
    end: periodEnd,
    payDate,
    label: `${format(periodStart, 'MMM d')} – ${format(periodEnd, 'MMM d, yyyy')}`,
    id: format(periodStart, 'yyyy-MM-dd'),
  };
}

/** Return the Fri–Thu pay period that contains `date`. */
export function getPayPeriodForDate(date: Date): PayPeriod {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 Sun … 5 Fri … 6 Sat

  let periodStart: Date;
  if (day === 5) {
    periodStart = d;
  } else if (day === 6) {
    periodStart = subDays(d, 1);
  } else {
    periodStart = subDays(d, day + 2);
  }

  return buildPayPeriod(periodStart);
}

export function shiftPayPeriod(period: PayPeriod, weekDelta: number): PayPeriod {
  return buildPayPeriod(addDays(period.start, weekDelta * 7));
}

/** Calendar date for each day slot in the pay period (Fri → Thu). */
export function getPayPeriodDayDates(period: PayPeriod): Date[] {
  return PAY_PERIOD_DAYS.map((_, index) => addDays(period.start, index));
}

export function formatPayPeriodDayHeader(date: Date): string {
  return format(date, 'EEE, MMM d');
}

export function formatPayDate(date: Date): string {
  return format(date, 'EEE, MMM d, yyyy');
}

/** Recent pay periods for dropdowns (current week first). */
export function listRecentPayPeriods(anchor: Date, count = 12): PayPeriod[] {
  const current = getPayPeriodForDate(anchor);
  const periods: PayPeriod[] = [];
  for (let i = 0; i < count; i += 1) {
    periods.push(shiftPayPeriod(current, -i));
  }
  return periods;
}
