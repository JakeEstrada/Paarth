import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { tenantBrandingLogoUrl, DEFAULT_APP_LOGO } from '../../utils/tenantBranding';

/**
 * Tenant/org logo when `tenantId` is set; otherwise default app logo.
 * Uses public branding URL; on 404 or error, shows fallback asset (`fallbackSrc` or default app logo).
 */
export function BrandLogo({ tenant, tenantId, alt = 'Organization logo', sx, themeMode, fallbackSrc }) {
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
