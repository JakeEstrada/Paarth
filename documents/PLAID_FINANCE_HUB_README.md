# Plaid + Finance Hub — Full integration README (for engineers / ChatGPT)

This document describes **how Plaid is wired into Paarth’s Finance Hub**, end-to-end: UI, API, data storage, caching, refresh rules, error cases, and how to debug when “transactions look right but balance does not” or when Link fails in the browser.

Use it as the **single source of truth** when asking another assistant (e.g. ChatGPT) to help debug production issues.

---

## 1) What the user sees (Finance Hub)

**Route / page**

- Finance Hub page: `frontend/src/pages/FinanceHubPage.jsx`
- The **Register (Balance Sheet)** tab embeds `RegisterLedgerSection`.

**Register UI**

- Component: `frontend/src/components/finance/RegisterLedgerSection.jsx`
- Renders:
  - Plaid status + gear menu via `PlaidBankLinkSection` (variant `titleRight` in Finance Hub header row)
  - Account picker (`accountId`)
  - Date window (`days`: 30 / 90 / 180 / 365 / 730)
  - Sort toggle (oldest vs newest)
  - Search filter (client-side)
  - **Balance** banner: uses `selectedAccount.balances.current` from the `accounts[]` payload
  - Transaction table: built from normalized `transactions[]` returned by the API
  - A separate **Refresh** icon button (circular arrows) that calls `loadRegister({ forceRefresh: true })`

**Plaid controls (gear icon)**

- Component: `frontend/src/components/finance/PlaidBankLinkSection.jsx`
- Gear menu actions (when user has permission):
  - **Refresh latest data** → calls parent `onRefreshData()` (Finance Hub wires this to `loadRegister({ forceRefresh: true })`)
  - **Reconnect account** → Plaid **update mode** re-authentication (`POST /plaid/link-token` with body `{ update: true }`)
  - **Disconnect account** → removes Plaid item + clears local cache

**Who can manage Plaid**

- Roles allowed to link / disconnect / update: `super_admin`, `admin`, `manager` (see `LINK_ROLES` in `plaidController.js` and matching set in `PlaidBankLinkSection.jsx`).

---

## 2) High-level architecture

```
Browser (Finance Hub)
  ├─ axios (Bearer JWT + optional x-tenant-id from configureAxios)
  ├─ Plaid Link script: cdn.plaid.com/link/v2/stable/link-initialize.js
  └─ POST/GET /plaid/*

Express API
  ├─ routes: backend/src/routes/plaid.js (requireAuth on all)
  ├─ controller: backend/src/controllers/plaidController.js
  ├─ Plaid client: backend/src/services/plaidClient.js
  └─ MongoDB
        ├─ Tenant.plaidLink (itemId + accessToken + institution metadata)
        └─ PlaidRegisterCache (per-tenant snapshot of accounts + transactions)
```

**Important:** Plaid secrets and `access_token` never go to the browser. Only `link_token` and `public_token` cross the wire during Link.

---

## 3) Environment variables (backend)

Configured in `backend/src/services/plaidClient.js`:

| Variable | Purpose |
|----------|---------|
| `PLAID_CLIENT_ID` | Plaid client id |
| `PLAID_ENV` | `sandbox` (default), `development`, or `production` |
| `PLAID_SECRET` | Optional single secret for all envs |
| `SANDBOX_SECRET` or `PLAID_SANDBOX_SECRET` | Secret when not using `PLAID_SECRET` in sandbox/dev |
| `PRODUCTION_SECRET` or `PLAID_PRODUCTION_SECRET` | Secret when `PLAID_ENV` is production |
| `PLAID_CLIENT_NAME` | Optional; shown in Link UI (`client_name`) |

`isPlaidConfigured()` returns true only when client id + resolved secret exist.

---

## 4) HTTP API contract (base URL)

The frontend uses `VITE_API_URL` (often `https://api.example.com` or `http://localhost:4000`). Some deployments also mount routes under `/api`; `RegisterLedgerSection` falls back if `/plaid/register-data` 404s.

### `GET /plaid/status`

- **Auth:** required (`requireAuth`)
- **Returns:** `{ configured, environment, linked, institutionName, institutionId, linkedAt }`
- **Reads:** `Tenant` without selecting `accessToken` (token is `select: false` in schema).

### `POST /plaid/link-token`

- **Auth:** required + finance role
- **Body (optional):** `{ "update": true }` for **update / re-auth mode**
- **Returns:** `{ link_token, expiration, mode: "create" | "update" }`

**Create mode (first link or full new link after disconnect)**

- Calls Plaid `linkTokenCreate` with:
  - `products: [Transactions]`
  - `country_codes: [US]`
  - `user.client_user_id` = `${tenantId}:${userId}`

