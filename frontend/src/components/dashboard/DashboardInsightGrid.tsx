import { Box, Button, Paper, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { eachDayOfInterval, format, subDays } from 'date-fns';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, DonutChart, ScatterChart, chartPanelSx, compactMoney } from './dashboardChartPrimitives';
import OrangeCountyJobMap from './OrangeCountyJobMap';
import { formatMoney } from '../../utils/paymentSchedule';

type PaymentRow = {
  amount?: number;
  note?: string;
  paymentType?: string;
  resolvedPaymentPaidAt?: string;
  paymentPaidAt?: string;
  createdAt?: string;
};

type ActivityRow = {
  type?: string;
  createdAt?: string;
};

type TrafficPoint = {
  date: string;
  pageViews?: number;
  visitors?: number;
  contactSubmits?: number;
};

type TeamPoint = {
  date: string;
  logins?: number;
  pageViews?: number;
  clicks?: number;
};

type PipelineSlice = {
  label: string;
  value: number;
  color: string;
};

function dayKeys(days: number) {
  const end = new Date();
  const start = subDays(end, days - 1);
  return eachDayOfInterval({ start, end }).map((date) => format(date, 'yyyy-MM-dd'));
}

function ymd(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'yyyy-MM-dd');
}

function activityBucket(type: string) {
  if (type === 'payment_received' || type === 'deposit_received') return 'payments';
  if (type === 'stage_change' || type === 'job_created' || type === 'job_updated') return 'pipeline';
  if (type === 'note' || type === 'manual_entry' || type === 'call' || type === 'email' || type === 'sms') {
    return 'notes';
  }
  if (String(type || '').startsWith('task') || String(type || '').startsWith('project')) return 'tasks';
  return 'other';
}

