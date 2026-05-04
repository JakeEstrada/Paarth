import { useEffect, useRef, useState } from 'react';
import api from '../utils/axios';

export function userHasProfilePhoto(user) {
  if (!user) return false;
  const has = (p) => p && (p.path || p.s3Key || p.filename);
  return has(user.profilePhoto) || has(user.profilePhotoLight) || has(user.profilePhotoDark);
}

/**
 * Fetches the current user's theme-resolved profile photo (authenticated).
 * Returns a blob object URL or null; revoked on change/unmount.
 */
export function useAuthenticatedProfilePhotoUrl(user, themeMode) {
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
    const mode = themeMode === 'dark' ? 'dark' : 'light';

    (async () => {
      try {
        const res = await api.get('/auth/profile-photo', {
          params: { mode },
          responseType: 'blob',
        });
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
  }, [user?._id, user?.updatedAt, themeMode]);

  return url;
}
