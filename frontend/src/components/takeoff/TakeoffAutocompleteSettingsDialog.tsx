import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import toast from 'react-hot-toast';
import {
  defaultTakeoffAutocompleteLists,
  saveTakeoffAutocompleteLists,
} from '../../utils/takeoffAutocompleteStorage';

function cloneLists(src) {
  return {
    items: [...(src.items || [])],
    materials: [...(src.materials || [])],
    descriptions: [...(src.descriptions || [])],
  };
}

function ListSection({ label, entries, onChange }) {
  const [newValue, setNewValue] = useState('');
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');

  const addEntry = () => {
    const t = newValue.trim();
    if (!t) return;
    const lower = t.toLowerCase();
    if (entries.some((e) => e.toLowerCase() === lower)) {
      setNewValue('');
      return;
    }
    onChange([...entries, t]);
    setNewValue('');
  };

  const startEdit = (index) => {
    setEditing(index);
    setEditText(entries[index] || '');
  };

  const saveEdit = () => {
    if (editing == null) return;
    const t = editText.trim();
    if (!t) return;
    const lower = t.toLowerCase();
    const dup = entries.some((e, i) => i !== editing && e.toLowerCase() === lower);
    if (dup) return;
    const next = entries.map((e, i) => (i === editing ? t : e));
    onChange(next);
    setEditing(null);
    setEditText('');
  };

  const removeAt = (index) => {
    onChange(entries.filter((_, i) => i !== index));
    if (editing === index) {
      setEditing(null);
      setEditText('');
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          size="small"
          fullWidth
          label="Add entry"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEntry();
            }
          }}
        />
        <Button variant="contained" onClick={addEntry} sx={{ flexShrink: 0 }}>
          Add
        </Button>
      </Box>
      <List dense disablePadding sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        {entries.length === 0 ? (
          <ListItem>
            <Typography variant="body2" color="text.secondary">
              No entries yet.
            </Typography>
          </ListItem>
        ) : (
          entries.map((entry, index) => (
            <ListItem
              key={`${index}-${entry}`}
              secondaryAction={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <IconButton edge="end" size="small" aria-label="Edit" onClick={() => startEdit(index)} disabled={editing !== null}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton edge="end" size="small" aria-label="Delete" onClick={() => removeAt(index)} disabled={editing !== null}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
              sx={{ pr: 14 }}
            >
              {editing === index ? (
                <Box sx={{ display: 'flex', gap: 1, width: '100%', alignItems: 'center' }}>
                  <TextField
                    size="small"
                    fullWidth
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit();
                      }
                    }}
                  />
                  <Button size="small" onClick={saveEdit}>
                    Save
                  </Button>
                  <Button size="small" onClick={() => { setEditing(null); setEditText(''); }}>
                    Cancel
                  </Button>
                </Box>
              ) : (
                <Typography variant="body2">{entry}</Typography>
              )}
            </ListItem>
          ))
        )}
      </List>
    </Box>
  );
}

function TakeoffAutocompleteSettingsDialog({ open, onClose, lists, onListsSaved }) {
  const [tab, setTab] = useState(0);
  const [draft, setDraft] = useState(() => cloneLists(lists));

  useEffect(() => {
    if (open) {
      setDraft(cloneLists(lists));
      setTab(0);
    }
  }, [open, lists]);

  const patchField = (field, entries) => {
    setDraft((prev) => ({ ...prev, [field]: entries }));
  };

  const handleSave = () => {
    const saved = saveTakeoffAutocompleteLists(draft);
    onListsSaved(saved);
    toast.success('Autocomplete lists saved on this browser');
    onClose();
  };

  const handleRestoreDefaults = () => {
    const defs = defaultTakeoffAutocompleteLists();
    setDraft(cloneLists(defs));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Take off autocomplete lists</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Saved on this browser for quick fill in ITEM, MATERIALS, and DESCRIPTION. Press{' '}
          <strong>Tab</strong> in those cells to complete from the list (like a terminal); press Tab again to cycle when
          several entries share the same prefix. If nothing matches, Tab still moves to the next cell.
        </Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tab label="Items" />
          <Tab label="Materials" />
          <Tab label="Descriptions" />
        </Tabs>
        {tab === 0 && (
          <ListSection label="Items suggested when you type in the ITEM column." entries={draft.items} onChange={(e) => patchField('items', e)} />
        )}
        {tab === 1 && (
          <ListSection label="Materials suggested in the MATERIALS column." entries={draft.materials} onChange={(e) => patchField('materials', e)} />
        )}
        {tab === 2 && (
          <ListSection
            label="Descriptions suggested in the DESCRIPTION column."
            entries={draft.descriptions}
            onChange={(e) => patchField('descriptions', e)}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={handleRestoreDefaults} color="inherit">
          Reset to starter lists
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default TakeoffAutocompleteSettingsDialog;
