/**
 * MessagePage — SMS sent, scheduled, and received (Twilio).
 * Route: /messages
 * APIs: /twilio/messages, /twilio/send-sms
 * Docs: ../../../docs/PAGES.md#messagepagetsx
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import { Refresh as RefreshIcon, Schedule as ScheduleIcon, Sms as SmsIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import api from '../utils/axios';
import { formatPhoneForDisplay } from '../utils/phoneFormat';
import {
  fetchSmsDetail,
  fetchSmsLists,
  markSmsRead,
  scheduleSmsAdhoc,
  type SmsDetail,
  type SmsLists,
  type SmsRecordType,
  type SmsRow,
} from '../utils/twilioApi';

const EMPTY_LISTS: SmsLists = { scheduled: [], sent: [], received: [] };

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleAtValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  return toDatetimeLocalValue(d);
}

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

function rowRecordType(row: SmsRow, tab: 'sent' | 'scheduled' | 'received'): SmsRecordType {
  if (row.recordType) return row.recordType;
  return tab === 'scheduled' ? 'scheduled' : 'message';
}

function statusChip(status: string) {
  const normalized = String(status || '').toLowerCase();
  let color: 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info' = 'default';
  if (normalized === 'scheduled') color = 'primary';
  else if (normalized === 'delivered' || normalized === 'sent' || normalized === 'read') color = 'success';
  else if (normalized === 'received') color = 'success';
  else if (normalized === 'failed' || normalized === 'undelivered') color = 'error';
  else if (normalized === 'cancelled') color = 'warning';
  else if (normalized === 'unread') color = 'info';
  else if (normalized === 'queued' || normalized === 'sending') color = 'default';
  const label =
    normalized === 'undelivered'
      ? 'Undelivered'
      : normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return <Chip label={label} size="small" color={color} sx={{ textTransform: 'capitalize' }} />;
}

function ReceiptTimeline({ detail }: { detail: SmsDetail }) {
  const items: { label: string; at: string | null | undefined }[] = [];

  if (detail.kind === 'scheduled' && detail.status === 'scheduled') {
    items.push({ label: 'Scheduled to send', at: detail.sendAt });
  } else {
    if (detail.sentAt) items.push({ label: 'Sent', at: detail.sentAt });
    if (detail.deliveredAt) items.push({ label: 'Delivered to handset', at: detail.deliveredAt });
    if (detail.readAt) items.push({ label: 'Read in app', at: detail.readAt });
    if (detail.statusUpdatedAt && !detail.deliveredAt && !detail.readAt) {
      items.push({ label: 'Status updated', at: detail.statusUpdatedAt });
    }
  }

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No delivery timestamps yet.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {items.map((item) => (
        <Box key={item.label}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {item.label}
          </Typography>
          <Typography variant="body2">{formatWhen(item.at)}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function MessageDetailDialog({
  open,
  detail,
  loading,
  onClose,
}: {
  open: boolean;
  detail: SmsDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const isReceived = detail?.direction === 'inbound';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isReceived ? 'Received message' : 'Message details'}</DialogTitle>
      <DialogContent dividers>
        {loading || !detail ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              {statusChip(detail.status)}
              {detail.deliveryStatus && detail.deliveryStatus !== detail.status && (
                <Chip
                  label={`Carrier: ${detail.deliveryStatus}`}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                {isReceived ? 'From' : 'To'}
              </Typography>
              <Typography variant="body1">
                {isReceived ? formatPhone(detail.from) : formatPhone(detail.to)}
              </Typography>
            </Box>

            {!isReceived && detail.from && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  From (your number)
                </Typography>
                <Typography variant="body1">{formatPhone(detail.from)}</Typography>
              </Box>
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Message
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {detail.fullBody || detail.body || '—'}
                </Typography>
              </Paper>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Delivery & read status
              </Typography>
              <ReceiptTimeline detail={detail} />
              {(detail.errorMessage || detail.lastError) && (
                <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                  {detail.errorMessage || detail.lastError}
                </Typography>
              )}
            </Box>

            <Typography variant="caption" color="text.secondary">
              {detail.receiptsNote}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function MessageTable({
  rows,
  tab,
  loading,
  onOpenRow,
}: {
  rows: SmsRow[];
  tab: 'sent' | 'scheduled' | 'received';
  loading: boolean;
  onOpenRow: (row: SmsRow) => void;
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
            <TableRow
              key={`${rowRecordType(row, tab)}-${row.id}`}
              hover
              onClick={() => onOpenRow(row)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {tab === 'received' ? formatPhone(row.from) : formatPhone(row.to)}
              </TableCell>
              <TableCell sx={{ maxWidth: 360 }}>
                <Typography variant="body2" noWrap>
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
  const [sendAtLocal, setSendAtLocal] = useState(defaultScheduleAtValue);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [tab, setTab] = useState(0);
  const [lists, setLists] = useState<SmsLists>(EMPTY_LISTS);
  const [loadingLists, setLoadingLists] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<SmsDetail | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoadingLists(true);
    try {
      setLists(await fetchSmsLists());
    } catch (error) {
      console.error(error);
      let msg = isAxiosError(error)
        ? error.response?.data?.error || error.message || 'Failed to load messages'
        : error instanceof Error
          ? error.message
          : 'Failed to load messages';
      if (isAxiosError(error) && error.response?.status === 404) {
        msg =
          'Messages API is not available on the server yet. Deploy or restart the backend with the latest code.';
      }
      toast.error(msg);
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  const handleOpenMessage = async (row: SmsRow, tabKey: 'sent' | 'scheduled' | 'received') => {
    const recordType = rowRecordType(row, tabKey);
    setDetailOpen(true);
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      const detail = await fetchSmsDetail(recordType, row.id);
      if (tabKey === 'received' && detail.canMarkRead) {
        const updated = await markSmsRead(row.id);
        setSelectedDetail(updated);
        void fetchMessages();
      } else {
        setSelectedDetail(detail);
      }
    } catch (error) {
      console.error(error);
      const msg = isAxiosError(error)
        ? error.response?.data?.error || error.message || 'Failed to load message'
        : error instanceof Error
          ? error.message
          : 'Failed to load message';
      toast.error(msg);
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setSelectedDetail(null);
  };

  const busy = sending || scheduling;
  const minScheduleAt = toDatetimeLocalValue(new Date());

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

  const handleSchedule = async () => {
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
    if (!sendAtLocal) {
      toast.error('Choose a send date and time');
      return;
    }
    const sendAt = new Date(sendAtLocal);
    if (Number.isNaN(sendAt.getTime())) {
      toast.error('Invalid send date and time');
      return;
    }
    if (sendAt.getTime() <= Date.now()) {
      toast.error('Send time must be in the future');
      return;
    }

    setScheduling(true);
    try {
      await scheduleSmsAdhoc({ to, message, sendAt: sendAt.toISOString() });
      toast.success(`SMS scheduled for ${format(sendAt, 'MMM d, yyyy h:mm a')}`);
      setBody('');
      setSendAtLocal(defaultScheduleAtValue());
      setScheduleMode(false);
      setTab(0);
      await fetchMessages();
    } catch (error) {
      console.error(error);
      const msg = isAxiosError(error)
        ? error.response?.data?.error || error.message || 'Failed to schedule'
        : error instanceof Error
          ? error.message
          : 'Failed to schedule';
      toast.error(msg);
    } finally {
      setScheduling(false);
    }
  };

  const canSend = toDisplay.trim() && body.trim() && !busy;
  const canSchedule = scheduleMode ? canSend && Boolean(sendAtLocal) && !busy : canSend;

  const handleScheduleClick = () => {
    if (!scheduleMode) {
      setScheduleMode(true);
      return;
    }
    void handleSchedule();
  };

  const handleCancelSchedule = () => {
    setScheduleMode(false);
    setSendAtLocal(defaultScheduleAtValue());
  };

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
        Send or schedule SMS from your Twilio number. Tap a message to open it and view delivery status.
      </Typography>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            label="Phone number"
            fullWidth
            value={toDisplay}
            onChange={(e) => setToDisplay(e.target.value)}
            disabled={busy}
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
            disabled={busy}
            inputProps={{ maxLength: 1500 }}
            placeholder="Your message"
            helperText={`${body.length} / 1500 characters`}
            sx={{ mb: 2 }}
          />
          {scheduleMode && (
            <TextField
              label="Send at"
              type="datetime-local"
              fullWidth
              value={sendAtLocal}
              onChange={(e) => setSendAtLocal(e.target.value)}
              disabled={busy}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: minScheduleAt }}
              helperText="Must be in the future"
              sx={{ mb: 2 }}
              autoFocus
            />
          )}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
            {scheduleMode && (
              <Button variant="text" onClick={handleCancelSchedule} disabled={busy}>
                Cancel
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={scheduling ? <CircularProgress size={18} /> : <ScheduleIcon />}
              onClick={handleScheduleClick}
              disabled={!canSchedule}
            >
              {scheduleMode ? 'Confirm schedule' : 'Schedule SMS'}
            </Button>
            <Button
              variant="contained"
              startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SmsIcon />}
              onClick={() => void handleSend()}
              disabled={!canSend}
            >
              Send now
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

      <MessageTable
        rows={activeRows}
        tab={activeKey}
        loading={loadingLists}
        onOpenRow={(row) => void handleOpenMessage(row, activeKey)}
      />

      <MessageDetailDialog
        open={detailOpen}
        detail={selectedDetail}
        loading={detailLoading}
        onClose={handleCloseDetail}
      />
    </Container>
  );
}

export default MessagePage;