**Update mode (re-authenticate existing item)**

- Loads existing `Tenant.plaidLink.accessToken`
- Calls Plaid `linkTokenCreate` with:
  - `access_token` set to existing token
  - **No `products` field** (update-mode payload; avoids invalid “new link + access_token” combinations that can 500)

### `POST /plaid/exchange-public-token`

- **Auth:** required + finance role
- **Body:** `{ public_token, institution_id?, institution_name? }`
- **Behavior:**
  - `itemPublicTokenExchange` → new `access_token` + `item_id`
  - If tenant already had a token, best-effort `itemRemove` on the old token
  - Saves `tenant.plaidLink` (itemId, accessToken, institution fields, linkedAt, linkedBy)
  - Deletes all `PlaidRegisterCache` docs for that tenant (forces fresh snapshot on next register load)

### `POST /plaid/disconnect`

- **Auth:** required + finance role
- **Behavior:** `itemRemove` best-effort, `$unset` `plaidLink`, delete register cache

### `GET /plaid/register-data`

- **Auth:** required (any authenticated user with tenant — not only finance role)
- **Query params:**
  - `days` — 1..730, default **90** (this is the **UI window** for returned transactions)
  - `sort` — `asc` or `desc` (default `asc` in controller)
  - `accountId` — optional filter to one Plaid account id
  - `refresh=1` or `refresh=true` or `forceRefresh=1` — **forces live Plaid pull** and cache rebuild

**Response shape (conceptual)**

```json
{
  "sort": "desc",
  "range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "days": 90 },
  "accounts": [ { "account_id", "name", "official_name", "subtype", "type", "mask", "balances" } ],
  "transactions": [ { "transaction_id", "account_id", "date", "name", "amount", "pending", ... } ],
  "registerSync": {
    "syncedAt": "ISO-8601",
    "source": "cache" | "plaid",
    "refreshSchedule": "Daily at 06:00 PT",
    "nextPlaidRefreshLabel": "Today at 6:00 AM PT" | "Tomorrow at 6:00 AM PT"
  }
}
```

---

## 5) Register cache + refresh rules (critical)

### Cache model

- `backend/src/models/PlaidRegisterCache.js`
- One document per `tenantId` (unique)
- Stores:
  - `syncedAt`
  - `accounts` (normalized subset)
  - `transactions` (full normalized list for the **fetch window**, see below)
  - `range` metadata from last Plaid fetch

### When the API hits Plaid vs serves cache

Implemented in `getRegisterData()`:

1. If **no** `forceRefresh` query AND cache exists AND `shouldRefreshAtScheduledTime(cache.syncedAt)` is **false**  
   → return **`source: "cache"`** (no Plaid network call for transactions snapshot)

2. Otherwise (no cache, stale per schedule, or `refresh=1`)  
   → call `fetchRegisterSnapshotFromPlaid()` → upsert cache → return **`source: "plaid"`**

### Scheduled refresh (cost control)

Constants in `plaidController.js`:

- `REGISTER_REFRESH_HOUR = 6` (Pacific)
- `REGISTER_REFRESH_TIMEZONE = 'America/Los_Angeles'`

Logic summary:

- After 6:00 AM PT on a calendar day, if the cache was last synced **before** that day’s 6:00 AM PT boundary, the next register load will refresh from Plaid.
- This is intentionally **once per day** style behavior (not “every page load”).

### Forced refresh (user / gear / refresh icon)

Any of:

- `refresh=1`, `refresh=true`, `forceRefresh=1`, `forceRefresh=true`

Forces a live Plaid pull and rebuilds cache.

---

## 6) What Plaid calls are made on refresh

Function: `fetchRegisterSnapshotFromPlaid()`

### Accounts / balances

- Default path: `accountsGet`
- If `preferLiveBalances` is true (forced refresh path): **`accountsBalanceGet` first**, fallback to `accountsGet` on error

Forced refresh sets:

```js
preferLiveBalances: forceRefresh
```

**Why this matters:** transaction pulls can look “fresh” while `balances.current` from `accountsGet` can lag; `accountsBalanceGet` is used to reduce that mismatch when the user explicitly refreshes.

### Transactions

- Uses `transactionsGet` in a pagination loop (`count: 500`, increasing `offset` until `total_transactions`).

### Fetch window vs UI window

- **Plaid fetch window:** `REGISTER_PLAID_FETCH_DAYS = 730` days of history pulled and stored in cache when refreshing from Plaid.
- **UI window:** `days` query param filters cached transactions down to the last N days for display.

So: changing the dropdown does **not** necessarily hit Plaid again unless cache is stale or user forces refresh.

---

## 7) Transaction normalization (Finance Hub semantics)

Each stored transaction row includes (subset):

