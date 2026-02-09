import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleSettingsClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleClose();
    await logout();
    navigate('/login');
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: 'white',
        borderBottom: '1px solid #E0E0E0',
        color: '#263238',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', px: 3, minHeight: '48px !important', py: 1 }}>
        <Typography variant="body2" sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#546E7A' }}>
          {user?.name || 'User'}
        </Typography>
        <IconButton
          onClick={handleSettingsClick}
          size="small"
          sx={{
            color: '#546E7A',
            '&:hover': {
              backgroundColor: '#F5F5F5',
            },
          }}
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
        >
          <MenuItem onClick={handleLogout}>
            <LogoutIcon sx={{ mr: 1, fontSize: 20 }} />
            Logout
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

export default TopBar;

