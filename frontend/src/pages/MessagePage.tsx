import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  TextField,
  Typography,
} from '@mui/material';
import { Sms as SmsIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import api from '../utils/axios';

interface MessagePageConfigResponse {
  configured: boolean;
  toLastFour?: string;
}

function MessagePage() {
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [toLastFour, setToLastFour] = useState<string | undefined>();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const { data } = await api.get<MessagePageConfigResponse>('/twilio/message-page-config');
      setConfigured(Boolean(data?.configured));
      setToLastFour(data?.toLastFour);
    } catch (error) {
      console.error(error);
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to load SMS settings' : 'Failed to load SMS settings');
      setConfigured(false);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSend = async () => {
    const message = body.trim();
    if (!message) {
      toast.error('Enter a message');
      return;
    }
    if (!configured) {
      toast.error('Server is not configured for this page yet');
      return;
    }
    setSending(true);
    try {
      await api.post('/twilio/send-sms-message-page', { message });
      toast.success('Message sent');
      setBody('');
    } catch (error) {
      console.error(error);
      const msg = isAxiosError(error)
        ? error.response?.data?.error || 'Failed to send'
        : 'Failed to send';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <SmsIcon color="primary" sx={{ fontSize: 32 }} />
        <Typography variant="h5" component="h1">
          Messages
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Send an SMS from your Twilio number to the destination configured on the server (
        <code>TWILIO_MESSAGE_PAGE_TO</code>). The recipient cannot be changed from this screen.
      </Typography>

      {loadingConfig ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Card variant="outlined">
          <CardContent>
            {!configured ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Add <code>TWILIO_MESSAGE_PAGE_TO</code> to your backend environment (E.164, e.g.{' '}
                <code>+15551234567</code>), redeploy, and refresh. Other Twilio variables must already be set.
              </Alert>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                Sending to the configured number
                {toLastFour ? ` (ends in ${toLastFour})` : ''}.
              </Alert>
            )}
            <TextField
              label="Message"
              multiline
              minRows={5}
              fullWidth
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!configured || sending}
              inputProps={{ maxLength: 1500 }}
              helperText={`${body.length} / 1500 characters`}
            />
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button variant="outlined" onClick={() => void loadConfig()} disabled={sending}>
                Refresh status
              </Button>
              <Button
                variant="contained"
                startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SmsIcon />}
                onClick={() => void handleSend()}
                disabled={!configured || sending || !body.trim()}
              >
                Send SMS
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Container>
  );
}

export default MessagePage;
