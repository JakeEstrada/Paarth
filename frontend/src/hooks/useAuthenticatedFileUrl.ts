import { useEffect, useRef, useState } from 'react';
import api from '../utils/axios';

/**
 * Fetches a job/task file with auth + tenant headers and returns a blob object URL.
 * Bare <img src="/files/:id"> cannot send those headers, so previews look empty
 * even when the file record exists in Mongo (and even when S3 itself is fine).
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
          throw new Error('File request returned JSON instead of the file');
        }
        const objectUrl = URL.createObjectURL(res.data);
        blobRef.current = objectUrl;
        setUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
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
