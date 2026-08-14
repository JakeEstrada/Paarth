import { Box, Typography } from '@mui/material';
import { useAuthenticatedFileUrl } from '../../hooks/useAuthenticatedFileUrl';

export default function AuthenticatedFileImage({
  fileId,
  alt = '',
  onClick,
  maxHeight = 200,
  fill = false,
}: {
  fileId: string;
  alt?: string;
  onClick?: () => void;
  maxHeight?: number | string;
  fill?: boolean;
}) {
  const { url, error, loading } = useAuthenticatedFileUrl(fileId);

  const boxSx = fill
    ? {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'action.hover',
      }
    : {
        py: 3,
        px: 1,
        textAlign: 'center' as const,
        bgcolor: 'action.hover',
      };

  if (error || (!loading && !url)) {
    return (
      <Box
        sx={{ ...boxSx, cursor: onClick ? 'pointer' : 'default' }}
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
      <Box sx={boxSx}>
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
        height: fill ? '100%' : 'auto',
        maxHeight: fill ? 'none' : maxHeight,
        objectFit: 'cover',
        cursor: onClick ? 'pointer' : 'default',
        display: 'block',
      }}
    />
  );
}
