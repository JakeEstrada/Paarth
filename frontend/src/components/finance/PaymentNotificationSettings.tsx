import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Save as SaveIcon, Settings as SettingsIcon, Sms as SmsIcon } from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  fetchPaymentNotificationSettings,
  savePaymentNotificationSettings,
} from '../../utils/paymentNotificationSettingsApi';
import { formatMultilinePhoneTyping, formatPhoneForDisplay } from '../../utils/phoneFormat';

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

function phoneNumbersToText(phoneNumbers) {
  return (phoneNumbers || [])
    .map((phone) => formatPhoneForDisplay(String(phone).replace(/^\+1/, '')) || String(phone))
    .join('\n');
}

function textToPhoneNumbers(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function PaymentNotificationSettings({ canEdit, dialogTrigger = false }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(!dialogTrigger);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [phoneNumbersText, setPhoneNumbersText] = useState('');
  const [recipientOptions, setRecipientOptions] = useState([]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, employeesRes] = await Promise.all([
        fetchPaymentNotificationSettings(),
        axios.get(`${API_URL}/users/employees-for-sms`),
      ]);
      setEnabled(Boolean(settings.enabled));
      setSelectedKeys(recipientsToSelectionKeys(settings.recipients || []));
      setPhoneNumbersText(phoneNumbersToText(settings.phoneNumbers || []));
      const rows = employeesRes.data?.recipients || employeesRes.data?.employees || [];
      setRecipientOptions(rows.map(toRecipientOption));
    } catch (error) {
      console.error('Failed to load payment notification settings:', error);
      const status = error?.response?.status;
      if (status === 404) {
        toast.error('Payment alert settings API not found — redeploy the backend, then try again.');
      } else {
        toast.error('Failed to load payment alert settings');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dialogTrigger && !open) return;
    loadSettings();
  }, [loadSettings, dialogTrigger, open]);

  const selectedOptions = useMemo(
    () => recipientOptions.filter((opt) => selectedKeys.includes(opt.selectionKey)),
    [recipientOptions, selectedKeys],
  );

  const handleSave = async () => {
    const phoneNumbers = textToPhoneNumbers(phoneNumbersText);
    if (enabled && selectedKeys.length === 0 && phoneNumbers.length === 0) {
      toast.error('Add at least one team member or phone number for payment alerts');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        enabled,
        recipients: selectionKeysToRecipients(selectedKeys),
        phoneNumbers,
      };
      const data = await savePaymentNotificationSettings(payload);
      setEnabled(Boolean(data.enabled));
      setSelectedKeys(recipientsToSelectionKeys(data.recipients || []));
      setPhoneNumbersText(phoneNumbersToText(data.phoneNumbers || []));
      toast.success('Payment alert settings saved');
      if (dialogTrigger) setOpen(false);
    } catch (error) {
      console.error('Failed to save payment notification settings:', error);
      const status = error?.response?.status;
      if (status === 404) {
        toast.error('Payment alert settings API not found — redeploy the backend, then try again.');
      } else {
        toast.error(error.response?.data?.error || 'Failed to save payment alert settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <>
      {!dialogTrigger ? (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
          <SmsIcon color="primary" sx={{ mt: 0.25 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Payment text alerts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Automatically text your group when a job payment is marked paid. Each payment shows a
              &ldquo;Text sent&rdquo; flag after alerts go out.
            </Typography>
          </Box>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Automatically text your group when a job payment is marked paid. Each payment shows a
          &ldquo;Text sent&rdquo; flag after alerts go out.
        </Typography>
      )}

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
            label="Team members (optional)"
            placeholder="Search team members..."
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

      <TextField
        fullWidth
        multiline
        minRows={3}
        label="Phone numbers"
        placeholder={'(949) 555-1234\n(949) 555-5678'}
        value={phoneNumbersText}
        onChange={(e) => setPhoneNumbersText(formatMultilinePhoneTyping(e.target.value))}
        disabled={!canEdit}
        helperText="One number per line (or comma-separated). Formats as you type — e.g. 9499393802 becomes (949) 939-3802."
        sx={{ mb: 1.5 }}
      />

      {enabled && selectedOptions.some((row) => !row.hasMobile) && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Some selected team members have no mobile number on file and will not receive texts.
        </Alert>
      )}

      {!dialogTrigger && (
        canEdit ? (
          <Button
            variant="contained"
            size="small"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {saving ? 'Saving…' : 'Save alert settings'}
          </Button>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Only admins can change payment alert settings.
          </Typography>
        )
      )}
    </>
  );

  if (dialogTrigger) {
    return (
      <>
        <Tooltip title="Payment text alert settings">
          <IconButton
            size="small"
            aria-label="Payment text alert settings"
            onClick={() => setOpen(true)}
            sx={{ borderRadius: 2 }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmsIcon color="primary" fontSize="small" />
            Payment text alerts
          </DialogTitle>
          <DialogContent dividers>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              content
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setOpen(false)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            {canEdit ? (
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                onClick={handleSave}
                disabled={saving || loading}
                sx={{ textTransform: 'none', borderRadius: 2 }}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                Only admins can change these settings.
              </Typography>
            )}
          </DialogActions>
        </Dialog>
      </>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
      {content}
    </Paper>
  );
}
