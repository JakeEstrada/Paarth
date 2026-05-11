import { useEffect, useRef, useState } from 'react';
import api from '../utils/axios';

export function userHasProfilePhoto(user) {
  if (!user) return false;
  const p = user.profilePhoto;
  return !!(p && (p.path || p.s3Key || p.filename));
}

/**
 * Fetches the current user's profile photo (authenticated).
 * Returns a blob object URL or null; revoked on change/unmount.
 */
export function useAuthenticatedProfilePhotoUrl(user) {
  const [url, setUrl] = useState(null);
  const blobRef = useRef(null);

  useEffect(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setUrl(null);

    if (!userHasProfilePhoto(user)) {
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await api.get('/auth/profile-photo', { responseType: 'blob' });
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(res.data);
        blobRef.current = objectUrl;
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [user?._id, user?.updatedAt]);

  return url;
}
