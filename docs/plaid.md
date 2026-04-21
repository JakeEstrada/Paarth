# Plaid integration (Paarth)

This document describes how Plaid is wired in this codebase: configuration, linking a bank, the Finance Hub register, and where data lives.

## Important: not “in memory” for the register

The **bank link** (access token, item id, institution metadata) is stored **in MongoDB** on the `Tenant` document (`plaidLink`).

The **register snapshot** (accounts + normalized transactions used by the Finance Hub) is also **persisted in MongoDB** in the `PlaidRegisterCache` collection. It is **not** kept in server RAM between requests. Each API call loads that document from the database when the cache is still “fresh.”

During a single HTTP request, the Node process holds Plaid responses **temporarily in local variables** while building the JSON response or writing to MongoDB—that is normal request-scoped memory only.

---

## Configuration (backend)

Resolved in `backend/src/services/plaidClient.js`:

| Variable | Role |
|----------|------|
| `PLAID_CLIENT_ID` | Plaid client id (required). |
| `PLAID_ENV` | `sandbox` (default), `development`, or `production` / `prod`. |
| `PLAID_SECRET` | Optional single secret for all envs. |
| `SANDBOX_SECRET` or `PLAID_SANDBOX_SECRET` | Secret when not in production mode (if `PLAID_SECRET` unset). |
| `PRODUCTION_SECRET` or `PLAID_PRODUCTION_SECRET` | Secret when `PLAID_ENV` is production (if `PLAID_SECRET` unset). |
| `PLAID_CLIENT_NAME` | Name shown in Link (optional). |

`isPlaidConfigured()` is true when client id + secret for the resolved environment are present.

---

## API routes

The Plaid router is mounted twice in `backend/src/server.js` (some hosts keep an `/api` prefix):

- `/plaid/*`
- `/api/plaid/*`

All routes use `requireAuth` (JWT). Typical client header: `Authorization: Bearer <token>`, plus tenant context (`x-tenant-id` or slug resolution) like the rest of the app.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/plaid/status` | Whether Plaid is configured, env label, linked institution, `linkedAt`. |
| `POST` | `/plaid/link-token` | Creates a Plaid Link token (admins/managers/managers role set in controller). |
| `POST` | `/plaid/exchange-public-token` | Exchanges `public_token` for `access_token`, saves on tenant, clears register cache. |
| `POST` | `/plaid/disconnect` | Removes Plaid item and clears `plaidLink` + register cache. |
| `GET` | `/plaid/register-data` | Returns accounts + transactions for the register (see below). |

Controller: `backend/src/controllers/plaidController.js`.  
Routes: `backend/src/routes/plaid.js`.

---

## Linking a bank (Plaid Link)

1. **UI** (`frontend/src/components/finance/PlaidBankLinkSection.jsx`) calls `POST /plaid/link-token` and opens Plaid Link with the returned `link_token` (`frontend/src/utils/plaidLink.js`).
2. On success, the UI sends `POST /plaid/exchange-public-token` with `public_token` (and optional institution metadata).
3. **Backend** exchanges the token with Plaid, stores on the tenant:
   - `plaidLink.itemId`, `plaidLink.accessToken` (select: false by default), institution fields, `linkedAt`, `linkedBy`.
4. Any previous item token is removed with Plaid `itemRemove` when replacing a link.
5. **Register cache** documents for that tenant are **deleted** so the next register load pulls a fresh snapshot from Plaid.

Tenant shape (excerpt): `backend/src/models/Tenant.js` → `plaidLink`.

---

## Register data and daily Plaid usage

`GET /plaid/register-data` supports query params such as:

- `days` — date window for the **response** (1–730, default 90).
- `accountId` — optional filter to one account’s transactions in the response.
- `sort` — `asc` or `desc` by transaction date.

### Two layers: Plaid vs Mongo cache

1. **MongoDB cache (`PlaidRegisterCache`)**  
   - One document per `tenantId`.  
   - Fields include `syncedAt`, `accounts`, `transactions` (normalized), and `range` (start/end/fetchedDays for the Plaid pull).  
   - Model: `backend/src/models/PlaidRegisterCache.js`.

2. **Freshness rule**  
   - If a cache row exists and `syncedAt` is **less than 24 hours ago**, the server **does not call Plaid** for transactions. It reads the cache from MongoDB, then **filters** by the requested `days` and `accountId`, and **sorts** for the response.

3. **When Plaid is called**  
   - No cache, or cache older than 24 hours: the server calls Plaid `accountsGet` and paginated `transactionsGet` for up to **730 days** of history (so the UI can change “Window” without another Plaid pull until the next daily refresh).  
   - Results are normalized (id, account, date, name, amount, pending, category) and **written** to `PlaidRegisterCache`, then returned.

4. **Response metadata**  
   - `registerSync.syncedAt` — when the snapshot was produced.  
   - `registerSync.source` — `"cache"` or `"plaid"`.  
   - `registerSync.nextPlaidRefreshAfter` — when a new live Plaid pull is allowed (24h after `syncedAt`).

The Finance Hub UI (`frontend/src/components/finance/RegisterLedgerSection.jsx`) calls this endpoint and shows a short line explaining saved vs live pull.

### Who pays Plaid “per call”

Roughly: **one Plaid refresh per tenant per 24 hours** (when the first eligible request hits after the window). Other register views in that period are **database reads only** (still your server/DB cost, but not repeated Plaid `transactionsGet` loops).

---

## Disconnect

`POST /plaid/disconnect` calls Plaid `itemRemove` when possible, removes `plaidLink` from the tenant, and **deletes** `PlaidRegisterCache` for that tenant so stale data is not shown.

---

## Sandbox vs production

- **Sandbox**: fake institutions and data; typical for development.  
- **Production**: real institutions; requires production keys and correct `PLAID_ENV`.

The status endpoint exposes `environment` so the UI can show a “Production” / “Sandbox” style label.

---

## Related frontend files

- `frontend/src/components/finance/PlaidBankLinkSection.jsx` — connect / disconnect / status.  
- `frontend/src/components/finance/RegisterLedgerSection.jsx` — register table; may try `/plaid/register-data` then `/api/plaid/register-data` on 404.  
- `frontend/src/pages/FinanceHubPage.jsx` — hosts the Register tab and Plaid section.  
- `frontend/src/utils/plaidLink.js` — opens Plaid Link in the browser.

---

## Troubleshooting

- **404 on `/plaid/register-data`**: deploy must include this route; confirm base URL (`VITE_API_URL`) and `/api/plaid` alias if the host prefixes `/api`.  
- **409 “No linked bank”**: tenant has no `plaidLink` access token; complete Link flow.  
- **503 “Plaid not configured”**: missing `PLAID_CLIENT_ID` / secret for the active `PLAID_ENV`.  
- **Stale balances**: account balances in the register response come from the **last snapshot**; they update on the next Plaid refresh (same 24h cadence as transactions).
