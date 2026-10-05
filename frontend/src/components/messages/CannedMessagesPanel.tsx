import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import { useAuth } from '../../context/AuthContext';
import {
  fetchCannedSmsTemplates,
  saveCannedSmsTemplates,
  type CannedSmsTemplate,
} from '../../utils/cannedSmsTemplates';

const DEFAULT_BODY =
  'Hello, reaching out from the {{company}} team. I wanted to let you know that we sent the contract to {{email}}.';

const PLACEHOLDER_HELP =
  'Blanks fill from the job card: {{firstName}} {{customer}} {{email}} {{phone}} {{address}} {{job}} {{company}} {{sender}} {{gateCode}}';

function emptyDraft(): CannedSmsTemplate {
  return { name: '', body: DEFAULT_BODY, enabled: true };
}

export default function CannedMessagesPanel() {
  const { isAdmin } = useAuth();
  const canEdit = isAdmin();
  const [templates, setTemplates] = useState<CannedSmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<CannedSmsTemplate>(emptyDraft());

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await fetchCannedSmsTemplates());
    } catch (error) {
      toast.error(
        isAxiosError(error) ? error.response?.data?.error || 'Failed to load canned messages' : 'Failed to load canned messages',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const persist = async (next: CannedSmsTemplate[]) => {
    setSaving(true);
    try {
      setTemplates(await saveCannedSmsTemplates(next));
      toast.success('Canned messages saved');
    } catch (error) {
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to save' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setEditingIndex(null);
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setDraft({ ...templates[index] });
    setDialogOpen(true);
  };

  const saveDraft = async () => {
    if (!draft.name.trim()) {
      toast.error('Enter a name');
      return;
    }
    if (!draft.body.trim()) {
      toast.error('Enter a message');
      return;
    }
    const row = { ...draft, name: draft.name.trim(), body: draft.body.trim() };
    const next = [...templates];
    if (editingIndex == null) next.push(row);
    else next[editingIndex] = { ...next[editingIndex], ...row };
    await persist(next);
    setDialogOpen(false);
  };

  const removeAt = async (index: number) => {
    const row = templates[index];
    if (!window.confirm(`Delete “${row.name}”?`)) return;
    await persist(templates.filter((_, i) => i !== index));
  };

  const toggleEnabled = async (index: number, enabled: boolean) => {
    const next = templates.map((row, i) => (i === index ? { ...row, enabled } : row));
    await persist(next);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 620 }}>
          These texts appear on the job card message icon. Placeholders fill from the customer, emails,
          phone, address, and job already on that card. {PLACEHOLDER_HELP}
        </Typography>
        {canEdit ? (
          <Button startIcon={<AddIcon />} variant="contained" onClick={openNew} sx={{ textTransform: 'none' }}>
            Add canned message
          </Button>
        ) : null}
      </Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Message</TableCell>
              <TableCell width={110}>On</TableCell>
              {canEdit ? <TableCell width={120} /> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 4 : 3}>
                  <Typography color="text.secondary">Loading…</Typography>
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 4 : 3}>
                  <Typography color="text.secondary">
                    No canned messages yet. Add one such as “Contract sent”.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              templates.map((row, index) => (
                <TableRow key={row.id || `${row.name}-${index}`} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{row.name}</TableCell>
                  <TableCell sx={{ maxWidth: 420 }}>
                    <Typography variant="body2" noWrap title={row.body}>
                      {row.body}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={row.enabled !== false}
                          disabled={!canEdit || saving}
                          onChange={(e) => void toggleEnabled(index, e.target.checked)}
                        />
                      }
                      label={row.enabled !== false ? 'On' : 'Off'}
                    />
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <IconButton size="small" onClick={() => openEdit(index)} aria-label="Edit">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => void removeAt(index)} aria-label="Delete">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingIndex == null ? 'Add canned message' : 'Edit canned message'}</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
            sx={{ mt: 1, mb: 2 }}
            inputProps={{ maxLength: 80 }}
            placeholder="Contract sent"
          />
          <TextField
            label="Message"
            value={draft.body}
            onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
            fullWidth
            multiline
            minRows={5}
            inputProps={{ maxLength: 1500 }}
            helperText={PLACEHOLDER_HELP}
          />
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Switch
                checked={draft.enabled !== false}
                onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
            }
            label="Show on the job card"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void saveDraft()}
            disabled={saving || !draft.name.trim() || !draft.body.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
