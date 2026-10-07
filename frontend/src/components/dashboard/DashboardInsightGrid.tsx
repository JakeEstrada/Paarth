import { Box, Button, GridLegacy as Grid, Paper, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { eachDayOfInterval, format, subDays } from 'date-fns';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, DonutChart, StackedBarChart, chartPanelSx } from './dashboardChartPrimitives';
import { formatMoney } from '../../utils/paymentSchedule';

type PaymentRow = {
  amount?: number;
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

  const paymentSeries = useMemo(() => {
    const bucket = new Map(days.map((date) => [date, { date, amount: 0, count: 0 }]));
    for (const row of payments) {
      const date = ymd(row.resolvedPaymentPaidAt || row.paymentPaidAt || row.createdAt);
      const current = bucket.get(date);
      if (!current) continue;
      current.amount += Number(row.amount) || 0;
      current.count += 1;
    }
    return days.map((date) => bucket.get(date)!);
  }, [days, payments]);

  const activitySeries = useMemo(() => {
    const bucket = new Map(
      days.map((date) => [date, { date, payments: 0, pipeline: 0, notes: 0, tasks: 0, other: 0 }]),
    );
    for (const row of activities) {
      const date = ymd(row.createdAt);
      const current = bucket.get(date);
      if (!current) continue;
      current[activityBucket(String(row.type || ''))] += 1;
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

  const teamSeries = useMemo(() => {
    if (!teamActivity?.length) return days.map((date) => ({ date, logins: 0, pageViews: 0, clicks: 0 }));
    const bucket = new Map(teamActivity.map((row) => [row.date, row]));
    return days.map((date) => ({
      date,
      logins: Number(bucket.get(date)?.logins) || 0,
      pageViews: Number(bucket.get(date)?.pageViews) || 0,
      clicks: Number(bucket.get(date)?.clicks) || 0,
    }));
  }, [days, teamActivity]);

  const paymentTotal = paymentSeries.reduce((sum, row) => sum + row.amount, 0);
  const activityTotal = activitySeries.reduce(
    (sum, row) => sum + row.payments + row.pipeline + row.notes + row.tasks + row.other,
    0,
  );
  const trafficTotal = trafficSeries.reduce((sum, row) => sum + row.pageViews, 0);

  const money = (value: number) => (hideSensitive ? 'Locked' : formatMoney(value));

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8} sx={{ display: 'flex' }}>
          <Paper elevation={0} sx={chartPanelSx(theme)}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, gap: 1 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Payments received
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Last 30 days · {money(paymentTotal)}
                </Typography>
              </Box>
              {canOpenFinance ? (
                <Button size="small" onClick={() => navigate('/finance?tab=deposits')} sx={{ textTransform: 'none' }}>
                  Finance
                </Button>
              ) : null}
            </Box>
            <AreaChart
              data={paymentSeries}
              series={[
                {
                  key: hideSensitive ? 'count' : 'amount',
                  label: hideSensitive ? 'Payments' : 'Amount',
                  color: '#10b981',
                },
              ]}
              formatValue={hideSensitive ? undefined : (value) => formatMoney(value)}
            />
          </Paper>
        </Grid>
        <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
          <Paper elevation={0} sx={chartPanelSx(theme)}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
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
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={showTraffic ? 6 : 12} sx={{ display: 'flex' }}>
          <Paper elevation={0} sx={chartPanelSx(theme)}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Team activity
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {teamActivity
                ? `In-app use · ${teamSeries.reduce((sum, row) => sum + row.pageViews + row.clicks + row.logins, 0)} events`
                : `Job timeline · ${activityTotal} events in 30 days`}
            </Typography>
            {teamActivity ? (
              <StackedBarChart
                data={teamSeries}
                series={[
                  { key: 'pageViews', label: 'Pages', color: '#6366f1' },
                  { key: 'clicks', label: 'Clicks', color: '#f59e0b' },
                  { key: 'logins', label: 'Sign-ins', color: '#ec4899' },
                ]}
              />
            ) : (
              <StackedBarChart
                data={activitySeries}
                series={[
                  { key: 'pipeline', label: 'Pipeline', color: '#6366f1' },
                  { key: 'payments', label: 'Payments', color: '#10b981' },
                  { key: 'notes', label: 'Notes', color: '#f59e0b' },
                  { key: 'tasks', label: 'Tasks', color: '#ec4899' },
                  { key: 'other', label: 'Other', color: '#38bdf8' },
                ]}
              />
            )}
          </Paper>
        </Grid>
        {showTraffic ? (
          <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
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
                  { key: 'pageViews', label: 'Page views', color: '#3b82f6' },
                  { key: 'visitors', label: 'Visitors', color: '#a855f7' },
                  { key: 'contactSubmits', label: 'Messages', color: '#f97316' },
                ]}
              />
            </Paper>
          </Grid>
        ) : null}
      </Grid>

      {!teamActivity ? null : (
        <Paper
          elevation={0}
          sx={{
            ...chartPanelSx(theme),
            mt: 2,
            background: `linear-gradient(180deg, ${alpha('#6366f1', 0.06)} 0%, ${theme.palette.background.paper} 40%)`,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Job timeline
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            What the shop logged in Paarth over the last 30 days
          </Typography>
          <StackedBarChart
            data={activitySeries}
            series={[
              { key: 'pipeline', label: 'Pipeline', color: '#6366f1' },
              { key: 'payments', label: 'Payments', color: '#10b981' },
              { key: 'notes', label: 'Notes', color: '#f59e0b' },
              { key: 'tasks', label: 'Tasks', color: '#ec4899' },
              { key: 'other', label: 'Other', color: '#38bdf8' },
            ]}
          />
        </Paper>
      )}
    </Box>
  );
}
