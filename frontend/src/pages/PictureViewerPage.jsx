import { Box, Button, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function PictureViewerPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();

  const handleClose = () => {
    window.close();

    window.setTimeout(() => {
      if (!window.closed) {
        navigate('/dashboard', { replace: true });
      }
    }, 150);
  };

  if (!fileId) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Missing image file id.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', width: '100vw', bgcolor: 'background.default' }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Picture viewer
        </Typography>
        <Button
          variant="contained"
          color="error"
          size="small"
          startIcon={<CloseIcon />}
          onClick={handleClose}
        >
          Close Tab
        </Button>
      </Stack>

      <Box
        sx={{
          height: 'calc(100vh - 49px)',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          p: 1,
          boxSizing: 'border-box',
        }}
      >
        <Box
          component="img"
          src={`${API_URL}/files/${fileId}`}
          alt=""
          sx={{
            maxWidth: '100%',
            maxHeight: 'calc(100vh - 49px - 16px)',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      </Box>
    </Box>
  );
}
