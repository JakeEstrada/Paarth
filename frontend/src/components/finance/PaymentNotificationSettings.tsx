import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Paper,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Save as SaveIcon, Sms as SmsIcon } from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function formatRoleLabel(role) {
  if (!role) return 'No app login';
  return String(role).replace(/_/g, ' ');
}

function toRecipientOption(r) {
  const kind = r.kind === 'contact' ? 'contact' : 'user';
  return {
    kind,
    id: String(r._id),
    name: r.name || 'Unnamed',
    mobile: r.mobile || '',
    hasMobile: Boolean(r.mobile),
    sub: kind === 'contact' ? 'Roster (no login)' : formatRoleLabel(r.role),
    selectionKey: `${kind}:${r._id}`,
  };
}

function selectionKeysToRecipients(keys) {
  return (keys || [])
    .map((key) => {
      const value = String(key || '');
      if (value.startsWith('user:')) {
        return { kind: 'user', id: value.slice(5) };
      }
      if (value.startsWith('contact:')) {
        return { kind: 'contact', id: value.slice(8) };
      }
      return null;
    })
    .filter(Boolean);
}

function recipientsToSelectionKeys(recipients) {
  return (recipients || []).map((row) => `${row.kind}:${row.id}`);
}

export default function PaymentNotificationSettings({ canEdit }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [recipientOptions, setRecipientOptions] = useState([]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, employeesRes] = await Promise.all([
        axios.get(`${API_URL}/tenants/payment-notification-settings`),
        axios.get(`${API_URL}/users/employees-for-sms`),
      ]);
      const settings = settingsRes.data || {};
      setEnabled(Boolean(settings.enabled));
      setSelectedKeys(recipientsToSelectionKeys(settings.recipients || []));
      const rows = employeesRes.data?.recipients || employeesRes.data?.employees || [];
      setRecipientOptions(rows.map(toRecipientOption));
    } catch (error) {
      console.error('Failed to load payment notification settings:', error);
      toast.error('Failed to load payment alert settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const selectedOptions = useMemo(
    () => recipientOptions.filter((opt) => selectedKeys.includes(opt.selectionKey)),
    [recipientOptions, selectedKeys],
  );

  const handleSave = async () => {
    if (enabled && selectedKeys.length === 0) {
      toast.error('Choose at least one person for payment alerts');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        enabled,
        recipients: selectionKeysToRecipients(selectedKeys),
      };
      const { data } = await axios.patch(`${API_URL}/tenants/payment-notification-settings`, payload);
      setEnabled(Boolean(data.enabled));
      setSelectedKeys(recipientsToSelectionKeys(data.recipients || []));
      toast.success('Payment alert settings saved');
    } catch (error) {
      console.error('Failed to save payment notification settings:', error);
      toast.error(error.response?.data?.error || 'Failed to save payment alert settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
        <SmsIcon color="primary" sx={{ mt: 0.25 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Payment text alerts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Automatically text your team when a job payment is marked paid on the payment schedule.
          </Typography>
        </Box>
      </Box>

      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={!canEdit}
          />
        }
        label="Send texts when a payment is marked paid"
        sx={{ mb: 1.5, ml: 0 }}
      />

      <Autocomplete
        multiple
        options={recipientOptions}
        value={selectedOptions}
        onChange={(_, value) => setSelectedKeys(value.map((row) => row.selectionKey))}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(a, b) => a.selectionKey === b.selectionKey}
        disabled={!canEdit}
        filterSelectedOptions
        renderInput={(params) => (
          <TextField
            {...params}
            label="Alert group"
            placeholder="Search team members..."
            helperText="Everyone selected here gets the same text when a new payment is marked paid."
          />
        )}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.selectionKey}>
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {option.name}
                </Typography>
                {!option.hasMobile && (
                  <Chip label="No mobile" size="small" color="warning" sx={{ height: 20 }} />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {option.sub}
                {option.mobile ? ` · ${option.mobile}` : ''}
              </Typography>
            </Box>
          </Box>
        )}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              key={option.selectionKey}
              label={option.name}
              size="small"
              color={option.hasMobile ? 'default' : 'warning'}
            />
          ))
        }
        sx={{ mb: 1.5 }}
      />

      {enabled && selectedOptions.some((row) => !row.hasMobile) && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Some selected people have no mobile number on file and will not receive texts.
        </Alert>
      )}

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Example message: &ldquo;New payment marked paid — Customer · Job — Deposit — Balance due: $0.00&rdquo;
      </Typography>

      {canEdit ? (
        <Button
          variant="contained"
          size="small"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          {saving ? 'Saving…' : 'Save alert group'}
        </Button>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Only admins can change payment alert settings.
        </Typography>
      )}
    </Paper>
  );
}
