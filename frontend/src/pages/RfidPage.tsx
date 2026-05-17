import { useCallback, useEffect, useState } from 'react';
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

interface RfidTagRow {
  _id: string;
  uid: string;
  displayName: string;
  notes?: string;
}

interface RfidScanRow {
  _id: string;
  uid: string;
  displayName: string;
  scannedAt: string;
  source?: string;
  deviceLabel?: string;
}

function RfidPage() {
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<RfidTagRow[]>([]);
  const [scans, setScans] = useState<RfidScanRow[]>([]);
  const [tagUid, setTagUid] = useState('');
  const [tagName, setTagName] = useState('');
  const [savingTag, setSavingTag] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tagsRes, scansRes] = await Promise.all([
        api.get<{ tags: RfidTagRow[] }>('/rfid/tags'),
        api.get<{ scans: RfidScanRow[] }>('/rfid/scans', { params: { limit: 200 } }),
      ]);
      setTags(tagsRes.data.tags || []);
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

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" component="h1">
          RFID scans
        </Typography>
        <IconButton onClick={() => void load()} disabled={loading} aria-label="Refresh">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Map each physical tag UID to a name here. Your Raspberry Pi posts scans to{' '}
        <code>POST /rfid/scans</code> with <code>x-rfid-api-key</code> and <code>x-tenant-id</code>. See{' '}
        <code>scripts/raspberry-pi/rfid_to_paarth.py</code> in the repo.
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
            Recent scans ({scans.length})
          </Typography>
          <Card variant="outlined" sx={{ overflow: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>UID</TableCell>
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
                    <TableRow key={s._id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {format(new Date(s.scannedAt), 'MMM d, yyyy h:mm:ss a')}
                      </TableCell>
                      <TableCell>{s.displayName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{s.uid}</TableCell>
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
