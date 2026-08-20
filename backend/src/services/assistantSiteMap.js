/** Pathnames the assistant may request for in-app navigation (query strings allowed). */
const ALLOWED_PATHNAMES = new Set([
  '/dashboard',
  '/pipeline',
  '/customers',
  '/calendar',
  '/tasks',
  '/archive',
  '/dead-estimates',
  '/completed-tasks',
  '/completed-jobs',
  '/developer',
  '/payroll',
  '/bills',
  '/finance',
  '/takeoff-sheet',
  '/users',
  '/account-settings',
  '/calendar-view',
  '/pipeline-view',
  '/customers-view',
]);

const SUPER_ADMIN_ONLY_PATHS = new Set(['/developer', '/finance']);

/**
 * @param {string} raw
 * @param {string} [role]
 * @returns {string|null} safe in-app path or null
 */
function sanitizeNavigatePath(raw, role) {
  const s = String(raw || '').trim();
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  const pathname = s.split('?')[0];
  if (!ALLOWED_PATHNAMES.has(pathname)) return null;
  if (SUPER_ADMIN_ONLY_PATHS.has(pathname) && role !== 'super_admin') return null;
  const q = s.includes('?') ? `?${s.split('?').slice(1).join('?')}` : '';
  return pathname + q;
}

const ROUTES_MARKDOWN = `
Main app routes (path → purpose):
- /dashboard — overview and recent activity
- /pipeline — job pipeline board
- /customers — customer list and records
- /calendar — calendar and scheduling
- /tasks — projects and tasks
- /archive — job archive (also /dead-estimates)
- /completed-tasks — completed tasks and appointments
- /completed-jobs — finished closed-out jobs
- /developer — internal developer tasks (super admin only)
- /payroll — payroll tools
- /bills — bills
- /finance — finance hub (super admin only; bank register, deposit linking, payment tracking)
- /takeoff-sheet — takeoff sheet
- /users — user management (admins only)
- /account-settings — profile, password, org logo (super admin)
TV / kiosk-style views:
- /pipeline-view, /calendar-view, /customers-view

The top bar search uses the same tenant-scoped search as your \`global_search\` tool.
Paarth Help can also query recent payments/deposits and search job notes via dedicated tools.
`.trim();

module.exports = {
  ALLOWED_PATHNAMES,
  sanitizeNavigatePath,
  ROUTES_MARKDOWN,
};
