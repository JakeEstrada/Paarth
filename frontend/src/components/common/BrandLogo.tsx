import { useMemo } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import { defaultAppLogoForMode } from '../../utils/tenantBranding';

export function BrandLogo({
  alt = 'Liminnality',
  sx,
  themeMode,
  fallbackSrc,
}: {
  alt?: string;
  sx?: SxProps<Theme>;
  themeMode?: string;
  fallbackSrc?: string;
}) {
  const muiTheme = useTheme();
  const resolvedThemeMode = themeMode || muiTheme.palette.mode || 'light';
  const src = useMemo(
    () => fallbackSrc || defaultAppLogoForMode(resolvedThemeMode),
    [fallbackSrc, resolvedThemeMode]
  );

  return (
    <Box
      component="img"
      key={src}
      src={src}
      alt={alt}
      decoding="async"
      sx={sx}
    />
  );
}

export default BrandLogo;
