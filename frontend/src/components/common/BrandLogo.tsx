import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import { tenantBrandingLogoUrl, DEFAULT_APP_LOGO } from '../../utils/tenantBranding';

export function BrandLogo({
  tenant,
  tenantId,
  alt = 'Organization logo',
  sx,
  themeMode,
  fallbackSrc,
}: {
  tenant?: unknown;
  tenantId?: unknown;
  alt?: string;
  sx?: SxProps<Theme>;
  themeMode?: string;
  fallbackSrc?: string;
}) {
  const muiTheme = useTheme();
  const resolvedThemeMode = themeMode || muiTheme.palette.mode || 'light';
  const srcTenant = tenant || tenantId;
  const remote = tenantBrandingLogoUrl(srcTenant, undefined, resolvedThemeMode);
  const fallback = fallbackSrc || DEFAULT_APP_LOGO;
  const [src, setSrc] = useState(remote || fallback);

  useEffect(() => {
    setSrc(remote || fallback);
  }, [remote, srcTenant, fallback]);

  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={sx}
      onError={() => setSrc(fallback)}
    />
  );
}

export default BrandLogo;
