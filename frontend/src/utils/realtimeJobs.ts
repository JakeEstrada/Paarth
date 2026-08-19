/** Shared helpers for applying job Socket.IO payloads onto in-memory lists. */

type JobLike = {
  _id?: unknown;
  deleted?: boolean;
  isArchived?: boolean;
  isDeadEstimate?: boolean;
  isCompletedClosedOut?: boolean;
  customerId?: unknown;
  assignedTo?: unknown;
  createdBy?: unknown;
  [key: string]: unknown;
};

type JobRealtimePayload = {
  entityId?: unknown;
  patch?: JobLike;
  project?: JobLike;
  sourceSocketId?: string | null;
};

function jobId(job: JobLike | null | undefined): string {
  return String(job?._id || '').trim();
}

export function isActivePipelineJob(job: JobLike | null | undefined): boolean {
  if (!job || job.deleted) return false;
  if (job.isArchived || job.isDeadEstimate || job.isCompletedClosedOut) return false;
  return true;
}

export function isActiveCalendarJob(job: JobLike | null | undefined): boolean {
  if (!job || job.deleted) return false;
  if (job.isArchived || job.isDeadEstimate) return false;
  return true;
}

function preserveNestedRefs(existing: JobLike, incoming: JobLike): JobLike {
  const next = { ...existing, ...incoming };
  for (const key of ['customerId', 'assignedTo', 'createdBy'] as const) {
    const inc = incoming[key];
    const prev = existing[key];
    const incomingIsBareId = inc != null && typeof inc !== 'object';
    const prevIsPopulated = prev != null && typeof prev === 'object';
    if (incomingIsBareId && prevIsPopulated) {
      next[key] = prev;
    }
  }
  return next;
}

export function applyJobRealtimeToList<T extends JobLike>(
  prev: T[],
  payload: JobRealtimePayload | null | undefined,
  keepIf: (job: T) => boolean,
): T[] {
  const incoming = (payload?.patch || payload?.project) as T | undefined;
  const entityId = String(payload?.entityId || incoming?._id || '').trim();
  if (!incoming || !entityId) return prev;

  const idx = prev.findIndex((job) => jobId(job) === entityId);
  if (incoming.deleted || !keepIf(incoming)) {
    if (idx === -1) return prev;
    const next = [...prev];
    next.splice(idx, 1);
    return next;
  }

  if (idx === -1) {
    return [incoming, ...prev];
  }

  const next = [...prev];
  next[idx] = preserveNestedRefs(next[idx], incoming) as T;
  return next;
}
