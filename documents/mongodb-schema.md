# MongoDB Schema and Data Relationships

This page summarizes how MongoDB is structured in Paarth, how documents reference each other, and how tenant-scoped storage works.

## Core Storage Pattern

- Database access is Mongoose-based.
- Most business models use `tenantScopePlugin`, which:
  - adds `tenantId`
  - auto-filters queries by current tenant context
  - auto-applies tenant match to aggregate pipelines
- Tenant context is resolved per request (`x-tenant-id` / slug logic in `backend/src/server.js` + async context middleware).

## Primary Models and References

### Tenant / User

- `Tenant`
  - org metadata, branding, plaid link metadata
- `User`
  - references `Tenant` via tenant plugin field
  - role-based access model
  - bcrypt-hashed password
  - unique index: `(tenantId, email)`

### Customer / Job

- `Customer`
  - contact details, addresses, source, notes
  - `createdBy -> User`
- `Job`
  - `customerId -> Customer` (required)
  - optional `assignedTo -> User`
  - schedule, calendar sync metadata, stage tracking, value fields
  - legacy embedded estimate snapshots are retained for compatibility but deprecated
  - optional `pipelineLayoutId -> PipelineLayout`
  - notes include `createdBy -> User`

### Estimate / Invoice / Contract

- `Estimate`
  - `customerId -> Customer`
  - `jobId -> Job`
  - `createdBy/updatedBy -> User`
  - numbering fields (`estimateNumber`, `prefix`, `sequenceNumber`)
  - derived-doc refs (`invoiceIds -> Invoice`, `contractIds -> Contract`)
- `Invoice`
  - `customerId -> Customer`
  - `jobId -> Job`
  - `estimateId -> Estimate`
  - `createdBy/updatedBy -> User`
- `Contract`
  - `customerId -> Customer`
  - `jobId -> Job`
  - `estimateId -> Estimate`
  - `createdBy/updatedBy -> User`

### Tasks / Projects / Appointments / Activity

- `Task`
  - optional `jobId -> Job`
  - optional `customerId -> Customer`
  - optional `projectTaskId -> Task` (project/task hierarchy)
  - `assignedTo`, `completedBy`, `createdBy`, note/update authors -> `User`
- `Appointment`
  - optional `jobId -> Job`
  - optional `customerId -> Customer`
  - `createdBy -> User`
- `Activity`
  - audit timeline records
  - optional refs to `Job`, `Task`, `Customer`, `File`
  - `createdBy -> User`

### Files / Documents

- `DocumentFolder`
  - hierarchical folder tree with `parentId -> DocumentFolder`
  - `createdBy -> User`
  - unique index per tenant: `(tenantId, parentId, name)`
- `File`
  - optional refs:
    - `jobId -> Job`
    - `taskId -> Task`
    - `customerId -> Customer`
    - `folderId -> DocumentFolder`
  - `uploadedBy -> User`
  - supports local and S3 storage fields (`path`, optional `s3Key`)

### Finance supporting models

- `Bill` (tenant-scoped recurring bill metadata; no direct refs)
- `PlaidRegisterCache`
  - one cache doc per tenant
  - `tenantId -> Tenant` (unique)
- `DocumentSequence`
  - per-tenant numbering cursor by `documentType` (estimate/invoice/contract)

### Pipeline/UI metadata

- `PipelineLayout`
  - tenant-defined stage layout for pipeline UI
- `DeveloperTask`
  - standalone dev task list model (not tenant-scoped in current implementation)

## How Data Is Stored and Queried

1. Tenant-aware models
- For plugin-backed models, writes auto-fill `tenantId` when context is present.
- Reads and updates are auto-filtered by `tenantId` unless `bypassTenant` is set.

2. Mixed relational/embedded approach
- Main relationships are ObjectId refs.
- Some operational snapshots remain embedded (e.g., job schedule entries, notes arrays).

3. Document numbering
- `DocumentSequence` tracks next number per tenant and type.
- Created docs copy final number into immutable doc fields.

4. File storage indirection
- Mongo stores metadata and path/s3 key.
- Binary lives in filesystem or S3.

## Common Query Paths

- Customer-centric:
  - `Customer -> Jobs -> Estimates/Invoices/Contracts/Files/Activities`
- Job-centric:
  - `Job -> schedule/calendar/takeoff -> linked Estimate/Invoice/Contract records`
- Tenant-centric:
  - all plugin-backed records constrained by `tenantId`

## Recommended Schema/Storage Improvements

### Priority

- Add tenant scoping to `DeveloperTask` if tasks should be org-isolated.
- Add explicit schema-level validators for important financial fields and stage transitions.
- Add more unique constraints where business identity requires it.

### Data integrity

- Add migration plan to fully retire legacy `job.estimate` snapshot fields.
- Add foreign-key-like cleanup jobs for orphaned refs (files/tasks/activities pointing to removed parents).

### Performance

- Review slow queries and add compound indexes for common filtered sorts (especially large tenant datasets).
- Consider pagination defaults on heavy list endpoints if not already enforced.
