# Estimates Architecture (Finance Hub)

This file documents the **current** estimate implementation used by:
- the `Estimates` tab in `frontend/src/pages/FinanceHubPage.jsx`
- estimate APIs under `backend/src/routes/estimates.js`
- downstream invoice/contract generation from estimates

## 1) Source of truth

Estimates are now first-class documents in MongoDB:
- model: `backend/src/models/Estimate.js`
- collection: `estimates`

Key fields:
- `customerId`, `jobId`
- `estimateNumber` (for example `1102-0001`)
- `prefix`, `sequenceNumber` (server-side numbering metadata)
- `status` (`draft`, `sent`, `approved`, `rejected`, `superseded`, `converted_to_invoice`, `converted_to_contract`, `archived`)
- `estimateDate`, `sentAt`, `approvedAt`, `rejectedAt`, `archivedAt`
- `projectName`, `footerNote`, `notes`
- `lineItems[]` (`itemName`, `description`, `quantity`, `unitPrice`, `total`)
- totals: `subtotal`, `taxRate`, `taxAmount`, `discountAmount`, `grandTotal`
- `derivedDocuments.invoiceIds[]`, `derivedDocuments.contractIds[]`

Tenant scoping:
- `Estimate` uses `tenantScopePlugin`
- unique index is `(tenantId, estimateNumber)`

## 2) Numbering and sequence

Estimate numbers are generated on the backend, not in browser localStorage.

Controller:
- `backend/src/controllers/estimateController.js`

Behavior:
- `createEstimate` calls `getNextDocumentNumber({ documentType: 'estimate', prefix: '1102' })`
- the generated `display` value becomes `estimateNumber`
- `prefix` and `sequenceNumber` are persisted on the estimate record

Admin/safety endpoints exist for sequence maintenance:
- `GET /estimates/admin/sequence-safety`
- `POST /estimates/admin/reset-sequence`
- `POST /estimates/admin/remediate/renumber/:id`
- `POST /estimates/admin/remediate/mark-legacy/:id`

## 3) Finance Hub estimate page flow

Main page:
- `frontend/src/pages/FinanceHubPage.jsx`

URL params used:
- `tab=estimates`
- optional `jobId=<job _id>`

Loading behavior:
- loads job context from `GET /jobs/:id` (for customer/title/stage context)
- loads estimate docs via `GET /estimates?jobId=<jobId>`
- current estimate in the UI is `loadedEstimateDoc` (single estimate document), not `job.estimate`

Save behavior in `saveEstimateOnCurrentContext()`:
- with `jobId`:
  - if no estimate yet (or user started a new draft), create via `POST /estimates`
  - otherwise update current via `PATCH /estimates/:id`
- without `jobId`:
  - may create a new job (`POST /jobs`) then create estimate on it
  - or attach to selected existing job and create/update estimate there

After save/delete:
- page refreshes job context and re-hydrates estimate via `/jobs/:id` + `/estimates?jobId=...`
- `Job.valueEstimated` is updated server-side from estimate `grandTotal`

## 4) Available estimate endpoints

Routes file:
- `backend/src/routes/estimates.js`

Endpoints:
- `GET /estimates` (list/filter by `customerId`, `jobId`, `status`, `search`)
- `POST /estimates` (create)
- `GET /estimates/:id` (detail)
- `PATCH /estimates/:id` (update)
- `DELETE /estimates/:id` (delete)
- `POST /estimates/:id/status` (status transition)
- `POST /estimates/:id/generate-invoice`
- `POST /estimates/:id/generate-contract`

Auth:
- estimate routes currently enforce `requireAuth` with `router.use(requireAuth)`

## 5) Estimate browser behavior in UI

In Finance Hub:
- `loadEstimateBrowser()` pulls rows from `GET /estimates`
- rows are sorted in UI by parsed estimate number, then creation date
- jump-to-number search uses exact match on `estimateNumber`
- older/newer arrows move across estimate documents (not job snapshot revision indices)

Important nuance:
- loading by `jobId` currently hydrates with the first result from `GET /estimates?jobId=...`
- if a job has multiple estimate docs, verify which one the list ordering returns and whether UI should pick newest/active explicitly

## 6) Derived document behavior

From estimate detail UI:
- generate invoice: `POST /estimates/:id/generate-invoice`
- generate contract: `POST /estimates/:id/generate-contract`

Controller side-effects:
- creates `Invoice`/`Contract` docs seeded from estimate totals/line items
- appends created IDs into `estimate.derivedDocuments`
- sets estimate status to `converted_to_invoice` or `converted_to_contract`

Status `sent` side-effect:
- when status changes to `sent`, backend creates an immutable text artifact file marker for audit/history

## 7) Debug checklist (current setup)

For missing or mismatched estimate data:
1. Query `GET /estimates?jobId=<id>` and verify the actual estimate docs in DB.
2. Confirm which estimate record the page loaded (`loadedEstimateDoc`) versus the full list.
3. Verify totals are recomputed from line items on patch (`computeTotals` in controller).
4. Confirm numbering collisions/sequence state using admin safety endpoint.
5. If job card value looks wrong, verify `Job.valueEstimated` after create/update/delete.

---

Use this as the canonical reference for estimate behavior; legacy `job.estimate` snapshot assumptions are no longer the primary flow.

