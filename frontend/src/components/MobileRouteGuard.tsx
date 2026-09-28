import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';
import { MOBILE_HOME_PATH, isMobileAllowedPath } from '../utils/mobileNav';

/** Keeps phones on the mobile-friendly pages; everything else lands on the pipeline. */
function MobileRouteGuard({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const location = useLocation();

  if (isMobile && !isMobileAllowedPath(location.pathname)) {
    return <Navigate to={MOBILE_HOME_PATH} replace />;
  }

  return <>{children}</>;
}

export default MobileRouteGuard;
