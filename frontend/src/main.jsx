import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider as MUIThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppWithTheme() {
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
        />
      </AuthProvider>
    </MUIThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
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
