import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Menu,
  MenuItem,
  TextField,
  InputAdornment,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  ClickAwayListener,
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
  Search as SearchIcon,
} from '@mui/icons-material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function TopBar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { mode, toggleColorMode } = useTheme();
  const navigate = useNavigate();
  const theme = useMuiTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [anchorEl, setAnchorEl] = useState(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

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

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const response = await axios.get(`${API_URL}/customers/global-search`, {
          params: { q: trimmed, limit: 6 },
        });
        setSearchResults(response.data?.results || []);
      } catch (_error) {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const showDropdown = useMemo(
    () => searchOpen && (query.trim().length >= 2 || searchLoading || searchResults.length > 0),
    [searchLoading, searchOpen, searchResults.length, query]
  );

  const handleResultClick = (path) => {
    setSearchOpen(false);
    setQuery('');
    setSearchResults([]);
    navigate(path);
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
          {!isMobile && (
            <ClickAwayListener onClickAway={() => setSearchOpen(false)}>
              <Box sx={{ position: 'relative', ml: 1, width: { md: 340, lg: 440 } }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search archived, finished, no-job customers, pipeline..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                {showDropdown && (
                  <Paper
                    elevation={6}
                    sx={{
                      position: 'absolute',
                      zIndex: 1400,
                      top: 'calc(100% + 6px)',
                      left: 0,
                      right: 0,
                      maxHeight: 360,
                      overflowY: 'auto',
                    }}
                  >
                    <List dense disablePadding>
                      {searchLoading && (
                        <MenuItem disabled>
                          <ListItemText primary="Searching..." />
                        </MenuItem>
                      )}
                      {!searchLoading && searchResults.length === 0 && query.trim().length >= 2 && (
                        <MenuItem disabled>
                          <ListItemText primary="No matches found" />
                        </MenuItem>
                      )}
                      {!searchLoading &&
                        searchResults.map((result) => (
                          <ListItemButton key={result.id} onClick={() => handleResultClick(result.path)}>
                            <ListItemText primary={result.title} secondary={result.subtitle} />
                            <Chip size="small" label={result.locationLabel || 'Open'} />
                          </ListItemButton>
                        ))}
                    </List>
                  </Paper>
                )}
              </Box>
            </ClickAwayListener>
          )}
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

