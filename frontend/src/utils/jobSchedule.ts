import { differenceInCalendarDays, format } from 'date-fns';

export interface JobScheduleSegment {
  id: string;
  installer: string;
  startDate: string;
  endDate: string;
  source: 'entry' | 'legacy';
}

function parseScheduleDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Normalize calendar schedule data into ordered visit segments (installer + date range). */
export function getJobScheduleSegments(job: {
  schedule?: {
    installer?: string;
    installers?: string[];
    startDate?: string;
    endDate?: string;
    entries?: Array<{
      installer?: string;
      startDate?: string;
      endDate?: string;
    }>;
  };
} | null | undefined): JobScheduleSegment[] {
  const schedule = job?.schedule || {};
  const segments: JobScheduleSegment[] = [];
  const entries = Array.isArray(schedule.entries) ? schedule.entries : [];

  if (entries.length > 0) {
    entries.forEach((entry, index) => {
      if (!entry?.startDate) return;
      segments.push({
        id: `entry-${index}`,
        installer: String(entry.installer || '').trim() || 'Unassigned',
        startDate: String(entry.startDate),
        endDate: String(entry.endDate || entry.startDate),
        source: 'entry',
      });
    });
  } else {
    const installers =
      Array.isArray(schedule.installers) && schedule.installers.length > 0
        ? schedule.installers.filter(Boolean)
        : schedule.installer
          ? [schedule.installer]
          : [];

    if (schedule.startDate && installers.length > 0) {
      installers.forEach((installer, index) => {
        segments.push({
          id: `legacy-${index}`,
          installer: String(installer).trim() || 'Unassigned',
          startDate: String(schedule.startDate),
          endDate: String(schedule.endDate || schedule.startDate),
          source: 'legacy',
        });
      });
    } else if (schedule.startDate) {
      segments.push({
        id: 'legacy-single',
        installer: String(schedule.installer || 'Unassigned').trim() || 'Unassigned',
        startDate: String(schedule.startDate),
        endDate: String(schedule.endDate || schedule.startDate),
        source: 'legacy',
      });
    }
  }

  return segments.sort((a, b) => {
    const aTime = parseScheduleDate(a.startDate)?.getTime() ?? 0;
    const bTime = parseScheduleDate(b.startDate)?.getTime() ?? 0;
    return aTime - bTime;
  });
}

export function formatJobScheduleDateRange(startDate: string, endDate: string): string {
  const start = parseScheduleDate(startDate);
  const end = parseScheduleDate(endDate);
  if (!start) return '—';
  const startLabel = format(start, 'MMM d, yyyy');
  if (!end) return startLabel;
  const endLabel = format(end, 'MMM d, yyyy');
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function getJobScheduleDayCount(startDate: string, endDate: string): number {
  const start = parseScheduleDate(startDate);
  const end = parseScheduleDate(endDate);
  if (!start || !end) return 1;
  return Math.max(1, differenceInCalendarDays(end, start) + 1);
}
