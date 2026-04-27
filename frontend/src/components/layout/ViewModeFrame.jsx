import { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

function ViewModeFrame({ currentView, children }) {
  const navigate = useNavigate();
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [exitPin, setExitPin] = useState('');

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
  const handleExitConfirm = () => {
    if (exitPin.trim() !== '7212') return;
    navigate(exitPathByView[currentView] || '/pipeline');
    setExitDialogOpen(false);
    setExitPin('');
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
            variant={currentView === btn.key ? 'contained' : 'outlined'}
            onClick={() => navigate(btn.path)}
            sx={{
              fontWeight: 700,
              borderWidth: 2,
              borderColor: '#90CAF9',
              color: '#1565C0',
              backgroundColor: currentView === btn.key ? '#BBDEFB' : 'transparent',
              '&:hover': {
                borderWidth: 2,
                borderColor: '#64B5F6',
                backgroundColor: currentView === btn.key ? '#90CAF9' : 'rgba(144, 202, 249, 0.16)',
              },
            }}
          >
            {btn.label}
          </Button>
        ))}
        <Button
          size="small"
          variant="outlined"
          onClick={() => setExitDialogOpen(true)}
          sx={{
            fontWeight: 700,
            borderWidth: 2,
            borderColor: '#90CAF9',
            color: '#1565C0',
            '&:hover': {
              borderWidth: 2,
              borderColor: '#64B5F6',
              backgroundColor: 'rgba(144, 202, 249, 0.16)',
            },
          }}
        >
          Exit view
        </Button>
      </Paper>
      <Dialog
        open={exitDialogOpen}
        onClose={() => {
          setExitDialogOpen(false);
          setExitPin('');
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Exit view</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter passcode to leave view mode.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="Passcode"
            type="password"
            value={exitPin}
            onChange={(e) => setExitPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleExitConfirm();
            }}
            error={Boolean(exitPin) && exitPin.trim() !== '7212'}
            helperText={
              Boolean(exitPin) && exitPin.trim() !== '7212' ? 'Incorrect passcode' : ' '
            }
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setExitDialogOpen(false);
              setExitPin('');
            }}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={handleExitConfirm}>
            Exit
          </Button>
        </DialogActions>
      </Dialog>
      {children}
    </Box>
  );
}

export default ViewModeFrame;
