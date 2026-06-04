import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import { tenantBrandingLogoUrl, defaultAppLogoForMode } from '../../utils/tenantBranding';

export function BrandLogo({
  tenant,
  tenantId,
  alt = 'Organization logo',
  sx,
  themeMode,
  fallbackSrc,
  preferTenantLogo = false,
}: {
  tenant?: unknown;
  tenantId?: unknown;
  alt?: string;
  sx?: SxProps<Theme>;
  themeMode?: string;
  fallbackSrc?: string;
  /** When true (e.g. Account Settings preview), show uploaded tenant logo instead of static /public files */
  preferTenantLogo?: boolean;
}) {
  const muiTheme = useTheme();
  const resolvedThemeMode = themeMode || muiTheme.palette.mode || 'light';
  const srcTenant = tenant || tenantId;
  const remote = preferTenantLogo
    ? tenantBrandingLogoUrl(srcTenant, undefined, resolvedThemeMode)
    : null;
  const fallback = fallbackSrc || defaultAppLogoForMode(resolvedThemeMode);
  const [src, setSrc] = useState(remote || fallback);
  const [retriedRemote, setRetriedRemote] = useState(false);

  useEffect(() => {
    setRetriedRemote(false);
    setSrc(remote || fallback);
  }, [remote, srcTenant, fallback, resolvedThemeMode]);

  const handleError = () => {
    if (remote && !retriedRemote) {
      setRetriedRemote(true);
      setSrc(tenantBrandingLogoUrl(srcTenant, Date.now(), resolvedThemeMode) || fallback);
      return;
    }
    setSrc(fallback);
  };

  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={sx}
      onError={handleError}
    />
  );
}

export default BrandLogo;
