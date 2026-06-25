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

/**
 * @param {string} raw
 * @returns {string|null} safe in-app path or null
 */
function sanitizeNavigatePath(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  const pathname = s.split('?')[0];
  if (!ALLOWED_PATHNAMES.has(pathname)) return null;
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
- /developer — internal developer tasks
- /payroll — payroll tools
- /bills — bills
- /finance — finance hub
- /takeoff-sheet — takeoff sheet
- /users — user management (admins only)
- /account-settings — profile, password, org logo (super admin)
TV / kiosk-style views:
- /pipeline-view, /calendar-view, /customers-view

The top bar search uses the same tenant-scoped search as your \`global_search\` tool.
`.trim();

module.exports = {
  ALLOWED_PATHNAMES,
  sanitizeNavigatePath,
  ROUTES_MARKDOWN,
};
