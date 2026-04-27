import { Box, Button, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';

function ViewModeFrame({ currentView, children }) {
  const navigate = useNavigate();

  const viewButtons = [
    { key: 'pipeline', label: 'Pipeline view', path: '/pipeline-view' },
    { key: 'calendar', label: 'Calendar view', path: '/calendar-view' },
    { key: 'customers', label: 'Customers view', path: '/customers-view' },
  ];
  const exitPathByView = {
    pipeline: '/pipeline',
    calendar: '/calendar',
    customers: '/customers',
  };

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh' }}>
      <Paper
        elevation={3}
        sx={{
          position: 'fixed',
          top: { xs: 8, sm: 12 },
          right: { xs: 8, sm: 16 },
          zIndex: (theme) => theme.zIndex.appBar + 2,
          p: 1,
          display: { xs: 'none', sm: 'flex' },
          alignItems: 'center',
          gap: 1,
          borderRadius: 2,
        }}
      >
        {viewButtons.map((btn) => (
          <Button
            key={btn.key}
            size="small"
            color="warning"
            variant={currentView === btn.key ? 'contained' : 'outlined'}
            onClick={() => navigate(btn.path)}
            sx={{
              fontWeight: 700,
              borderWidth: 2,
              '&:hover': { borderWidth: 2 },
            }}
          >
            {btn.label}
          </Button>
        ))}
        <Button
          size="small"
          color="warning"
          variant="outlined"
          onClick={() => navigate(exitPathByView[currentView] || '/pipeline')}
          sx={{
            fontWeight: 700,
            borderWidth: 2,
            '&:hover': { borderWidth: 2 },
          }}
        >
          Exit view
        </Button>
      </Paper>
      {children}
    </Box>
  );
}

export default ViewModeFrame;
