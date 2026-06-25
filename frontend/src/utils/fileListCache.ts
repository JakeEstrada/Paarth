/** In-memory cache for job file lists — survives page/modal unmount (same session). */

const jobFilesCache = new Map<string, unknown[]>();

export function getJobFilesCache(jobId: string | null | undefined): unknown[] | null {
  if (!jobId) return null;
  const hit = jobFilesCache.get(String(jobId));
  return hit ? [...hit] : null;
}

export function setJobFilesCache(jobId: string | null | undefined, files: unknown[]): void {
  if (!jobId) return;
  jobFilesCache.set(String(jobId), Array.isArray(files) ? [...files] : []);
}

export function invalidateJobFilesCache(jobId?: string | null): void {
  if (jobId) jobFilesCache.delete(String(jobId));
  else jobFilesCache.clear();
}
