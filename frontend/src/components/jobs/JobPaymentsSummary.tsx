import { useMemo } from 'react';
import { Alert, Box, Paper, Typography } from '@mui/material';
import { formatMoney, getJobPaymentSummary } from '../../utils/paymentSchedule';

export default function JobPaymentsSummary({ job }) {
  const summary = useMemo(() => getJobPaymentSummary(job), [job]);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
        Job payment summary
      </Typography>

      {summary.hasStalePaidAmounts && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          <Typography variant="body2">
            A paid amount does not match its payment row (common after editing amounts). Summary
            totals use each row&apos;s scheduled amount. Open the schedule below and save to fix
            stored values.
          </Typography>
        </Alert>
      )}

      {summary.overpaidAmount > 0 && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          <Typography variant="body2">
            Payments exceed the job total by {formatMoney(summary.overpaidAmount)}. Review the Paid
            column on each row.
          </Typography>
        </Alert>
      )}

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
          <Typography variant="caption" color="text.secondary" display="block">
            Sum of paid milestones
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
