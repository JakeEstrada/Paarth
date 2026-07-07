import { useMemo } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { getJobPaymentSummary } from '../../utils/paymentSchedule';

function formatMoney(value: unknown) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export default function JobPaymentsSummary({ job }) {
  const summary = useMemo(() => getJobPaymentSummary(job), [job]);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
        Job payment summary
      </Typography>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Job total
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>
            {formatMoney(summary.jobTotal)}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Base {formatMoney(summary.base)}
            {summary.coTotal > 0 ? ` + CO ${formatMoney(summary.coTotal)}` : ''}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Paid to date
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 700, color: 'success.main' }}>
            {formatMoney(summary.paidToDate)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Balance due
          </Typography>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 700,
              color: summary.balanceDue <= 0 ? 'success.main' : 'text.primary',
            }}
          >
            {formatMoney(summary.balanceDue)}
          </Typography>
          {summary.coAddedToFinal > 0 && (
            <Typography variant="caption" color="text.secondary" display="block">
              {formatMoney(summary.coAddedToFinal)} change order(s) on final balance
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
