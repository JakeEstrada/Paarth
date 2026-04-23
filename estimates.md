# Estimates Architecture (Finance Hub)

This document explains how estimates connect to:
- the `Estimates` tab in Finance Hub
- `Job` cards in the pipeline
- database persistence and revision history (`1102-0001`, `1102-0002`, etc.)

It is intended to give ChatGPT enough context to debug estimate issues accurately.

---

## 1) Where estimate data is stored

Estimate data is stored on the **Job document** in MongoDB, not in a separate `Estimate` collection.

Primary schema location:
- `backend/src/models/Job.js`

Relevant fields:
- `job.estimate` (latest/current estimate snapshot)
- `job.estimateHistory` (older snapshots, oldest first)
- `job.valueEstimated` (numeric summary shown on job card/pipeline)

Estimate snapshot schema fields:
- `number` (example: `1102-0001`)
- `amount`
- `sentAt`
- `estimateDate`
- `projectName`
- `footerNote`
- `lineItems[]` with:
  - `itemName`
  - `description`
  - `quantity`
  - `unitPrice` (often `0` in this flow)
  - `total`

Important: there is **no standalone estimate ID**. Revisions are addressed by array position (`revisionIndex`) in history/browse order.

---

## 2) How the Estimates page is connected to jobs

Main frontend file:
- `frontend/src/pages/FinanceHubPage.jsx`

The page uses URL params:
- `tab=estimates`
- optional `jobId=<mongo job _id>`

Behavior:
- If `jobId` exists, Finance Hub loads that job from `GET /jobs/:id` and treats estimates as revisions on that single job.
- If no `jobId`, saving can either:
  - create a new job card (`POST /jobs`)
  - patch an existing selected job (`PATCH /jobs/:id`)

So the estimate page is connected to job cards through `jobId` and `customerId`.

---

## 3) Save flow (new vs existing)

### A) Saving while editing an existing job (`jobId` present)

Frontend function:
- `saveEstimateOnCurrentContext()` in `FinanceHubPage.jsx`

If **new draft revision** (`isNewEstimateDraft === true`):
- Calls `PATCH /jobs/:id` with `estimate` payload
- Backend stacks previous `job.estimate` into `job.estimateHistory` before replacing current

If **editing an existing revision** (`isNewEstimateDraft === false`):
- Calls `PATCH /jobs/:id/estimate-revision`
- Sends `revisionIndex` + `estimate` payload
- Backend updates that exact revision in place (or current if newest index)

### B) Saving with no `jobId` yet

If user chooses “new job card”:
- Calls `POST /jobs` with estimate included
- New job is created with that estimate as current

If user chooses an existing job:
- Calls `PATCH /jobs/:id`
- Estimate becomes current on that selected job

---

## 4) How `1102-0001`, `1102-0002` are stored

Estimate number generation is UI-driven in Finance Hub:
- prefix constant in frontend (`ESTIMATE_PREFIX`, currently `1102`)
- sequence tracked in browser localStorage (`financeHubEstimateSequence`)

What gets persisted:
- The generated number string is stored in the job snapshot field:
  - `job.estimate.number`
  - older copies in `job.estimateHistory[].number`

How revisions are arranged:
- Backend stores older revisions in `estimateHistory` (oldest -> newest old)
- Current newest revision is `job.estimate`
- Frontend builds browse list as:
  - `estimateHistory` + `estimate` (last)

So `1102-0001` and `1102-0002` appear together **only if both were saved on the same job card**.

If one number was saved on Job A and another on Job B, they will not appear as a shared revision chain.

---

## 5) Viewing previous estimates

Frontend revision assembly:
- `buildEstimateRevisions(job)` in `FinanceHubPage.jsx`
- Takes:
  - `job.estimateHistory` (filtered non-empty)
  - appends `job.estimate` if non-empty

Browsing uses:
- `estimateRevisionIndex` (0 = oldest)

Revision update endpoint:
- `PATCH /jobs/:id/estimate-revision`

Revision delete endpoint:
- `POST /jobs/:id/estimate-revision/delete`

---

## 6) Backend endpoints involved

Routes file:
- `backend/src/routes/jobs.js`

Estimate-related endpoints:
- `PATCH /jobs/:id` (create new revision/current estimate)
- `PATCH /jobs/:id/estimate-revision` (edit specific revision)
- `POST /jobs/:id/estimate-revision/delete` (delete specific revision)
- `POST /jobs` (create new job with initial estimate)
- `GET /jobs/:id` (load estimate + history for display)

---

## 7) Common causes of “missing previous estimate”

1. Saved to different job cards
- Same customer but different `jobId` means separate estimate chains.

2. Edited in place instead of creating a new revision
- If user updates existing revision (`estimate-revision` patch), number/history count may not increase.

3. Local sequence confusion
- Number generation is localStorage-based; if browser state changes, number continuity can look odd even though DB snapshots are valid.

4. Empty snapshot filtering
- Frontend intentionally filters “empty” snapshots; partially blank estimates may not show in browse rail.

---

## 8) Quick debugging checklist

For a job with suspected missing estimates:
1. `GET /jobs/:id`
2. Inspect:
   - `estimate`
   - `estimateHistory`
3. Verify each snapshot has:
   - `number`
   - `estimateDate` / `sentAt`
   - `lineItems`
4. Confirm saves were against same `jobId`
5. Confirm UI mode during save:
   - new draft vs edit existing revision

---

## 9) ChatGPT prompt starter

Use this when asking ChatGPT to debug estimate behavior:

> In this app, estimates are embedded on Job docs (`job.estimate` + `job.estimateHistory`) and not in a separate Estimate collection.  
> Save from Finance Hub uses either `PATCH /jobs/:id` (new revision/current replacement with history push) or `PATCH /jobs/:id/estimate-revision` (edit by `revisionIndex`).  
> Revision browse list is `estimateHistory` + current `estimate`.  
> Please analyze why a specific pair like `1102-0001` and `1102-0002` are not both visible, focusing on whether they were saved on different `jobId`s, filtered as empty snapshots, or overwritten via in-place revision edits.

