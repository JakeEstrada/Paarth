/**
 * PdfViewerPage — Full-page PDF file viewer.
 * Route: /pdf/:fileId
 * API: GET /files/:id
 * Docs: ../../../docs/PAGES.md#pdfviewerpagetsx
 */
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthenticatedFileUrl } from '../hooks/useAuthenticatedFileUrl';

export default function PdfViewerPage() {
  const { fileId } = useParams();
  const navigate = useNavigate();
  const { url, error, loading } = useAuthenticatedFileUrl(fileId);

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

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {!loading && error && (
        <Typography color="error" sx={{ p: 3 }}>
          {error}
        </Typography>
      )}
      {!loading && url && (
        <Box
          component="iframe"
          title="PDF Document"
          src={url}
          sx={{ width: '100%', height: 'calc(100vh - 49px)', border: 0 }}
        />
      )}
    </Box>
  );
}
