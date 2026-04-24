# Security Architecture and Next Steps

This page documents security protocols currently implemented in the Paarth codebase, plus recommended hardening work to prioritize.

## Current Security Protocols in Use

### 1) Authentication and authorization

- Auth is JWT-based (`backend/src/utils/generateToken.js`).
- Protected routes use `requireAuth` middleware (`backend/src/middleware/auth.js`).
- Access token is expected in `Authorization: Bearer <token>`.
- `requireAuth` validates token, loads active user, and attaches `req.user`.
- Role checks exist in feature controllers (example: Plaid actions require `super_admin`, `admin`, or `manager`).

### 2) Password handling

- Passwords are hashed with bcrypt (`backend/src/models/User.js`).
- Hashing is enforced by `pre('save')` hook.
- Password comparisons use bcrypt compare helper (`comparePassword`).
- User JSON serialization removes `password` field before returning to clients.

### 3) Tenant isolation

- Multi-tenant scoping is enforced by `tenantScopePlugin` + `AsyncLocalStorage` tenant context.
- Most core models include `tenantId` and get automatic query filtering unless `bypassTenant` is explicitly set.
- Tenant is resolved from `x-tenant-id` or slug headers in server middleware (`backend/src/server.js`).
- Frontend axios interceptor automatically sends `x-tenant-id` when present (`frontend/src/utils/configureAxios.js`).

### 4) CORS controls

- CORS is explicitly configured in `backend/src/server.js`.
- Allowed origins come from `CORS_ORIGINS` (with local dev fallbacks in non-production).
- Allowed headers include `Authorization`, `x-tenant-id`, and `x-tenant-slug`.
- Cookies are intentionally disabled (`credentials: false`) and auth is header-based.

### 5) File handling protections

- Upload routes validate mime types (notably for document uploads).
- Folder IDs are validated before assigning uploaded files.
- File deletion attempts to remove both DB metadata and binary (local/S3).
- Text file names and path segments are sanitized before write.

### 6) Operational safety checks

- API returns `503` when MongoDB is unavailable for most routes.
- Health endpoint provides Mongo/S3 diagnostics.
- Some endpoints include user-existence ambiguity protections (forgot password flow avoids revealing whether user exists).

## Known Security Gaps / Risk Areas

### High priority

1. `files` routes currently do not enforce `requireAuth`
- In `backend/src/routes/files.js`, auth middleware is commented out.
- This likely exposes document/file operations unless protected upstream.

2. No centralized rate limiting
- No global or route-specific rate limiting for auth, file upload, or high-cost endpoints.

3. Weak password policy baseline
- Minimum length is 6; no complexity/denylist policy.

4. Password reset flow is incomplete
- `resetPassword` currently allows direct reset by email and does not require a signed one-time token.

### Medium priority

5. Missing security headers
- No `helmet` middleware currently configured.

6. Token/session hardening
- No access token rotation or refresh-token revocation list.
- Refresh token is returned but server-side invalidation strategy is not implemented.

7. Limited audit coverage
- Activity logging exists, but not all sensitive operations appear consistently audited (auth events, admin changes, tenant config changes).

8. Secret-management posture
- Secrets appear env-based; no documented rotation cadence or KMS/secret manager integration.

## Recommended Security Procedures (Next Phase)

## Phase 1 (Immediate)

- Re-enable auth on `/files` routes and verify all read/write operations require valid JWT.
- Add express rate limiting for:
  - `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`
  - file upload routes
  - Plaid and calendar sync routes
- Implement proper reset-password token flow:
  - signed, single-use token
  - expiry (15-30 minutes)
  - email delivery pipeline
- Raise password requirements (length >= 10 and basic complexity checks).

## Phase 2 (Hardening)

- Add `helmet` with explicit CSP, frameguard, and no-sniff policy.
- Add request payload size limits and upload anti-abuse controls.
- Add structured security audit logs for:
  - login success/failure
  - role/permission changes
  - tenant switching and tenant-admin actions
  - document delete and external integration actions
- Introduce refresh-token invalidation/rotation and forced logout on password change.

## Phase 3 (Governance)

- Publish security runbook:
  - incident response
  - credential leak response
  - periodic key rotation
  - backup/restore test cadence
- Add dependency and secret scanning in CI.
- Add periodic access review for all admin/manager users per tenant.

## Quick Verification Checklist

1. Confirm protected routes always include `requireAuth`.
2. Confirm tenant isolation for all tenant-scoped models.
3. Confirm no sensitive fields are returned in API responses.
4. Confirm CORS origin list is restricted in production.
5. Confirm reset-password requires signed token flow.
