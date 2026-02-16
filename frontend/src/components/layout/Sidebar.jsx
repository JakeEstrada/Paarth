import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  Divider,
  useTheme,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  AccountTree as PipelineIcon,
  People as CustomersIcon,
  CalendarToday as CalendarIcon,
  Assignment as TasksIcon,
  Archive as ArchiveIcon,
  CheckCircle as CompletedJobsIcon,
  EventNote as CompletedAppointmentsIcon,
  Code as DeveloperIcon,
  AccountBalance as PayrollIcon,
  Person as UsersIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';

const DRAWER_WIDTH = 260;

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Pipeline', icon: <PipelineIcon />, path: '/pipeline' },
  { text: 'Customers', icon: <CustomersIcon />, path: '/customers' },
  { text: 'Calendar', icon: <CalendarIcon />, path: '/calendar' },
  { text: 'Tasks', icon: <TasksIcon />, path: '/tasks' },
  { text: 'Payroll', icon: <PayrollIcon />, path: '/payroll' },
  { text: 'Bills', icon: <ReceiptIcon />, path: '/bills' },
];

const archiveItems = [
  { text: 'Job Archive', icon: <ArchiveIcon />, path: '/archive' },
  { text: 'Completed Jobs', icon: <CompletedJobsIcon />, path: '/completed-jobs' },
  { text: 'Completed Tasks & Appointments', icon: <TasksIcon />, path: '/completed-tasks' },
];

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { isAdmin } = useAuth();

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          borderRight: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.mode === 'dark' ? '#1E1E1E' : '#FAFAFA',
        },
      }}
    >
      <Box
        sx={{
          p: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          component="img"
          src="/logo.png"
          alt="San Clemente Woodworking"
          sx={{
            height: 80,
            width: 80,
            objectFit: 'contain',
          }}
        />
      </Box>

      <List sx={{ pt: 2 }}>
        {menuItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              onClick={() => navigate(item.path)}
              selected={isActive(item.path)}
              sx={{
                mx: 1,
                mb: 0.5,
                borderRadius: '8px',
                '&.Mui-selected': {
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(25, 118, 210, 0.16)' 
                    : '#E3F2FD',
                  color: theme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: theme.palette.mode === 'dark'
                      ? 'rgba(25, 118, 210, 0.24)'
                      : '#BBDEFB',
                  },
                  '& .MuiListItemIcon-root': {
                    color: theme.palette.primary.main,
                  },
                },
                '&:hover': {
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.08)'
                    : '#F5F5F5',
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: isActive(item.path) ? theme.palette.primary.main : 'inherit',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{
                  fontSize: '0.9375rem',
                  fontWeight: isActive(item.path) ? 600 : 400,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
        {isAdmin() && (
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => navigate('/users')}
              selected={isActive('/users')}
              sx={{
                mx: 1,
                mb: 0.5,
                borderRadius: '8px',
                '&.Mui-selected': {
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(25, 118, 210, 0.16)' 
                    : '#E3F2FD',
                  color: theme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: theme.palette.mode === 'dark'
                      ? 'rgba(25, 118, 210, 0.24)'
                      : '#BBDEFB',
                  },
                  '& .MuiListItemIcon-root': {
                    color: theme.palette.primary.main,
                  },
                },
                '&:hover': {
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.08)'
                    : '#F5F5F5',
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: isActive('/users') ? '#1976D2' : 'inherit',
                }}
              >
                <UsersIcon />
              </ListItemIcon>
              <ListItemText
                primary="Users"
                primaryTypographyProps={{
                  fontSize: '0.9375rem',
                  fontWeight: isActive('/users') ? 600 : 400,
                }}
              />
            </ListItemButton>
          </ListItem>
        )}
      </List>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ px: 2, pb: 1 }}>
        <Typography
          variant="caption"
          sx={{
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
            color: theme.palette.text.secondary,
            fontSize: '0.75rem',
          }}
        >
          Archive & History
        </Typography>
      </Box>

      <List>
        {archiveItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              onClick={() => navigate(item.path)}
              selected={isActive(item.path)}
              sx={{
                mx: 1,
                mb: 0.5,
                borderRadius: '8px',
                '&.Mui-selected': {
                  backgroundColor: theme.palette.mode === 'dark' 
                    ? 'rgba(25, 118, 210, 0.16)' 
                    : '#E3F2FD',
                  color: theme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: theme.palette.mode === 'dark'
                      ? 'rgba(25, 118, 210, 0.24)'
                      : '#BBDEFB',
                  },
                  '& .MuiListItemIcon-root': {
                    color: theme.palette.primary.main,
                  },
                },
                '&:hover': {
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.08)'
                    : '#F5F5F5',
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: isActive(item.path) ? theme.palette.primary.main : 'inherit',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                primaryTypographyProps={{
                  fontSize: '0.9375rem',
                  fontWeight: isActive(item.path) ? 600 : 400,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ px: 2, pb: 1 }}>
        <Typography
          variant="caption"
          sx={{
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
            color: theme.palette.text.secondary,
            fontSize: '0.75rem',
          }}
        >
          Developer
        </Typography>
      </Box>

      <List>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => navigate('/developer')}
            selected={isActive('/developer')}
            sx={{
              mx: 1,
              mb: 0.5,
              borderRadius: '8px',
              '&.Mui-selected': {
                backgroundColor: theme.palette.mode === 'dark'
                  ? 'rgba(245, 124, 0, 0.16)'
                  : '#FFF3E0',
                color: '#F57C00',
                '&:hover': {
                  backgroundColor: theme.palette.mode === 'dark'
                    ? 'rgba(245, 124, 0, 0.24)'
                    : '#FFE0B2',
                },
                '& .MuiListItemIcon-root': {
                  color: '#F57C00',
                },
              },
              '&:hover': {
                backgroundColor: theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : '#F5F5F5',
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 40,
                color: isActive('/developer') ? '#F57C00' : 'inherit',
              }}
            >
              <DeveloperIcon />
            </ListItemIcon>
            <ListItemText
              primary="Developer Tasks"
              primaryTypographyProps={{
                fontSize: '0.9375rem',
                fontWeight: isActive('/developer') ? 600 : 400,
              }}
            />
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  );
}

export default Sidebar;
export { DRAWER_WIDTH };

