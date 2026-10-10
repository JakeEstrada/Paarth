import {
  AccountTree as JobsIcon,
  CalendarToday as CalendarIcon,
  Dashboard as DashboardHomeIcon,
  People as PeopleIcon,
} from '@mui/icons-material';
import { Box, Button } from '@mui/material';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const KIOSK_VIEWS = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard-view', icon: DashboardHomeIcon },
  { key: 'pipeline', label: 'Pipeline', path: '/pipeline-view', icon: JobsIcon },
  { key: 'calendar', label: 'Calendar', path: '/calendar-view', icon: CalendarIcon },
  { key: 'customers', label: 'Customers', path: '/customers-view', icon: PeopleIcon },
] as const;

export default function KioskViewNav({
  currentView,
  endAdornment,
}: {
  currentView?: (typeof KIOSK_VIEWS)[number]['key'];
  endAdornment?: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      {KIOSK_VIEWS.map((btn) => {
        const Icon = btn.icon;
        const selected = currentView === btn.key;
        return (
          <Button
            key={btn.key}
            variant={selected ? 'contained' : 'outlined'}
            startIcon={<Icon />}
            onClick={() => navigate(btn.path)}
            sx={{ textTransform: 'none', borderRadius: 2, px: 2 }}
          >
            {btn.label}
          </Button>
        );
      })}
      {endAdornment}
    </Box>
  );
}
