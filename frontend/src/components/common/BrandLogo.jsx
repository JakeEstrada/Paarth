import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { tenantBrandingLogoUrl, DEFAULT_APP_LOGO } from '../../utils/tenantBranding';

/**
 * Tenant/org logo when `tenantId` is set; otherwise default app logo.
 * Uses public branding URL; on 404 or error, shows default asset.
 */
export function BrandLogo({ tenant, tenantId, alt = 'Organization logo', sx, themeMode }) {
  const muiTheme = useTheme();
  const resolvedThemeMode = themeMode || muiTheme.palette.mode || 'light';
  const srcTenant = tenant || tenantId;
  const remote = tenantBrandingLogoUrl(srcTenant, undefined, resolvedThemeMode);
  const [src, setSrc] = useState(remote || DEFAULT_APP_LOGO);

  useEffect(() => {
    setSrc(remote || DEFAULT_APP_LOGO);
  }, [remote, srcTenant]);

  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={sx}
      onError={() => setSrc(DEFAULT_APP_LOGO)}
    />
  );
}

export default BrandLogo;
