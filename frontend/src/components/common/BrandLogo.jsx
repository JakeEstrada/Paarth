import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { tenantBrandingLogoUrl, DEFAULT_APP_LOGO } from '../../utils/tenantBranding';

/**
 * Tenant/org logo when `tenantId` is set; otherwise default app logo.
 * Uses public branding URL; on 404 or error, shows default asset.
 */
export function BrandLogo({ tenant, tenantId, alt = 'Organization logo', sx }) {
  const srcTenant = tenant || tenantId;
  const remote = tenantBrandingLogoUrl(srcTenant);
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
