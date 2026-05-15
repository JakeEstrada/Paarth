import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { createTheme, type Theme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

export interface ThemeModeContextValue {
  mode: PaletteMode;
  toggleColorMode: () => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeModeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>(() => {
    const savedMode = localStorage.getItem('themeMode');
    return savedMode === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('themeMode', mode);
  }, [mode]);

  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
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
          ...(mode === 'dark'
            ? {
                // Slightly brighter than Material “true black” (#121212 / #1E1E1E) — easier on the eyes
                background: {
                  default: '#1b1f27',
                  paper: '#252b36',
                },
                divider: 'rgba(255, 255, 255, 0.09)',
                text: {
                  primary: '#eceff4',
                  secondary: 'rgba(236, 239, 244, 0.72)',
                },
                action: {
                  active: 'rgba(236, 239, 244, 0.65)',
                  hover: 'rgba(255, 255, 255, 0.06)',
                  selected: 'rgba(25, 118, 210, 0.22)',
                  disabledBackground: 'rgba(255, 255, 255, 0.09)',
                },
              }
            : {
                // Light mode palette
                background: {
                  default: '#E9EEF3',
                  paper: '#F6F8FB',
                },
                text: {
                  primary: '#22303A',
                  secondary: '#4D616D',
                },
              }),
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
                boxShadow: mode === 'dark' 
                  ? '0 4px 12px rgba(25, 118, 210, 0.4)'
                  : '0 4px 12px rgba(25, 118, 210, 0.3)',
                '&:hover': {
                  boxShadow: mode === 'dark'
                    ? '0 8px 20px rgba(25, 118, 210, 0.5)'
                    : '0 8px 20px rgba(25, 118, 210, 0.4)',
                },
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 16,
                boxShadow: mode === 'dark'
                  ? '0 2px 12px rgba(0, 0, 0, 0.3)'
                  : '0 2px 12px rgba(0, 0, 0, 0.06)',
                '&:hover': {
                  boxShadow: mode === 'dark'
                    ? '0 8px 24px rgba(0, 0, 0, 0.4)'
                    : '0 8px 24px rgba(0, 0, 0, 0.12)',
                },
              },
            },
          },
          MuiAppBar: {
            styleOverrides: {
              root: {
                background: mode === 'dark'
                  ? 'linear-gradient(135deg, #252b36 0%, #2e3542 100%)'
                  : 'linear-gradient(135deg, #F2F5F9 0%, #E7EDF4 100%)',
                boxShadow: mode === 'dark'
                  ? '0 2px 8px rgba(0, 0, 0, 0.3)'
                  : '0 2px 8px rgba(63, 81, 181, 0.06)',
                color: mode === 'dark' ? '#eceff4' : '#22303A',
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: 'none',
              },
            },
          },
        },
      }),
    [mode]
  );

  const value = {
    mode,
    toggleColorMode,
    theme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

