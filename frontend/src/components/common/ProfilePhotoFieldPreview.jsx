import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import api from '../../utils/axios';

/** Authenticated preview of one stored profile field: default | light | dark */
export default function ProfilePhotoFieldPreview({ variant, revision, sx, emptyLabel }) {
  const [url, setUrl] = useState(null);
  const blobRef = useRef(null);

  useEffect(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setUrl(null);

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/auth/profile-photo/raw/${variant}`, { responseType: 'blob' });
        if (cancelled) return;
        const u = URL.createObjectURL(res.data);
        blobRef.current = u;
        setUrl(u);
      } catch {
        /* 404 — no image for this slot */
      }
    })();

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [variant, revision]);

  if (!url) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'action.hover',
          ...sx,
        }}
      >
        <Typography variant="caption" color="text.secondary" align="center" sx={{ px: 1 }}>
          {emptyLabel}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={url}
      alt=""
      sx={{
        objectFit: 'cover',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        ...sx,
      }}
    />
  );
}
