import React, { type JSX } from 'react';
import ReactDOM from 'react-dom/client';
import './utils/configureAxios';
import { ThemeProvider as MUIThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import App from './App';

/** Success toasts are silenced app-wide — keep errors/warnings. */
toast.success = ((..._args: unknown[]) => '') as typeof toast.success;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppWithTheme(): JSX.Element {
  const { theme } = useTheme();
  
  return (
    <MUIThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: theme.palette.mode === 'dark' ? '#1E1E1E' : '#FFFFFF',
              color: theme.palette.mode === 'dark' ? '#FFFFFF' : '#263238',
            },
          }}
        >
          {(t) => {
            if (t.type === 'success') {
              toast.dismiss(t.id);
              return null;
            }
            return <ToastBar toast={t} />;
          }}
        </Toaster>
      </AuthProvider>
    </MUIThemeProvider>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing root element #root');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AppWithTheme />
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
