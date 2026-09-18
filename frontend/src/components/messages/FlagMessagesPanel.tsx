import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
  fetchPipelineSmsTemplates,
  PIPELINE_SMS_STAGES,
  savePipelineSmsTemplates,
  stageLabel,
  type PipelineSmsTemplate,
} from '../../utils/pipelineSmsTemplates';

const EXAMPLE_BODIES: Record<string, string> = {
  CONTRACT_OUT:
    'Hello {{firstName}}, I wanted to give you a heads up that your contract has been sent out. You should be expecting it from {{sender}}.',
  CONTRACT_SIGNED:
    'Hello {{firstName}}, I wanted to give you a heads up that your contract has been sent out. You should be expecting it from {{sender}}.',
  DEPOSIT_PENDING:
    'Hello {{firstName}}, thank you for signing. Your deposit is next — reply if you have any questions.',
  FINAL_PAYMENT_CLOSED:
    'Thank you for using {{company}}. We would love it if you left us a Yelp review: ',
};

function exampleBodyForStage(stage: string) {
  return EXAMPLE_BODIES[stage] || 'Hello {{firstName}}, ';
}

function emptyDraft(stage = 'CONTRACT_OUT'): PipelineSmsTemplate {
  return { stage, name: '', body: exampleBodyForStage(stage), enabled: true };
}

export default function FlagMessagesPanel() {
  const { isAdmin } = useAuth();
  const canEdit = isAdmin();
  const [templates, setTemplates] = useState<PipelineSmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<PipelineSmsTemplate>(emptyDraft());

  const usedStages = useMemo(() => new Set(templates.map((row) => row.stage)), [templates]);

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await fetchPipelineSmsTemplates());
    } catch (error) {
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to load flag messages' : 'Failed to load flag messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const persist = async (next: PipelineSmsTemplate[]) => {
    setSaving(true);
    try {
      setTemplates(await savePipelineSmsTemplates(next));
      toast.success('Flag messages saved');
    } catch (error) {
      toast.error(isAxiosError(error) ? error.response?.data?.error || 'Failed to save' : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    const free = PIPELINE_SMS_STAGES.find((stage) => !usedStages.has(stage)) || 'CONTRACT_OUT';
    setEditingIndex(null);
    setDraft(emptyDraft(free));
    setDialogOpen(true);
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setDraft({ ...templates[index] });
    setDialogOpen(true);
  };

  const saveDraft = async () => {
    if (!draft.body.trim()) {
      toast.error('Enter a message');
      return;
    }
    const row = { ...draft, body: draft.body.trim(), name: draft.name.trim() };
    const next = [...templates];
    if (editingIndex == null) {
      const existing = next.findIndex((item) => item.stage === row.stage);
      if (existing >= 0) next[existing] = { ...next[existing], ...row };
      else next.push(row);
    } else {
      next[editingIndex] = { ...next[editingIndex], ...row };
    }
    await persist(next);
    setDialogOpen(false);
  };

  const removeAt = async (index: number) => {
    const row = templates[index];
    if (!window.confirm(`Delete the ${stageLabel(row.stage)} flag message?`)) return;
    await persist(templates.filter((_, i) => i !== index));
  };

  const toggleEnabled = async (index: number, enabled: boolean) => {
    const next = templates.map((row, i) => (i === index ? { ...row, enabled } : row));
    await persist(next);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
          These texts appear when you drag a job onto that pipeline column. You still have to approve send,
          then confirm. Use {'{{firstName}}'}, {'{{customer}}'}, {'{{sender}}'}, and {'{{company}}'} as blanks.
        </Typography>
        {canEdit ? (
          <Button startIcon={<AddIcon />} variant="contained" onClick={openNew} sx={{ textTransform: 'none' }}>
            Add flag message
          </Button>
        ) : null}
      </Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Pipeline stage</TableCell>
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
                    No flag messages yet. Add one for Contract Out, Signed / Deposit Pending, or Final Payment Closed.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              templates.map((row, index) => (
                <TableRow key={row.id || row.stage} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{stageLabel(row.stage)}</TableCell>
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
        <DialogTitle>{editingIndex == null ? 'Add flag message' : 'Edit flag message'}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
            <InputLabel>Pipeline stage</InputLabel>
            <Select
              label="Pipeline stage"
              value={draft.stage}
              onChange={(e) => {
                const stage = String(e.target.value);
                setDraft((prev) => {
                  const wasExample = Object.values(EXAMPLE_BODIES).includes(prev.body) || prev.body === 'Hello {{firstName}}, ';
                  return {
                    ...prev,
                    stage,
                    body: wasExample ? exampleBodyForStage(stage) : prev.body,
                  };
                });
              }}
            >
              {PIPELINE_SMS_STAGES.map((stage) => (
                <MenuItem key={stage} value={stage} disabled={usedStages.has(stage) && draft.stage !== stage}>
                  {stageLabel(stage)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Message"
            value={draft.body}
            onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
            fullWidth
            multiline
            minRows={5}
            inputProps={{ maxLength: 1500 }}
            helperText="Blanks: {{firstName}} {{customer}} {{sender}} {{company}}. Paste your Yelp link in the text."
          />
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Switch
                checked={draft.enabled !== false}
                onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
            }
            label="Prompt when a job is moved to this stage"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveDraft()} disabled={saving || !draft.body.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
