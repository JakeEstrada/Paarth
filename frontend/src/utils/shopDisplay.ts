export const SHOP_DISPLAY_VIEW_PATHS = [
  '/pipeline-view',
  '/calendar-view',
  '/customers-view',
] as const;

export function isShopDisplayPath(pathname: string): boolean {
  const path = String(pathname || '');
  return SHOP_DISPLAY_VIEW_PATHS.some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

export function shopDisplayCustomerPath(customerId: string): string {
  return `/customers-view?customerId=${encodeURIComponent(String(customerId))}`;
}

export function shopDisplayCalendarPath(): string {
  return '/calendar-view';
}
