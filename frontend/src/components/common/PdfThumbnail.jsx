import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import axios from 'axios';
import { Box, CircularProgress } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Renders the first page of a PDF as a canvas thumbnail (uses authenticated download).
 */
export function PdfThumbnail({ fileId, apiUrl, maxWidth = 56, maxHeight = 72 }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;

    (async () => {
      try {
        const res = await axios.get(`${apiUrl}/files/${fileId}/download`, {
          responseType: 'arraybuffer',
        });
        if (cancelled) return;
        const data = new Uint8Array(res.data);
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height);
        const viewport = page.getViewport({ scale });
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
  }, [fileId, apiUrl, maxWidth, maxHeight]);

  if (status === 'error') {
    return (
      <Box
        sx={{
          width: maxWidth,
          height: maxHeight,
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
        width: maxWidth,
        height: maxHeight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'grey.100',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {status === 'loading' && (
        <CircularProgress size={Math.min(22, maxWidth * 0.4)} sx={{ position: 'absolute' }} />
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: status === 'ready' ? 'block' : 'none',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
      />
    </Box>
  );
}

export default PdfThumbnail;
