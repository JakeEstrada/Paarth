import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Box, CircularProgress } from '@mui/material';
import { isKioskViewPath } from '../utils/authSession';

function ProtectedRoute({
  children,
  requireAdmin = false,
  requireSuperAdmin = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
}) {
  const { user, loading, isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    if (isKioskViewPath()) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/login?kiosk=1&redirect=${redirect}`} replace />;
    }
    return <Navigate to="/login" replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin()) {
    return <Navigate to="/pipeline" replace />;
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/pipeline" replace />;
  }

  return children;
}

export default ProtectedRoute;

