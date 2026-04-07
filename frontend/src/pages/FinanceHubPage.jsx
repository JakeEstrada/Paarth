import { useMemo, useState } from 'react';
import { Box, Card, CardContent, Chip, Container, Tab, Tabs, Typography } from '@mui/material';

const TAB_DEFS = [
  {
    key: 'register',
    label: 'Register (Balance Sheet)',
    subtitle: 'Track cash movement, balances, and account-level snapshots.',
  },
  {
    key: 'estimates',
    label: 'Estimates',
    subtitle: 'Create and review estimate documents before contract execution.',
  },
  {
    key: 'contracts',
    label: 'Contracts',
    subtitle: 'Manage signed agreements and contract status history.',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    subtitle: 'View billing activity and outstanding customer invoices.',
  },
  {
    key: 'change-orders',
    label: 'Change Orders',
    subtitle: 'Track project scope changes and associated financial impact.',
  },
  {
    key: 'payment-schedules',
    label: 'Payment Schedules',
    subtitle: 'Manage planned payment milestones and due timelines.',
  },
];

function FinanceHubPage() {
  const [activeTab, setActiveTab] = useState(TAB_DEFS[0].key);

  const activeSection = useMemo(
    () => TAB_DEFS.find((tab) => tab.key === activeTab) || TAB_DEFS[0],
    [activeTab]
  );

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h1" sx={{ mb: 1 }}>
          Finance Hub
        </Typography>
        <Typography variant="body1" color="text.secondary">
          One workspace for register, estimates, contracts, invoices, change orders, and payment
          schedules.
        </Typography>
      </Box>

      <Card sx={{ mb: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ px: { xs: 1, sm: 2 }, pt: 1 }}
        >
          {TAB_DEFS.map((tab) => (
            <Tab key={tab.key} value={tab.key} label={tab.label} sx={{ textTransform: 'none' }} />
          ))}
        </Tabs>
      </Card>

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {activeSection.label}
            </Typography>
            <Chip size="small" color="primary" label="New" />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {activeSection.subtitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            This section is ready for workflow-specific fields and actions. Existing routes/layout
            are unchanged; this is a dedicated, single-tab hub page.
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}

export default FinanceHubPage;
