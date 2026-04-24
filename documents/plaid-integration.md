# Plaid Integration

This page explains how Plaid is integrated, how data is pulled, and how Finance Hub uses the results.

For a **single end-to-end README** (Finance Hub UI, all endpoints, cache/refresh, balances vs transactions, troubleshooting, and a ChatGPT starter prompt), see [PLAID_FINANCE_HUB_README.md](PLAID_FINANCE_HUB_README.md).

## Integration Summary

Plaid is integrated server-side and tenant-scoped:

- routes: `backend/src/routes/plaid.js`
- controller: `backend/src/controllers/plaidController.js`
- client factory: `backend/src/services/plaidClient.js`
- cache model: `backend/src/models/PlaidRegisterCache.js`
- UI integration: `frontend/src/components/finance/PlaidBankLinkSection.jsx`

## Access Control and Scope

- All Plaid routes use `requireAuth`.
- Only roles `super_admin`, `admin`, `manager` can connect/disconnect bank links.
- Plaid link is stored per tenant on `Tenant.plaidLink`.
- Existing bank link for tenant is replaced when a new link is connected.

## Plaid Environment Configuration

Required server env variables:

- `PLAID_CLIENT_ID`
- `PLAID_ENV` (`sandbox`, `development`, `production`)
- secret:
  - `SANDBOX_SECRET` (sandbox/default)
  - or `PRODUCTION_SECRET` (production)
  - or fallback `PLAID_SECRET`
- optional `PLAID_CLIENT_NAME` for Link branding

`plaidClient` resolves environment and creates a fresh `PlaidApi` instance per call.

## Link Flow (Frontend -> Backend)

1. Frontend requests link token:
- `POST /plaid/link-token`

2. Frontend opens Plaid Link:
- script loaded from Plaid CDN (`frontend/src/utils/plaidLink.js`)
- on success receives `public_token` + institution metadata

3. Frontend exchanges public token:
- `POST /plaid/exchange-public-token`
- backend calls `itemPublicTokenExchange`
- stores tenant-scoped:
  - `itemId`
  - `accessToken` (select:false)
  - institution id/name
  - linked metadata (who + when)
- clears any existing `PlaidRegisterCache` for fresh register rebuild

4. Disconnect flow:
- `POST /plaid/disconnect`
- backend calls `itemRemove` (best effort), unsets tenant plaid link, clears cache

## Register Data Pulling

Endpoint:

- `GET /plaid/register-data`

How data is fetched:

1. Validates tenant has linked `accessToken`.
2. Reads local cache (`PlaidRegisterCache`) for tenant.
3. Uses scheduled-refresh gate:
   - refreshes from Plaid at/after 6:00 AM PT once per day
   - unless caller forces refresh (`refresh=1` or `forceRefresh=1`)
4. On refresh, backend fetches:
   - accounts via `accountsGet`
   - transactions via paginated `transactionsGet`
5. Normalizes transactions and caches snapshot.
6. Returns filtered/sorted view for requested `days`, `accountId`, and `sort`.

Current constants:

- Fetch window from Plaid per refresh: 730 days
- UI response default window: 90 days (unless query overrides)

## Data Returned to UI

`/plaid/register-data` returns:

- `accounts`
- `transactions` (normalized transaction list)
- `range` (requested range)
- `registerSync` metadata:
  - `syncedAt`
  - `source` (`cache` or `plaid`)
  - refresh schedule label
  - next refresh label

## Current Strengths

- Tenant isolation for links and cache.
- Admin/manager role gating for link management.
- Refresh throttling to avoid hitting Plaid on every page view.
- Cache invalidation on account relink/disconnect.

## Known Limitations

1. Single Plaid item per tenant
- Current `Tenant.plaidLink` structure supports one linked institution/item.

2. Cache refresh schedule is fixed
- Daily 6:00 AM PT is hardcoded.

3. Manual operations visibility
- No dedicated admin UI for cache metrics or stale-link diagnostics.

4. Secrets lifecycle
- Env-based secret management; no documented key rotation policy in-app.

## Recommended Next Improvements

### Priority

- Support multiple linked institutions/items per tenant.
- Add admin endpoint/UI for cache health, last sync, and forced refresh.
- Add better user-facing error mapping for common Plaid institution errors.

### Security and operations

- Move secret management to managed secret store and define rotation cadence.
- Add alerting for repeated Plaid fetch failures.
- Add audit events for connect/disconnect/relink actions.

### Product

- Support category mappings and richer transaction enrichment.
- Add ledger reconciliation status (matched/unmatched/internal tags).
