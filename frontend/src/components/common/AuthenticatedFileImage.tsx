import { Box, Typography } from '@mui/material';
import { useAuthenticatedFileUrl } from '../../hooks/useAuthenticatedFileUrl';

export default function AuthenticatedFileImage({
  fileId,
  alt = '',
  onClick,
  maxHeight = 200,
}: {
  fileId: string;
  alt?: string;
  onClick?: () => void;
  maxHeight?: number | string;
}) {
  const { url, error, loading } = useAuthenticatedFileUrl(fileId);

  if (error || (!loading && !url)) {
    return (
      <Box
        sx={{
          py: 3,
          px: 1,
          textAlign: 'center',
          bgcolor: 'action.hover',
          cursor: onClick ? 'pointer' : 'default',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Preview unavailable
        </Typography>
      </Box>
    );
  }

  if (!url) {
    return (
      <Box sx={{ py: 4, textAlign: 'center', bgcolor: 'action.hover' }}>
        <Typography variant="caption" color="text.secondary">
          Loading preview…
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={url}
      alt={alt}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      sx={{
        width: '100%',
        height: 'auto',
        maxHeight,
        objectFit: 'cover',
        cursor: onClick ? 'pointer' : 'default',
        display: 'block',
      }}
    />
  );
}
