/** In-memory caches for file lists — survives page/modal unmount (same session). */

export type DocumentsTreeCache = {
  folders: unknown[];
  files: unknown[];
};

let documentsTreeCache: DocumentsTreeCache | null = null;
const jobFilesCache = new Map<string, unknown[]>();

export function getDocumentsTreeCache(): DocumentsTreeCache | null {
  if (!documentsTreeCache) return null;
  return {
    folders: [...documentsTreeCache.folders],
    files: [...documentsTreeCache.files],
  };
}

export function setDocumentsTreeCache(data: DocumentsTreeCache): void {
  documentsTreeCache = {
    folders: Array.isArray(data.folders) ? [...data.folders] : [],
    files: Array.isArray(data.files) ? [...data.files] : [],
  };
}

export function invalidateDocumentsTreeCache(): void {
  documentsTreeCache = null;
}

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
