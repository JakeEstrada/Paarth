/**
 * WebsiteAnalyticsPage — Super-admin traffic graphs + Google tag config.
 * Route: /developer/analytics
 * APIs: GET /website, GET /website/analytics/report, PUT /website/analytics
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Container,
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
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  MailOutline as MailIcon,
  PeopleOutline as PeopleIcon,
  TouchApp as TouchIcon,
  Visibility as ViewsIcon,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const GOOGLE_TAG_ID = /\b(?:G|GT|AW|DC)-[A-Z0-9]+\b/i;
const ADS_CUSTOMER_ID = /^\d{3}-\d{3}-\d{4}$/;

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

type SeriesPoint = {
  date: string;
  pageViews: number;
  visitors: number;
  contactOpens: number;
  contactSubmits: number;
};

type Report = {
  days: number;
  totals: {
    pageViews: number;
    visitors: number;
    contactOpens: number;
    contactSubmits: number;
  };
  series: SeriesPoint[];
  pages: Array<{ path: string; views: number }>;
};

const EMPTY_FORM: AnalyticsForm = {
  enabled: false,
  measurementId: '',
  adsId: '',
  conversions: [{ ...EMPTY_CONVERSION }],
};

const EMPTY_REPORT: Report = {
  days: 30,
  totals: { pageViews: 0, visitors: 0, contactOpens: 0, contactSubmits: 0 },
  series: [],
  pages: [],
};

function looksLikeAdsCustomerId(value: string) {
  const compact = String(value || '').replace(/\s+/g, '');
  return ADS_CUSTOMER_ID.test(compact) || /^\d{8,12}$/.test(compact);
}

function formatDay(date: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function TrafficChart({ series, theme }: { series: SeriesPoint[]; theme: ReturnType<typeof useTheme> }) {
  const width = 720;
  const height = 240;
  const pad = { l: 36, r: 16, t: 16, b: 32 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...series.map((row) => Math.max(row.pageViews, row.contactSubmits)));
  const points = series.map((row, index) => {
    const x = series.length <= 1 ? pad.l + innerW / 2 : pad.l + (index / (series.length - 1)) * innerW;
    const y = pad.t + innerH - (row.pageViews / max) * innerH;
    const cy = pad.t + innerH - (row.contactSubmits / max) * innerH;
    return { ...row, x, y, cy };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${pad.l},${pad.t + innerH} ${line} ${pad.l + innerW},${pad.t + innerH}`;
  const contactLine = points.map((point) => `${point.x},${point.cy}`).join(' ');
  const viewColor = theme.palette.primary.main;
  const contactColor = theme.palette.success.main;
  const ticks = series.filter((_, index) => {
    if (series.length <= 8) return true;
    const step = Math.ceil(series.length / 7);
    return index % step === 0 || index === series.length - 1;
  });

  if (!series.length) return null;

  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="240" role="img" aria-label="Website traffic">
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke={theme.palette.divider} />
        <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke={theme.palette.divider} />
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={pad.l}
            x2={pad.l + innerW}
            y1={pad.t + innerH * (1 - frac)}
            y2={pad.t + innerH * (1 - frac)}
            stroke={theme.palette.divider}
            strokeDasharray="4 6"
          />
        ))}
        <polygon points={area} fill={alpha(viewColor, 0.18)} />
        <polyline points={line} fill="none" stroke={viewColor} strokeWidth="2.5" />
        <polyline points={contactLine} fill="none" stroke={contactColor} strokeWidth="2.5" />
        {ticks.map((row) => {
          const point = points.find((item) => item.date === row.date);
          if (!point) return null;
          return (
            <text
              key={row.date}
              x={point.x}
              y={height - 8}
              textAnchor="middle"
              fill={theme.palette.text.secondary}
              fontSize="11"
            >
              {formatDay(row.date)}
            </text>
          );
        })}
        <text x={pad.l} y={12} fill={theme.palette.text.secondary} fontSize="11">
          {max}
        </text>
      </svg>
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: -1 }}>
        <Typography variant="caption" sx={{ color: viewColor }}>
          Page views
        </Typography>
        <Typography variant="caption" sx={{ color: contactColor }}>
          Contact form sent
        </Typography>
      </Box>
    </Box>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof ViewsIcon;
  color: string;
}) {
  const theme = useTheme();
  return (
    <Paper elevation={0} sx={{ p: 2, border: `1px solid ${theme.palette.divider}`, borderLeft: `4px solid ${color}` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, fontSize: { xs: '1.4rem', sm: '1.75rem' } }}>
            {value.toLocaleString()}
          </Typography>
        </Box>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.18 : 0.1),
          }}
        >
          <Icon sx={{ fontSize: 22, color }} />
        </Box>
      </Box>
    </Paper>
  );
}

function WebsiteAnalyticsPage() {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(30);
  const [form, setForm] = useState<AnalyticsForm>(EMPTY_FORM);
  const [report, setReport] = useState<Report>(EMPTY_REPORT);

  const load = useCallback(async (rangeDays = days) => {
    try {
      setLoading(true);
      const [{ data }, reportRes] = await Promise.all([
        axios.get(`${API_URL}/website`),
        axios.get(`${API_URL}/website/analytics/report`, { params: { days: rangeDays } }),
      ]);
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
      setReport({
        days: reportRes.data?.days || rangeDays,
        totals: reportRes.data?.totals || EMPTY_REPORT.totals,
        series: Array.isArray(reportRes.data?.series) ? reportRes.data.series : [],
        pages: Array.isArray(reportRes.data?.pages) ? reportRes.data.pages : [],
      });
    } catch (error) {
      console.error('Error loading website analytics:', error);
      toast.error('Failed to load website analytics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const save = async () => {
    if (looksLikeAdsCustomerId(form.measurementId) || looksLikeAdsCustomerId(form.adsId)) {
      toast.error('That is the Google Ads account number. Use the AW- or G- tag ID instead.');
      return;
    }
    if (form.enabled && !GOOGLE_TAG_ID.test(form.measurementId)) {
      toast.error('Paste a Google tag ID (AW-, G-, or GT-) before turning this on');
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
    } catch (error) {
      console.error('Error saving website analytics:', error);
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Failed to save Google tag');
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

  const hasTraffic = useMemo(
    () => report.totals.pageViews + report.totals.contactOpens + report.totals.contactSubmits > 0,
    [report.totals],
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h1" sx={{ mb: 1 }}>
            Website Analytics
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Visits and contact-form activity on the customer site. Google Ads spend and clicks stay in Google Ads.
          </Typography>
        </Box>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={days}
          onChange={(_, next) => {
            if (next) setDays(next);
          }}
        >
          <ToggleButton value={7} sx={{ textTransform: 'none' }}>7 days</ToggleButton>
          <ToggleButton value={30} sx={{ textTransform: 'none' }}>30 days</ToggleButton>
          <ToggleButton value={90} sx={{ textTransform: 'none' }}>90 days</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard label="Page views" value={report.totals.pageViews} icon={ViewsIcon} color={theme.palette.primary.main} />
        <StatCard label="Visitors" value={report.totals.visitors} icon={PeopleIcon} color={theme.palette.info.main} />
        <StatCard label="Contact opened" value={report.totals.contactOpens} icon={TouchIcon} color={theme.palette.warning.main} />
        <StatCard label="Messages sent" value={report.totals.contactSubmits} icon={MailIcon} color={theme.palette.success.main} />
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          Traffic
        </Typography>
        {hasTraffic ? (
          <TrafficChart series={report.series} theme={theme} />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
            {loading ? 'Loading…' : 'No visits recorded yet. Graphs fill in after the public site is deployed and people use the site.'}
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Top pages
        </Typography>
        {report.pages.length ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Page</TableCell>
                <TableCell align="right">Views</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.pages.map((row) => (
                <TableRow key={row.path}>
                  <TableCell>{row.path === '/' ? 'Home' : row.path}</TableCell>
                  <TableCell align="right">{row.views.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Page totals appear here after the first visits.
          </Typography>
        )}
      </Paper>

      <Accordion defaultExpanded={!form.measurementId} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>Google Ads tag</Typography>
            <Typography variant="body2" color="text.secondary">
              Optional. Sends the Contact Us conversion to Google. It does not create these graphs.
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" onClick={() => void save()} disabled={loading || saving} sx={{ textTransform: 'none' }}>
              {saving ? 'Saving…' : 'Save tag'}
            </Button>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={form.enabled}
                onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                disabled={loading}
              />
            }
            label="Send conversion events to Google"
          />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
            Paste the tag from Tools → Data manager → Google tag. It starts with AW- or G-. Do not paste the account number from the top-right of Google Ads.
          </Typography>
          <TextField
            label="Google tag ID"
            value={form.measurementId}
            onChange={(e) => setForm((prev) => ({ ...prev, measurementId: e.target.value }))}
            placeholder="AW-XXXXXXXX"
            fullWidth
            sx={{ mb: 2 }}
            disabled={loading}
            error={looksLikeAdsCustomerId(form.measurementId)}
            helperText={
              looksLikeAdsCustomerId(form.measurementId)
                ? 'That is the Ads account number. Open Data manager and copy the AW- tag.'
                : 'From Google’s install-tag snippet: gtag/js?id=…'
            }
          />
          <TextField
            label="Google Ads ID (optional)"
            value={form.adsId}
            onChange={(e) => setForm((prev) => ({ ...prev, adsId: e.target.value }))}
            placeholder="AW-XXXXXXXX"
            fullWidth
            disabled={loading}
            error={looksLikeAdsCustomerId(form.adsId)}
            helperText="Only if Ads uses a separate AW- tag from your GA4 G- ID."
            sx={{ mb: 3 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
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
          {form.enabled && GOOGLE_TAG_ID.test(form.measurementId) ? (
            <Chip size="small" color="success" label="Google tag will load on the public site" sx={{ mt: 2 }} />
          ) : null}
        </AccordionDetails>
      </Accordion>
    </Container>
  );
}

export default WebsiteAnalyticsPage;
