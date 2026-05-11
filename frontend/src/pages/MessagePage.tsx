import { useState } from 'react';
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

function MessagePage() {
  const [toDisplay, setToDisplay] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const message = body.trim();
    const to = toDisplay.trim();
    if (!to) {
      toast.error('Enter a phone number');
      return;
    }
    if (!message) {
      toast.error('Enter a message');
      return;
    }
    setSending(true);
    try {
      await api.post('/twilio/send-sms-adhoc', { to, message });
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
        Send a plain SMS from your Twilio number. Enter any mobile number and message — no customer or job
        required. Use international format with a leading + if outside US/Canada.
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Same Twilio setup as elsewhere in the app. Type any number; use a leading + for countries outside
            US/Canada (e.g. +44…).
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
          <TextField
            label="Message"
            multiline
            minRows={5}
            fullWidth
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
            inputProps={{ maxLength: 1500 }}
            helperText={`${body.length} / 1500 characters`}
          />
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SmsIcon />}
              onClick={() => void handleSend()}
              disabled={sending || !toDisplay.trim() || !body.trim()}
            >
              Send SMS
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

export default MessagePage;
