import { useMediaQuery, useTheme } from '@mui/material';

/** True on phone/small-tablet widths (below the `md` breakpoint). */
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

export default useIsMobile;
