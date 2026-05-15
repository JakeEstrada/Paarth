import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import { AttachFile as AttachFileIcon, Close as CloseIcon, Sms as SmsIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import api from '../utils/axios';

function MessagePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [toDisplay, setToDisplay] = useState('');
  const [body, setBody] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (attachment?.type.startsWith('image/')) {
      const u = URL.createObjectURL(attachment);
      previewUrlRef.current = u;
      setPreviewUrl(u);
    } else if (attachment) {
      setPreviewUrl(null);
    } else {
      setPreviewUrl(null);
    }

    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [attachment]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files?.length) return;
      const f = [...files].find((x) => x.type.startsWith('image/'));
      if (f) {
        e.preventDefault();
        setAttachment(f);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const clearAttachment = () => setAttachment(null);

  const handleSend = async () => {
    const message = body.trim();
    const to = toDisplay.trim();
    if (!to) {
      toast.error('Enter a phone number');
      return;
    }
    if (!message && !attachment) {
      toast.error('Enter a message or attach an image');
      return;
    }
    setSending(true);
    try {
      let mediaFileId: string | undefined;
      if (attachment) {
        const fd = new FormData();
        fd.append('file', attachment);
        const { data } = await api.post<{ fileId?: string }>('/twilio/mms-upload', fd);
        const id = data?.fileId != null ? String(data.fileId).trim() : '';
        if (!id) throw new Error('Upload did not return a file id');
        mediaFileId = id;
      }

      await api.post('/twilio/send-sms-adhoc', {
        to,
        ...(message ? { message } : {}),
        ...(mediaFileId ? { mediaFileId } : {}),
      });

      toast.success(attachment ? 'Message with image sent' : 'Message sent');
      setBody('');
      clearAttachment();
    } catch (error) {
      console.error(error);
      const msg = isAxiosError(error)
        ? error.response?.data?.error || error.message || 'Failed to send'
        : error instanceof Error
          ? error.message
          : 'Failed to send';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const canSend = toDisplay.trim() && (body.trim() || attachment) && !sending;

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <SmsIcon color="primary" sx={{ fontSize: 32 }} />
        <Typography variant="h5" component="h1">
          Messages
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Send SMS/MMS from your Twilio number. Enter a recipient and message. You can paste a screenshot (
        Ctrl+V) or attach an image. Use a leading + for numbers outside US/Canada.
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            MMS needs a Twilio number and account that support MMS; the API must use a URL Twilio can reach
            (production HTTPS works). Paste or attach images here — they upload briefly, then Twilio pulls
            them from your server when sending.
          </Alert>
          <TextField
            label="Phone number"
            fullWidth
            value={toDisplay}
            onChange={(e) => setToDisplay(e.target.value)}
            disabled={sending}
            placeholder="(858) 999-5544 or +44 20 7946 0958"
            sx={{ mb: 2 }}
            autoComplete="tel"
          />
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Attachment (optional)
            </Typography>
            <Box
              sx={{
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                p: 1.5,
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              <Button
                size="small"
                variant="outlined"
                startIcon={<AttachFileIcon />}
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose image…
              </Button>
              <Typography variant="body2" color="text.secondary">
                or paste image from clipboard anywhere on this page
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept="image/jpeg,image/png,image/gif,image/webp,.pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAttachment(f);
                  e.target.value = '';
                }}
              />
            </Box>
            {attachment && (
              <Box sx={{ mt: 1, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap title={attachment.name}>
                    {attachment.name} ({Math.round(attachment.size / 1024)} KB)
                  </Typography>
                  {previewUrl && (
                    <Box
                      component="img"
                      src={previewUrl}
                      alt="Attachment preview"
                      sx={{ mt: 1, maxHeight: 180, maxWidth: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                    />
                  )}
                </Box>
                <IconButton size="small" aria-label="Remove attachment" disabled={sending} onClick={clearAttachment}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>
          <TextField
            label="Message"
            multiline
            minRows={4}
            fullWidth
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
            inputProps={{ maxLength: 1500 }}
            placeholder={attachment ? 'Optional caption…' : 'Your message'}
            helperText={`${body.length} / 1500 characters`}
          />
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SmsIcon />}
              onClick={() => void handleSend()}
              disabled={!canSend}
            >
              Send{attachment ? ' MMS' : ' SMS'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

export default MessagePage;
