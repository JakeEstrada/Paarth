import { Box, Button, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate, useParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function PdfViewerPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();

  const handleClose = () => {
    // If this page was opened in a new tab via window.open, this closes it.
    window.close();

    // Fallback: if browser blocks close, navigate to a safe in-app page.
    window.setTimeout(() => {
      if (!window.closed) {
        navigate('/dashboard', { replace: true });
      }
    }, 150);
  };

  if (!fileId) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">Missing PDF file id.</Typography>
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
          PDF Viewer
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
        component="iframe"
        title="PDF Document"
        src={`${API_URL}/files/${fileId}`}
        sx={{ width: '100%', height: 'calc(100vh - 49px)', border: 0 }}
      />
    </Box>
  );
}
