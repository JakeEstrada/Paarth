import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import api from '../utils/axios';

async function errorMessageFromUnknown(err: unknown): Promise<string> {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        const parsed = JSON.parse(text) as { error?: string; message?: string };
        return parsed.error || parsed.message || text || err.message;
      } catch {
        return err.message;
      }
    }
    if (data && typeof data === 'object') {
      const parsed = data as { error?: string; message?: string };
      return parsed.error || parsed.message || err.message;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Failed to load file';
}

/**
 * Fetches a job/task file with auth + tenant headers and returns a blob object URL.
 */
export function useAuthenticatedFileUrl(fileId: string | undefined | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setUrl(null);
    setError(null);

    const id = fileId != null ? String(fileId).trim() : '';
    if (!id) {
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await api.get(`/files/${id}`, { responseType: 'blob' });
        if (cancelled) return;
        const contentType = String(res.headers['content-type'] || '');
        if (contentType.includes('application/json')) {
          const text = await (res.data as Blob).text();
          let message = 'File request returned JSON instead of the file';
          try {
            const parsed = JSON.parse(text) as { error?: string; message?: string };
            message = parsed.error || parsed.message || message;
          } catch {
            /* keep default */
          }
          throw new Error(message);
        }
        const objectUrl = URL.createObjectURL(res.data);
        blobRef.current = objectUrl;
        setUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(await errorMessageFromUnknown(err));
          setUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [fileId]);

  return { url, error, loading };
}
