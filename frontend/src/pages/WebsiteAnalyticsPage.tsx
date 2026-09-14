/**
 * WebsiteAnalyticsPage — Super-admin Google tag / conversion config for the public site.
 * Route: /developer/analytics
 * APIs: GET /website, PUT /website/analytics
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Container,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const TRIGGERS = [
  { value: 'contact_submit', label: 'Contact form sent' },
  { value: 'contact_open', label: 'Contact form opened' },
  { value: 'page_view', label: 'Every page view' },
];

const EMPTY_CONVERSION = {
  name: 'ads_conversion_Contact_Us_1',
  trigger: 'contact_submit',
  label: 'Contact us',
};

type Conversion = {
  id?: string;
  name: string;
  trigger: string;
  label: string;
};

type AnalyticsForm = {
  enabled: boolean;
  measurementId: string;
  adsId: string;
  conversions: Conversion[];
};

const EMPTY: AnalyticsForm = {
  enabled: false,
  measurementId: '',
  adsId: '',
  conversions: [{ ...EMPTY_CONVERSION }],
};

function WebsiteAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AnalyticsForm>(EMPTY);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${API_URL}/website`);
      const analytics = data?.analytics || {};
      const conversions = Array.isArray(analytics.conversions) && analytics.conversions.length
        ? analytics.conversions
        : [{ ...EMPTY_CONVERSION }];
      setForm({
        enabled: Boolean(analytics.enabled),
        measurementId: analytics.measurementId || '',
        adsId: analytics.adsId || '',
        conversions,
      });
    } catch (error) {
      console.error('Error loading website analytics:', error);
      toast.error('Failed to load website analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (form.enabled && !/\b(?:G|GT|AW|DC)-[A-Z0-9]+\b/i.test(form.measurementId)) {
      toast.error('Paste a Google tag ID (G-, GT-, or AW-) before turning this on');
      return;
    }
    try {
      setSaving(true);
      const { data } = await axios.put(`${API_URL}/website/analytics`, form);
      const analytics = data?.analytics || form;
      setForm({
        enabled: Boolean(analytics.enabled),
        measurementId: analytics.measurementId || '',
        adsId: analytics.adsId || '',
        conversions: analytics.conversions?.length ? analytics.conversions : [{ ...EMPTY_CONVERSION }],
      });
      toast.success('Analytics saved');
    } catch (error) {
      console.error('Error saving website analytics:', error);
      toast.error('Failed to save analytics');
    } finally {
      setSaving(false);
    }
  };

  const updateConversion = (index: number, patch: Partial<Conversion>) => {
    setForm((prev) => ({
      ...prev,
      conversions: prev.conversions.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h1" sx={{ mb: 1 }}>
            Website Analytics
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Google tag and conversion events for the customer site. Design stays on Website.
          </Typography>
        </Box>
        <Button variant="contained" onClick={() => void save()} disabled={loading || saving} sx={{ textTransform: 'none' }}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              disabled={loading}
            />
          }
          label="Send events from the public website"
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Paste the Google tag ID from Ads or GA4 (G-…, GT-…, or AW-…), not the conversion script by itself. Contact Us on this site opens a form, so we fire the conversion when the message actually sends — not Google’s delayed-redirect helper.
        </Typography>
        <TextField
          label="Google tag ID"
          value={form.measurementId}
          onChange={(e) => setForm((prev) => ({ ...prev, measurementId: e.target.value }))}
          placeholder="AW-XXXXXXXX or G-XXXXXXXX"
          fullWidth
          sx={{ mb: 2 }}
          disabled={loading}
          helperText="From Google’s install-tag snippet: gtag/js?id=…"
        />
        <TextField
          label="Google Ads ID (optional)"
          value={form.adsId}
          onChange={(e) => setForm((prev) => ({ ...prev, adsId: e.target.value }))}
          placeholder="AW-XXXXXXXX"
          fullWidth
          disabled={loading}
          helperText="Only if Ads uses a separate AW- tag from your GA4 G- ID."
        />
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Conversion events
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                conversions: [...prev.conversions, { name: '', trigger: 'contact_submit', label: '' }],
              }))
            }
            sx={{ textTransform: 'none' }}
          >
            Add event
          </Button>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {form.conversions.map((row, index) => (
            <Box key={row.id || index} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TextField
                label="Event name"
                size="small"
                value={row.name}
                onChange={(e) => updateConversion(index, { name: e.target.value })}
                placeholder="ads_conversion_Contact_Us_1"
                sx={{ flex: 2, minWidth: 220 }}
              />
              <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
                <InputLabel>Fire when</InputLabel>
                <Select
                  label="Fire when"
                  value={row.trigger}
                  onChange={(e) => updateConversion(index, { trigger: String(e.target.value) })}
                >
                  {TRIGGERS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Label"
                size="small"
                value={row.label}
                onChange={(e) => updateConversion(index, { label: e.target.value })}
                placeholder="Contact us"
                sx={{ flex: 1, minWidth: 140 }}
              />
              <IconButton
                size="small"
                color="error"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    conversions: prev.conversions.filter((_, i) => i !== index),
                  }))
                }
                aria-label="Remove event"
                sx={{ mt: 0.5 }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      </Paper>
    </Container>
  );
}

export default WebsiteAnalyticsPage;
