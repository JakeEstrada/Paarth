import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Paper,
} from '@mui/material';
import { Refresh as RefreshIcon, Sms as SmsIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import api from '../utils/axios';
import { formatPhoneForDisplay } from '../utils/phoneFormat';

type SmsRow = {
  id: string;
  kind: string;
  to: string | null;
  from: string | null;
  body: string;
  status: string;
  sendAt: string | null;
  sentAt: string | null;
  createdAt: string;
  lastError: string | null;
};

type SmsLists = {
  scheduled: SmsRow[];
  sent: SmsRow[];
  received: SmsRow[];
};

const EMPTY_LISTS: SmsLists = { scheduled: [], sent: [], received: [] };

function formatWhen(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'MMM d, yyyy h:mm a');
}

function formatPhone(value: string | null | undefined) {
  if (!value) return '—';
  return formatPhoneForDisplay(value) || value;
}

function statusChip(status: string) {
  const normalized = String(status || '').toLowerCase();
  let color: 'default' | 'primary' | 'success' | 'error' | 'warning' = 'default';
  if (normalized === 'scheduled') color = 'primary';
  else if (normalized === 'sent' || normalized === 'received') color = 'success';
  else if (normalized === 'failed') color = 'error';
  else if (normalized === 'cancelled') color = 'warning';
  return <Chip label={status} size="small" color={color} sx={{ textTransform: 'capitalize' }} />;
}

function MessageTable({
  rows,
  tab,
  loading,
}: {
  rows: SmsRow[];
  tab: 'sent' | 'scheduled' | 'received';
  loading: boolean;
}) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (rows.length === 0) {
    const emptyCopy =
      tab === 'scheduled'
        ? 'No scheduled messages.'
        : tab === 'received'
          ? 'No received messages yet.'
          : 'No sent messages yet.';
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        {emptyCopy}
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {tab === 'received' ? (
              <TableCell>From</TableCell>
            ) : (
              <TableCell>To</TableCell>
            )}
            <TableCell>Message</TableCell>
            <TableCell>{tab === 'scheduled' ? 'Send at' : 'When'}</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {tab === 'received' ? formatPhone(row.from) : formatPhone(row.to)}
              </TableCell>
              <TableCell sx={{ maxWidth: 360 }}>
                <Typography variant="body2" noWrap title={row.body}>
                  {row.body || '—'}
                </Typography>
                {row.lastError && (
                  <Typography variant="caption" color="error">
                    {row.lastError}
                  </Typography>
                )}
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {tab === 'scheduled' ? formatWhen(row.sendAt) : formatWhen(row.sentAt || row.createdAt)}
              </TableCell>
              <TableCell>{statusChip(row.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function MessagePage() {
  const [toDisplay, setToDisplay] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState(0);
  const [lists, setLists] = useState<SmsLists>(EMPTY_LISTS);
  const [loadingLists, setLoadingLists] = useState(true);

  const fetchMessages = useCallback(async () => {
    setLoadingLists(true);
    try {
      const { data } = await api.get<SmsLists>('/twilio/messages');
      setLists({
        scheduled: data.scheduled || [],
        sent: data.sent || [],
        received: data.received || [],
      });
    } catch (error) {
      console.error(error);
      const msg = isAxiosError(error)
        ? error.response?.data?.error || error.message || 'Failed to load messages'
        : error instanceof Error
          ? error.message
          : 'Failed to load messages';
      toast.error(msg);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

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
      setTab(1);
      await fetchMessages();
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

  const canSend = toDisplay.trim() && body.trim() && !sending;
  const tabKeys: Array<'scheduled' | 'sent' | 'received'> = ['scheduled', 'sent', 'received'];
  const activeKey = tabKeys[tab] || 'scheduled';
  const activeRows = lists[activeKey];

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SmsIcon color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h5" component="h1">
            Messages
          </Typography>
        </Box>
        <Button
          size="small"
          startIcon={loadingLists ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={() => void fetchMessages()}
          disabled={loadingLists}
        >
          Refresh
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Send SMS from your Twilio number. View scheduled, sent, and received messages below.
      </Typography>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
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
            minRows={4}
            fullWidth
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
            inputProps={{ maxLength: 1500 }}
            placeholder="Your message"
            helperText={`${body.length} / 1500 characters`}
          />
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SmsIcon />}
              onClick={() => void handleSend()}
              disabled={!canSend}
            >
              Send SMS
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label={`Scheduled (${lists.scheduled.length})`} />
          <Tab label={`Sent (${lists.sent.length})`} />
          <Tab label={`Received (${lists.received.length})`} />
        </Tabs>
      </Box>

      <MessageTable rows={activeRows} tab={activeKey} loading={loadingLists} />
    </Container>
  );
}

export default MessagePage;