- `transaction_id`, `account_id`, `date`, `name`, `amount`, `pending`, `category`, etc.

**UI running balance sign**

In `RegisterLedgerSection`, running balance uses:

```js
const signed = -Number(t.amount || 0); // Plaid positive amount = outflow
```

So the ledger “running balance” is computed from **Plaid’s signed amount convention flipped** for display.

**Important:** The **big balance banner** is **not** recomputed from those rows; it shows `balances.current` from Plaid accounts payload. That is why you can see “transactions reconcile / look right” while the headline balance still disagrees with your bank app until balances refresh / institution updates.

---

## 8) Link + re-auth flows (Finance Hub)

### First-time connect

1. `POST /plaid/link-token` (create mode)
2. Browser opens Plaid Link (`frontend/src/utils/plaidLink.js`)
3. `onSuccess` → `POST /plaid/exchange-public-token`
4. Next register load pulls Plaid snapshot (or uses cache per rules)

### Re-authenticate (update mode) — preferred over disconnect

1. `POST /plaid/link-token` with `{ update: true }`
2. Plaid Link opens in update mode for the existing `access_token`
3. `onSuccess` → `exchange-public-token` again (same as connect) to persist the new token if Plaid rotated it / completed update (current app always exchanges on success)

If update token creation fails, check server logs for Plaid `error_code` / `error_message` in `createLinkToken` catch.

---

## 9) Common errors and what they mean

### `409` + `code: ITEM_LOGIN_REQUIRED` on register refresh

Handled in `getRegisterData()`:

- Means Plaid needs the user to re-authenticate the bank connection.
- Finance Hub maps this to UI text suggesting gear → **Reconnect account** (update mode).

### `503` Plaid not configured

- Missing `PLAID_CLIENT_ID` / secret resolution on server.

### `409` No linked bank

- Tenant has no `plaidLink.accessToken`.

### Browser console noise during Plaid Link

Users often paste logs like:

- “Cookie rejected SameSite”
- “Partitioned cookie / third-party context”
- CSP warnings inside Plaid iframe
- “unreachable code after return” inside `vendors~flink.js`

These are **usually benign** and come from Plaid’s hosted Link assets + browser privacy features. The actionable signal is usually the **XHR status** from your API (`/plaid/link-token`, `/plaid/exchange-public-token`, `/plaid/register-data`).

### Strict CSP on your own domain

If your **site** CSP blocks inline handlers or third-party scripts beyond what Plaid needs, Link can break. Plaid’s iframe may still load but your domain’s CSP can block ancillary scripts (seen as CSP violations referencing non-Plaid domains). Fix is **hosting/CSP policy**, not the Plaid controller.

---

## 10) Debugging checklist (copy/paste for incidents)

1. Confirm user role can manage link (`super_admin` / `admin` / `manager`).
2. Call `GET /plaid/status` — is `configured: true` and `linked: true`?
3. Call `GET /plaid/register-data?refresh=1&days=90` — does `registerSync.source` return `plaid`?
4. Compare:
   - `accounts[].balances.current` vs bank app “available” vs “current”
   - note pending transactions (`pending: true`)
5. If errors: read Plaid `error_code` from server logs (`error.response.data` in controller logs).
6. If `ITEM_LOGIN_REQUIRED`: run update-mode link (`POST /plaid/link-token` with `{update:true}`).

---

## 11) Known product limitations (current code)

- **One Plaid Item per tenant** (`Tenant.plaidLink` is a single embedded object).
- **No Plaid webhooks** in this codebase path — refresh is **polling + daily schedule + manual refresh**, not real-time push.
- **Transactions API** (`transactionsGet`) — not `transactions/sync` cursor model (fine for many cases; cursor+webhook is the long-term scalable approach).

---

## 12) ChatGPT prompt starter (paste with this file)

> I’m working on Paarth, a React (Vite) + Express + MongoDB app. Finance Hub embeds `RegisterLedgerSection` which calls `GET /plaid/register-data` with optional `refresh=1`. Plaid link tokens come from `POST /plaid/link-token` (create vs `{update:true}` update mode). Tenant stores `plaidLink.accessToken` on `Tenant` and caches register snapshots in `PlaidRegisterCache`. Daily auto-refresh is gated to 6:00 AM PT; manual refresh forces Plaid and uses `accountsBalanceGet` then `transactionsGet`. The UI shows `balances.current` for the headline balance but computes running totals from transactions using `signed = -amount`.  
>  
> Problem: **[describe mismatch / error / 500 / stale cache]**  
>  
> Please diagnose using `documents/PLAID_FINANCE_HUB_README.md` and suggest the smallest code or infra fix.

---

*Generated for the Paarth codebase. Update this file when Plaid flows, cache policy, or Finance Hub UI changes.*
