import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme as useMuiTheme,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

function TopBar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { mode, toggleColorMode } = useTheme();
  const navigate = useNavigate();
  const theme = useMuiTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [anchorEl, setAnchorEl] = useState(null);

  const handleSettingsClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleAccountSettings = () => {
    handleClose();
    navigate('/account-settings');
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
    >
      <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 1, sm: 2, md: 3 }, minHeight: '48px !important', py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isMobile && (
            <IconButton
              onClick={onMenuClick}
              size="small"
              sx={{
                mr: 1,
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          )}
          <Typography variant="body2" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, fontWeight: 500 }}>
            {user?.name || 'User'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            onClick={toggleColorMode}
            size="small"
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            sx={{
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          >
            {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
          <IconButton
            onClick={handleSettingsClick}
            size="small"
            sx={{
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
        >
          <MenuItem onClick={handleAccountSettings}>
            <PersonIcon sx={{ mr: 1, fontSize: 20 }} />
            Account Settings
          </MenuItem>
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

