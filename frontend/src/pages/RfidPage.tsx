/**
 * RfidPage — Live RFID scan log from shop devices.
 * Route: /rfid
 * APIs: GET /rfid/scans, Socket.IO rfid.scan.created
 * Docs: ../../../docs/PAGES.md#rfidpagetsx
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { DeleteOutline as DeleteIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import api from '../utils/axios';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { useSocketConnectionStatus, useSocketSubscription } from '../hooks/useSocketSubscription';

interface RfidTagRow {
  _id: string;
  uid: string;
  displayName: string;
  notes?: string;
}

interface RfidPinRow {
  _id: string;
  pin: string;
  displayName: string;
  notes?: string;
}

interface RfidScanRow {
  _id: string;
  uid: string;
  pin?: string;
  displayName: string;
  scannedAt: string;
  source?: string;
  deviceLabel?: string;
}

const SCAN_LIST_LIMIT = 200;

function normalizeTenantRoomId(raw: unknown): string | null {
  const value =
    typeof raw === 'object' && raw !== null && '_id' in raw
      ? String((raw as { _id: unknown })._id)
      : String(raw || '').trim();
  if (!/^[a-fA-F0-9]{24}$/.test(value)) return null;
  return value;
}

function RfidPage() {
  const { tenantIdForBranding } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<RfidTagRow[]>([]);
  const [pins, setPins] = useState<RfidPinRow[]>([]);
  const [scans, setScans] = useState<RfidScanRow[]>([]);
  const [tagUid, setTagUid] = useState('');
  const [tagName, setTagName] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [pinName, setPinName] = useState('');
  const [savingTag, setSavingTag] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [recentScanIds, setRecentScanIds] = useState<Set<string>>(() => new Set());
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const tenantId = normalizeTenantRoomId(tenantIdForBranding);
  const tenantRoom = tenantId ? `tenant:${tenantId}` : null;
  const socketConnected = useSocketConnectionStatus();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tagsRes, pinsRes, scansRes] = await Promise.all([
        api.get<{ tags: RfidTagRow[] }>('/rfid/tags'),
        api.get<{ pins: RfidPinRow[] }>('/rfid/pins'),
        api.get<{ scans: RfidScanRow[] }>('/rfid/scans', { params: { limit: SCAN_LIST_LIMIT } }),
      ]);
      setTags(tagsRes.data.tags || []);
      setPins(pinsRes.data.pins || []);
      setScans(scansRes.data.scans || []);
    } catch (error) {
      console.error(error);
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to load RFID data' : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      highlightTimersRef.current.forEach((timer) => clearTimeout(timer));
      highlightTimersRef.current.clear();
    };
  }, []);

  const handleRealtimeScan = useCallback((payload: { scan?: RfidScanRow }) => {
    const incoming = payload?.scan;
    if (!incoming?._id) return;

    setScans((prev) => {
      const id = String(incoming._id);
      if (prev.some((s) => String(s._id) === id)) return prev;
      const scannedAt =
        typeof incoming.scannedAt === 'string'
          ? incoming.scannedAt
          : new Date(incoming.scannedAt).toISOString();
      return [{ ...incoming, scannedAt }, ...prev].slice(0, SCAN_LIST_LIMIT);
    });

    const id = String(incoming._id);
    setRecentScanIds((prev) => new Set(prev).add(id));
    const existingTimer = highlightTimersRef.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    highlightTimersRef.current.set(
      id,
      setTimeout(() => {
        setRecentScanIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        highlightTimersRef.current.delete(id);
      }, 4000),
    );
  }, []);

  const handleRealtimeTagUpsert = useCallback((payload: { tag?: RfidTagRow }) => {
    const incoming = payload?.tag;
    if (!incoming?._id || !incoming.uid) return;

    setTags((prev) => {
      const id = String(incoming._id);
      const idx = prev.findIndex((t) => String(t._id) === id);
      if (idx === -1) {
        return [...prev, incoming].sort((a, b) => a.displayName.localeCompare(b.displayName));
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...incoming };
      return next.sort((a, b) => a.displayName.localeCompare(b.displayName));
    });
  }, []);

  const handleRealtimeTagDeleted = useCallback((payload: { tagId?: string }) => {
    const tagId = String(payload?.tagId || '').trim();
    if (!tagId) return;
    setTags((prev) => prev.filter((t) => String(t._id) !== tagId));
  }, []);

  const handleRealtimePinUpsert = useCallback((payload: { pinEntry?: RfidPinRow }) => {
    const incoming = payload?.pinEntry;
    if (!incoming?._id || !incoming.pin) return;

    setPins((prev) => {
      const id = String(incoming._id);
      const idx = prev.findIndex((p) => String(p._id) === id);
      if (idx === -1) {
        return [...prev, incoming].sort((a, b) => a.displayName.localeCompare(b.displayName));
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...incoming };
      return next.sort((a, b) => a.displayName.localeCompare(b.displayName));
    });
  }, []);

  const handleRealtimePinDeleted = useCallback((payload: { pinId?: string }) => {
    const pinId = String(payload?.pinId || '').trim();
    if (!pinId) return;
    setPins((prev) => prev.filter((p) => String(p._id) !== pinId));
  }, []);

  useSocketSubscription(tenantRoom, 'rfid.scan.created', handleRealtimeScan);
  useSocketSubscription(tenantRoom, 'rfid.tag.upserted', handleRealtimeTagUpsert);
  useSocketSubscription(tenantRoom, 'rfid.tag.deleted', handleRealtimeTagDeleted);
  useSocketSubscription(tenantRoom, 'rfid.pin.upserted', handleRealtimePinUpsert);
  useSocketSubscription(tenantRoom, 'rfid.pin.deleted', handleRealtimePinDeleted);

  const liveLabel = useMemo(() => {
    if (!tenantRoom) return 'Offline';
    return socketConnected ? 'Live' : 'Connecting…';
  }, [tenantRoom, socketConnected]);

  const liveColor = tenantRoom && socketConnected ? 'success.main' : 'warning.main';

  const handleSaveTag = async () => {
    const uid = tagUid.trim();
    const displayName = tagName.trim();
    if (!uid || !displayName) {
      toast.error('UID and name are required');
      return;
    }
    setSavingTag(true);
    try {
      await api.post('/rfid/tags', { uid, displayName });
      toast.success('Tag saved');
      setTagUid('');
      setTagName('');
      await load();
    } catch (error) {
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to save tag' : 'Failed to save');
    } finally {
      setSavingTag(false);
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!window.confirm('Remove this tag mapping?')) return;
    try {
      await api.delete(`/rfid/tags/${id}`);
      toast.success('Tag removed');
      await load();
    } catch (error) {
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to delete' : 'Failed to delete');
    }
  };

  const handleSavePin = async () => {
    const pin = pinCode.replace(/\D/g, '').slice(0, 4);
    const displayName = pinName.trim();
    if (pin.length !== 4 || !displayName) {
      toast.error('4-digit PIN and name are required');
      return;
    }
    setSavingPin(true);
    try {
      await api.post('/rfid/pins', { pin, displayName });
      toast.success('PIN saved');
      setPinCode('');
      setPinName('');
      await load();
    } catch (error) {
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to save PIN' : 'Failed to save');
    } finally {
      setSavingPin(false);
    }
  };

  const handleDeletePin = async (id: string) => {
    if (!window.confirm('Remove this PIN mapping?')) return;
    try {
      await api.delete(`/rfid/pins/${id}`);
      toast.success('PIN removed');
      await load();
    } catch (error) {
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to delete' : 'Failed to delete');
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h5" component="h1">
            RFID scans
          </Typography>
          {liveLabel ? (
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: liveColor,
                color: tenantRoom && socketConnected ? 'success.contrastText' : 'warning.contrastText',
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              {liveLabel}
            </Typography>
          ) : null}
        </Box>
        <IconButton onClick={() => void load()} disabled={loading} aria-label="Refresh">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Map each physical tag UID or kiosk PIN to an employee name here. The shop kiosk posts RFID scans or PIN
        check-ins to <code>POST /rfid/scans</code> with <code>x-rfid-api-key</code> and <code>x-tenant-id</code>.
      </Alert>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Register tag
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
            <TextField
              label="Tag UID"
              size="small"
              value={tagUid}
              onChange={(e) => setTagUid(e.target.value)}
              placeholder="142-1-4-200-91"
              sx={{ minWidth: 220 }}
            />
            <TextField
              label="Name"
              size="small"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Jake"
              sx={{ minWidth: 180 }}
            />
            <Button variant="contained" onClick={() => void handleSaveTag()} disabled={savingTag}>
              {savingTag ? <CircularProgress size={22} /> : 'Save mapping'}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Scan once on the Pi and copy the UID from its console, or from the scan log below if it already logged as
            Unknown.
          </Typography>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Register kiosk PIN
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
            <TextField
              label="4-digit PIN"
              size="small"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="1234"
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4 }}
              sx={{ minWidth: 140 }}
            />
            <TextField
              label="Name"
              size="small"
              value={pinName}
              onChange={(e) => setPinName(e.target.value)}
              placeholder="Jake"
              sx={{ minWidth: 180 }}
            />
            <Button variant="contained" onClick={() => void handleSavePin()} disabled={savingPin}>
              {savingPin ? <CircularProgress size={22} /> : 'Save PIN'}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Used when RFID is unavailable. Employees tap the kiosk logo and enter this PIN.
          </Typography>
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Tag registry ({tags.length})
          </Typography>
          <Card variant="outlined" sx={{ mb: 3, overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>UID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell width={56} />
                </TableRow>
              </TableHead>
              <TableBody>
                {tags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography variant="body2" color="text.secondary">
                        No tags registered yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  tags.map((t) => (
                    <TableRow key={t._id}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{t.uid}</TableCell>
                      <TableCell>{t.displayName}</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => void handleDeleteTag(t._id)} aria-label="Delete tag">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            PIN registry ({pins.length})
          </Typography>
          <Card variant="outlined" sx={{ mb: 3, overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>PIN</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell width={56} />
                </TableRow>
              </TableHead>
              <TableBody>
                {pins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography variant="body2" color="text.secondary">
                        No PINs registered yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  pins.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{p.pin}</TableCell>
                      <TableCell>{p.displayName}</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => void handleDeletePin(p._id)} aria-label="Delete PIN">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Recent scans ({scans.length})
          </Typography>
          <Card variant="outlined" sx={{ overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>UID / PIN</TableCell>
                  <TableCell>Source</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary">
                        No scans yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  scans.map((s) => (
                    <TableRow
                      key={s._id}
                      sx={
                        recentScanIds.has(String(s._id))
                          ? {
                              bgcolor: 'action.selected',
                              transition: 'background-color 0.4s ease',
                            }
                          : undefined
                      }
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {format(new Date(s.scannedAt), 'MMM d, yyyy h:mm:ss a')}
                      </TableCell>
                      <TableCell>{s.displayName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {s.pin ? `PIN ${s.pin}` : s.uid}
                      </TableCell>
                      <TableCell>
                        {[s.deviceLabel, s.source].filter(Boolean).join(' · ') || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </Container>
  );
}

export default RfidPage;