export default function DashboardInsightGrid({
  hideSensitive,
  showTraffic,
  payments,
  activities,
  traffic,
  teamActivity,
  pipeline,
  canOpenFinance,
}: {
  hideSensitive: boolean;
  showTraffic: boolean;
  payments: PaymentRow[];
  activities: ActivityRow[];
  traffic: TrafficPoint[] | null;
  teamActivity: TeamPoint[] | null;
  pipeline: PipelineSlice[];
  canOpenFinance: boolean;
}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const days = useMemo(() => dayKeys(30), []);

  const paymentPoints = useMemo(() => {
    return payments
      .map((row) => {
        const stamp = row.resolvedPaymentPaidAt || row.paymentPaidAt || row.createdAt;
        const time = stamp ? new Date(stamp).getTime() : NaN;
        const note = String(row.note || '').replace(/^Payment received:\s*/i, '').trim();
        return {
          t: time,
          y: Number(row.amount) || 0,
          label: note || String(row.paymentType || 'Payment').replace(/_/g, ' '),
        };
      })
      .filter((point) => Number.isFinite(point.t) && point.y > 0);
  }, [payments]);

  const activitySeries = useMemo(() => {
    const bucket = new Map(
      days.map((date) => [date, { date, pipeline: 0, notes: 0, tasks: 0, other: 0 }]),
    );
    for (const row of activities) {
      const date = ymd(row.createdAt);
      const current = bucket.get(date);
      if (!current) continue;
      const key = activityBucket(String(row.type || ''));
      if (key === 'payments') {
        current.other += 1;
        continue;
      }
      current[key] += 1;
    }
    return days.map((date) => bucket.get(date)!);
  }, [activities, days]);

  const trafficSeries = useMemo(() => {
    if (!traffic?.length) return days.map((date) => ({ date, pageViews: 0, visitors: 0, contactSubmits: 0 }));
    const bucket = new Map(traffic.map((row) => [row.date, row]));
    return days.map((date) => ({
      date,
      pageViews: Number(bucket.get(date)?.pageViews) || 0,
      visitors: Number(bucket.get(date)?.visitors) || 0,
      contactSubmits: Number(bucket.get(date)?.contactSubmits) || 0,
    }));
  }, [days, traffic]);

  const auditHasData = Boolean(
    teamActivity?.some((row) => (Number(row.pageViews) || 0) + (Number(row.clicks) || 0) + (Number(row.logins) || 0) > 0),
  );

  const teamSeries = useMemo(() => {
    if (!auditHasData) return activitySeries;
    const bucket = new Map((teamActivity || []).map((row) => [row.date, row]));
    return days.map((date) => ({
      date,
      pipeline: Number(bucket.get(date)?.pageViews) || 0,
      notes: Number(bucket.get(date)?.clicks) || 0,
      tasks: Number(bucket.get(date)?.logins) || 0,
      other: 0,
    }));
  }, [activitySeries, auditHasData, days, teamActivity]);

  const paymentTotal = paymentPoints.reduce((sum, row) => sum + row.y, 0);
  const activityTotal = activitySeries.reduce(
    (sum, row) => sum + row.pipeline + row.notes + row.tasks + row.other,
    0,
  );
  const trafficTotal = trafficSeries.reduce((sum, row) => sum + row.pageViews, 0);
  const money = (value: number) => (hideSensitive ? 'Locked' : formatMoney(value));
  const axisMoney = (value: number) => (hideSensitive ? String(Math.round(value)) : compactMoney(value));

  return (
    <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.7fr) minmax(280px, 0.9fr)' },
          gap: 2,
          alignItems: 'stretch',
        }}
      >
        <Paper elevation={0} sx={chartPanelSx(theme)}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Payments collected
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Last 30 days · {paymentPoints.length} payments · {money(paymentTotal)}
              </Typography>
            </Box>
            {canOpenFinance ? (
              <Button size="small" onClick={() => navigate('/finance?tab=deposits')} sx={{ textTransform: 'none' }}>
                Finance
              </Button>
            ) : null}
          </Box>
          <ScatterChart
            points={paymentPoints}
            formatValue={hideSensitive ? undefined : axisMoney}
            hideSensitive={hideSensitive}
          />
        </Paper>
        <Paper elevation={0} sx={chartPanelSx(theme)}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Pipeline mix
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Active jobs by stage group
          </Typography>
          <DonutChart
            slices={pipeline}
            centerLabel="jobs"
            centerValue={String(pipeline.reduce((sum, slice) => sum + slice.value, 0))}
          />
        </Paper>
      </Box>

      <OrangeCountyJobMap />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: showTraffic ? '1fr 1fr' : '1fr' },
          gap: 2,
          alignItems: 'stretch',
        }}
      >
        <Paper elevation={0} sx={chartPanelSx(theme)}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Team activity
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {auditHasData
              ? 'Pages, clicks, and sign-ins in Paarth'
              : `Shop work logged in Paarth · ${activityTotal} events`}
          </Typography>
          <AreaChart
            data={teamSeries}
            series={
              auditHasData
                ? [
                    { key: 'pipeline', label: 'Pages', color: '#818cf8' },
                    { key: 'notes', label: 'Clicks', color: '#fbbf24' },
                    { key: 'tasks', label: 'Sign-ins', color: '#f472b6' },
                  ]
                : [
                    { key: 'pipeline', label: 'Pipeline', color: '#818cf8' },
                    { key: 'notes', label: 'Notes', color: '#fbbf24' },
                    { key: 'tasks', label: 'Tasks', color: '#f472b6' },
                    { key: 'other', label: 'Other', color: '#38bdf8' },
                  ]
            }
            showDots
          />
        </Paper>
        {showTraffic ? (
          <Paper elevation={0} sx={chartPanelSx(theme)}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Website traffic
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Public site · {trafficTotal} page views
                </Typography>
              </Box>
              <Button size="small" onClick={() => navigate('/developer/analytics')} sx={{ textTransform: 'none' }}>
                Analytics
              </Button>
            </Box>
            <AreaChart
              data={trafficSeries}
              series={[
                { key: 'pageViews', label: 'Page views', color: '#60a5fa' },
                { key: 'visitors', label: 'Visitors', color: '#c084fc' },
                { key: 'contactSubmits', label: 'Messages', color: '#fb923c' },
              ]}
            />
          </Paper>
        ) : null}
      </Box>
    </Box>
  );
}
