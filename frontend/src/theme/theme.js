import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976D2',
      light: '#42A5F5',
      dark: '#1565C0',
    },
    secondary: {
      main: '#43A047',
      light: '#66BB6A',
      dark: '#2E7D32',
    },
    background: {
      default: 'linear-gradient(135deg, #F5F7FA 0%, #E8EAF6 100%)',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#263238',
      secondary: '#546E7A',
    },
  },
  typography: {
    fontFamily: 'Roboto, -apple-system, BlinkMacSystemFont, sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 300,
      letterSpacing: '-0.5px',
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 400,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 16,
  },
  shadows: [
    'none',
    '0 2px 8px rgba(0, 0, 0, 0.08)',
    '0 2px 12px rgba(0, 0, 0, 0.06)',
    '0 4px 12px rgba(25, 118, 210, 0.3)',
    '0 8px 24px rgba(0, 0, 0, 0.12)',
    '0 8px 24px rgba(25, 118, 210, 0.15)',
    '0 12px 32px rgba(0, 0, 0, 0.15)',
    '0 16px 40px rgba(0, 0, 0, 0.18)',
    '0 20px 48px rgba(0, 0, 0, 0.20)',
    '0 24px 56px rgba(0, 0, 0, 0.22)',
    '0 28px 64px rgba(0, 0, 0, 0.24)',
    '0 32px 72px rgba(0, 0, 0, 0.26)',
    '0 36px 80px rgba(0, 0, 0, 0.28)',
    '0 40px 88px rgba(0, 0, 0, 0.30)',
    '0 44px 96px rgba(0, 0, 0, 0.32)',
    '0 48px 104px rgba(0, 0, 0, 0.34)',
    '0 52px 112px rgba(0, 0, 0, 0.36)',
    '0 56px 120px rgba(0, 0, 0, 0.38)',
    '0 60px 128px rgba(0, 0, 0, 0.40)',
    '0 64px 136px rgba(0, 0, 0, 0.42)',
    '0 68px 144px rgba(0, 0, 0, 0.44)',
    '0 72px 152px rgba(0, 0, 0, 0.46)',
    '0 76px 160px rgba(0, 0, 0, 0.48)',
    '0 80px 168px rgba(0, 0, 0, 0.50)',
    '0 84px 176px rgba(0, 0, 0, 0.52)',
    '0 88px 184px rgba(0, 0, 0, 0.54)',
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 28,
          padding: '12px 32px',
          fontSize: '0.9375rem',
          fontWeight: 500,
        },
        contained: {
          boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
          '&:hover': {
            boxShadow: '0 8px 20px rgba(25, 118, 210, 0.4)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F8F9FA 100%)',
          boxShadow: '0 2px 8px rgba(63, 81, 181, 0.08)',
          color: '#263238',
        },
      },
    },
  },
});

export default theme;
