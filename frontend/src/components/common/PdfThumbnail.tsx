import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Box, CircularProgress } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import api from '../../utils/axios';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Renders the first page of a PDF as a canvas thumbnail (uses authenticated download).
 */
export function PdfThumbnail({ fileId, apiUrl, maxWidth = 56, maxHeight = 72, fill = false }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;

    (async () => {
      try {
        const res = await api.get(`/files/${fileId}`, {
          responseType: 'arraybuffer',
        });
        if (cancelled) return;
        const data = new Uint8Array(res.data);
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const fitScale = fill
          ? Math.max(maxWidth / baseViewport.width, maxHeight / baseViewport.height)
          : Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height);
        const viewport = page.getViewport({ scale: fitScale });
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (!cancelled) setStatus('error');
          return;
        }
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (import.meta.env.DEV) console.warn('PdfThumbnail failed', e);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileId, apiUrl, maxWidth, maxHeight, fill]);

  const sizeSx = fill
    ? { width: '100%', height: '100%', borderRadius: 0, border: 0 }
    : { width: maxWidth, height: maxHeight, borderRadius: 1, border: '1px solid', borderColor: 'divider' };

  if (status === 'error') {
    return (
      <Box
        sx={{
          ...sizeSx,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PictureAsPdfIcon sx={{ color: '#F44336', fontSize: Math.min(maxWidth, 40) }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        ...sizeSx,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        bgcolor: 'grey.100',
      }}
    >
      {status === 'loading' && (
        <CircularProgress size={Math.min(22, maxWidth * 0.4)} sx={{ position: 'absolute' }} />
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: status === 'ready' ? 'block' : 'none',
          width: fill ? '100%' : undefined,
          height: fill ? '100%' : undefined,
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: fill ? 'cover' : 'contain',
        }}
      />
    </Box>
  );
}

export default PdfThumbnail;
