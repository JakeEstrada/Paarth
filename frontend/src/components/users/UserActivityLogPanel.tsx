import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
  useTheme,
} from '@mui/material';
import axios from 'axios';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type AuditUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
};

type AuditEvent = {
  id: string;
  type: 'login' | 'logout' | 'page_view' | 'click';
  label: string;
  path: string;
  detail?: string;
  occurredAt: string;
  user: AuditUser | null;
};

type DirectoryUser = {
  _id: string;
  name: string;
  email: string;
};

const TYPE_FILTERS = [
  { value: '', label: 'All activity' },
  { value: 'login', label: 'Sign in' },
  { value: 'logout', label: 'Sign out' },
  { value: 'page_view', label: 'Pages opened' },
  { value: 'click', label: 'Clicks' },
];

function typeChipColor(type: AuditEvent['type']): 'success' | 'default' | 'info' | 'primary' {
  if (type === 'login') return 'success';
  if (type === 'logout') return 'default';
  if (type === 'page_view') return 'info';
  return 'primary';
}

function typeChipLabel(type: AuditEvent['type']): string {
  if (type === 'login') return 'Sign in';
  if (type === 'logout') return 'Sign out';
  if (type === 'page_view') return 'Page';
  return 'Click';
}

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy h:mm:ss a');
}

export default function UserActivityLogPanel({
  users,
  selectedUserId,
  onSelectedUserIdChange,
}: {
  users: DirectoryUser[];
  selectedUserId: string;
  onSelectedUserIdChange: (userId: string) => void;
}) {
  const theme = useTheme();
  const [typeFilter, setTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadEvents = useCallback(
    async (append = false, before?: string) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params: Record<string, string | number> = { limit: 100 };
        if (selectedUserId) params.userId = selectedUserId;
        if (typeFilter) params.type = typeFilter;
        if (fromDate) params.from = `${fromDate}T00:00:00`;
        if (before) params.before = before;
        const { data } = await axios.get(`${API_URL}/audit-logs`, { params });
        const next = Array.isArray(data?.events) ? (data.events as AuditEvent[]) : [];
        setEvents((prev) => (append ? [...prev, ...next] : next));
        setHasMore(Boolean(data?.hasMore));
      } catch (error) {
        console.error('Failed to load user activity:', error);
        toast.error('Failed to load user activity');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [fromDate, selectedUserId, typeFilter],
  );

  useEffect(() => {
    void loadEvents(false);
  }, [loadEvents]);

  const handleLoadMore = () => {
    const last = events[events.length - 1];
    if (!last?.occurredAt) return;
    void loadEvents(true, last.occurredAt);
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Everything this organization&apos;s users did after signing in — sign-in time, pages they opened,
        and what they clicked, each with a timestamp.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>User</InputLabel>
          <Select
            label="User"
            value={selectedUserId}
            onChange={(e) => onSelectedUserIdChange(String(e.target.value))}
          >
            <MenuItem value="">All users</MenuItem>
            {users.map((user) => (
              <MenuItem key={user._id} value={user._id}>
                {user.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Type</InputLabel>
          <Select
            label="Type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(String(e.target.value))}
          >
            {TYPE_FILTERS.map((option) => (
              <MenuItem key={option.value || 'all'} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          type="date"
          label="From date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 170 }}
        />
        <Button size="small" onClick={() => void loadEvents(false)} sx={{ textTransform: 'none' }}>
          Refresh
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 320px)' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow
              sx={{ backgroundColor: theme.palette.mode === 'dark' ? '#2A2A2A' : '#f5f5f5' }}
            >
              <TableCell sx={{ fontWeight: 700, minWidth: 190 }}>Timestamp</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 140 }}>User</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 110 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>What they did</TableCell>
              <TableCell sx={{ fontWeight: 700, minWidth: 160 }}>Page</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">
                    No activity yet. Entries appear after someone signs in and uses the app.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.id} hover>
                  <TableCell sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {formatStamp(event.occurredAt)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {event.user?.name || 'Unknown'}
                    </Typography>
                    {event.user?.email ? (
                      <Typography variant="caption" color="text.secondary">
                        {event.user.email}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={typeChipLabel(event.type)} color={typeChipColor(event.type)} />
                  </TableCell>
                  <TableCell>{event.label}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {event.path || '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {hasMore ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button
            variant="outlined"
            onClick={handleLoadMore}
            disabled={loadingMore}
            sx={{ textTransform: 'none' }}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
