# Paarth → C# / .NET Migration Game Plan

This document is an **instruction manual only**. You will build the new system in a **separate folder/repo** and host it on a **separate URL** (new API + optionally new frontend). The existing Node/React app (`Paarth`) keeps running until you cut over feature-by-feature or all at once.

---

## 1. What you are migrating

| Layer | Today | Target (recommended) |
|--------|--------|----------------------|
| API | Node.js + Express 5 (`backend/`) | **ASP.NET Core 8+ Web API** |
| Database | MongoDB (Mongoose) | **Same MongoDB** via `MongoDB.Driver` (fastest path) |
| Real-time | Socket.IO | **SignalR** (frontend must change client) |
| Files | Multer + AWS S3 | `IFormFile` + **AWSSDK.S3** |
| Auth | JWT (`jsonwebtoken`) | **JWT Bearer** (`Microsoft.AspNetCore.Authentication.JwtBearer`) |
| Frontend | React + Vite (`frontend/`) | **Keep React** on new domain first; point `VITE_API_URL` at new API |
| Hosting | Render (API) + Vercel (UI) | Azure App Service / Render / Fly.io / etc. |

**Optional later:** Blazor or Razor Pages for a fully .NET frontend. Not required for v1.

---

## 2. Recommended strategy (do not rewrite everything day one)

Use a **strangler fig** migration:

1. Create new repo/folder (e.g. `Paarth.Api` or `Paarth-DotNet`).
2. Port **auth + health + tenant context** first; prove React can log in against .NET.
3. Port domains in business order: **Customers → Jobs → Tasks → Files → …**
4. Run **both APIs** during transition; frontend switches `VITE_API_URL` per environment.
5. Cut production DNS only when parity tests pass.

**Rule:** Keep **the same URL paths, HTTP methods, JSON field names, and status codes** unless you intentionally version (`/v2/...`).

---

## 3. New project layout (separate location)

Create something like this **outside** the current `Paarth` tree (sibling folder or new Git repo):

```text
Paarth-DotNet/
├── Paarth.sln
├── src/
│   ├── Paarth.Api/                 # ASP.NET Core host (Program.cs, appsettings)
│   │   ├── Controllers/            # 1:1 with Express routes
│   │   ├── Middleware/
│   │   │   ├── TenantContextMiddleware.cs
│   │   │   └── ExceptionMiddleware.cs
│   │   ├── Hubs/                   # SignalR (replaces socketServer.js)
│   │   └── Program.cs
│   ├── Paarth.Application/         # Use cases, DTOs, validators
│   ├── Paarth.Domain/              # Entities, enums, interfaces
│   └── Paarth.Infrastructure/      # MongoDB, S3, Plaid, Twilio, Google, OpenAI
├── tests/
│   ├── Paarth.Api.Tests/
│   └── Paarth.Infrastructure.Tests/
├── scripts/                        # Port of cloneTenant, backfill, etc.
└── README.md
```

**Scaffold commands (run once on your machine):**

```bash
mkdir Paarth-DotNet && cd Paarth-DotNet
dotnet new sln -n Paarth
dotnet new webapi -n Paarth.Api -o src/Paarth.Api
dotnet new classlib -n Paarth.Domain -o src/Paarth.Domain
dotnet new classlib -n Paarth.Application -o src/Paarth.Application
dotnet new classlib -n Paarth.Infrastructure -o src/Paarth.Infrastructure
dotnet new xunit -n Paarth.Api.Tests -o tests/Paarth.Api.Tests
dotnet sln add src/**/*.csproj tests/**/*.csproj
```

---

## 4. Separate webpage (frontend) setup

You do **not** have to rewrite the UI on day one.

### Option A — Same React app, new deployment (recommended)

1. Copy or branch `frontend/` into a new repo **or** reuse the same repo with a second Vercel project.
2. Set environment on the **new** site:
   - `VITE_API_URL=https://your-new-api.example.com` (or `.../api` if you keep the `/api` prefix)
3. Update **CORS** on the .NET API to allow the new origin:
   - `CORS_ORIGINS=https://your-new-app.example.com`
4. Deploy UI to a new domain (e.g. `app-v2.lit-scww.com`).

### Option B — .NET-hosted SPA

Serve `frontend/dist` from `Paarth.Api` (`app.UseStaticFiles()` + fallback to `index.html`). One host, one domain; still separate from legacy until cutover.

### Files in the **current** frontend that must change for a new API URL

These all use `import.meta.env.VITE_API_URL` (no code change if you only change env at deploy time):

| File | Why it matters |
|------|----------------|
| `frontend/src/utils/axios.ts` | Shared API client + interceptors |
| `frontend/src/utils/configureAxios.ts` | Global axios auth/tenant headers |
| `frontend/src/services/socket.ts` | **Must change** if you move Socket.IO → SignalR |
| `frontend/src/utils/twilioApi.ts` | Path fallback for `/api` prefix |
| `frontend/src/utils/tenantBranding.ts` | Logo URL + `/api` fallback |
| `frontend/src/components/documents/fileExplorer/constants.ts` | Documents API base |
| Every page/component that defines its own `API_URL` (~35 files) | Consolidate to `axios.ts` over time |

**Socket migration (required for live updates):**

| Current | New |
|---------|-----|
| `frontend/src/services/socket.ts` | `@microsoft/signalr` client |
| `frontend/src/hooks/useSocketSubscription.ts` | Subscribe via SignalR hub methods |
| `backend/src/services/socketServer.js` | `Paarth.Api/Hubs/AppHub.cs` |

Until SignalR is done, you can ship .NET API **without** real-time and accept manual refresh.

---

## 5. Environment variables (.env → appsettings)

Map Node `process.env.*` to `appsettings.json` / user secrets / host env vars.

| Node (backend) | .NET config key | Notes |
|----------------|-----------------|--------|
| `MONGODB_URI` | `ConnectionStrings:MongoDB` | Same Atlas cluster during migration |
| `JWT_SECRET` | `Jwt:Secret` | Must match during dual-run if sharing tokens |
| `JWT_REFRESH_SECRET` | `Jwt:RefreshSecret` | |
| `PORT` | `ASPNETCORE_URLS` | e.g. `http://0.0.0.0:4000` |
| `NODE_ENV` | `ASPNETCORE_ENVIRONMENT` | Development / Production |
| `CORS_ORIGINS` | `Cors:Origins` (array) | New frontend URL + local Vite |
| `AWS_ACCESS_KEY_ID` | `Aws:AccessKeyId` | |
| `AWS_SECRET_ACCESS_KEY` | `Aws:SecretAccessKey` | |
| `AWS_S3_BUCKET_NAME` | `Aws:S3Bucket` | |
| `AWS_REGION` | `Aws:Region` | default `us-east-2` |
| `UPLOADS_DIR` | `Storage:LocalUploadsPath` | Dev fallback when S3 off |
| `TWILIO_*` | `Twilio:*` | AccountSid, AuthToken, PhoneNumber |
| `PUBLIC_API_BASE_URL` | `PublicApi:BaseUrl` | Webhooks (SMS status, media) |
| `TWILIO_MEDIA_SECRET` | `Twilio:MediaSecret` | |
| `PLAID_*` | `Plaid:*` | ClientId, secrets per env, webhook URL |
| `GOOGLE_CLIENT_ID` etc. | `GoogleCalendar:*` | |
| `OPENAI_API_KEY` | `OpenAI:ApiKey` | Assistant + activity summaries |
| `RFID_DEVICE_API_KEY` | `Rfid:DeviceApiKey` | Header `x-rfid-api-key` |
| `PUBLIC_API_BASE_URL` | Used by Twilio callbacks | Must point to **new** API when cut over |

Frontend (new deployment):

| Vite | Value |
|------|--------|
| `VITE_API_URL` | New .NET base URL |

---

## 6. NuGet packages (replace npm dependencies)

| npm (backend) | NuGet |
|---------------|--------|
| `express` | Built into ASP.NET Core |
| `mongoose` | `MongoDB.Driver` |
| `jsonwebtoken` | `Microsoft.AspNetCore.Authentication.JwtBearer` + `System.IdentityModel.Tokens.Jwt` |
| `bcryptjs` | `BCrypt.Net-Next` |
| `cors` | `AddCors()` |
| `multer` / `multer-s3` | `IFormFile` + `AWSSDK.S3` |
| `@aws-sdk/client-s3` | `AWSSDK.S3` |
| `socket.io` | `Microsoft.AspNetCore.SignalR` |
| `plaid` | `Going.Plaid` or official Plaid .NET SDK |
| Twilio REST | `Twilio` |
| `googleapis` | `Google.Apis.Calendar.v3` |
| `openai` | `OpenAI` (official) or `Azure.AI.OpenAI` |
| `dotenv` | `appsettings.*.json` + env vars |

---

## 7. Backend file map — what to port (Express → C#)

For each row: **read the Node file → implement equivalent in .NET**. Delete nothing in the old repo until cutover.

### 7.1 Entry & infrastructure

| Current file | .NET target | Instructions |
|--------------|-------------|--------------|
| `backend/src/server.js` | `Program.cs` | Kestrel, CORS, JSON, route prefixes `/` and `/api`, `MapControllers`, `MapHub`, health `/health` |
| `backend/src/middleware/tenantContext.js` | `TenantContextMiddleware.cs` + `AsyncLocal<TenantContext>` | Resolve `x-tenant-id` / `x-tenant-slug`; mirror `runWithTenantContext` |
| `backend/src/middleware/auth.js` | `JwtAuthentication` + auth handler | Bearer token → user; set tenant from user |
| `backend/src/middleware/rfidDeviceAuth.js` | `RfidDeviceAuthAttribute` or middleware | `x-rfid-api-key` |
| `backend/src/middleware/upload.js` | `FileUploadService` + S3 or disk | |
| `backend/src/middleware/uploadTenantLogo.js` | `TenantLogoUploadService` | |
| `backend/src/middleware/uploadUserProfilePhoto.js` | `ProfilePhotoUploadService` | |
| `backend/src/config/s3.js` | `S3StorageService.cs` | `isS3Configured()` parity |
| `backend/src/services/socketServer.js` | `Hubs/AppHub.cs` + `Program.cs` MapHub | Room rules: `tenant:`, `project:`, `task:`, `user:` |
| `backend/src/services/eventBus.js` | `IEventPublisher` / MediatR notifications | If used for cross-module events |
| `backend/src/services/plaidClient.js` | `PlaidClientFactory.cs` | |
| `backend/src/services/plaidRegisterSnapshot.js` | `PlaidRegisterSnapshotService.cs` | |
| `backend/src/utils/generateToken.js` | `JwtTokenService.cs` | Same claims (`userId`, `tenantId`) |
| `backend/src/utils/tenantService.js` | `TenantService.cs` | `ensureTenantBySlug`, default tenant |
| `backend/src/utils/stageConfig.js` | `PipelineStageConfig.cs` | |
| `backend/src/utils/documentSequence.js` | `DocumentSequenceService.cs` | Estimate numbering |

### 7.2 Routes → Controllers (1:1)

| Route file | Controller | Route prefix |
|------------|------------|--------------|
| `routes/auth.js` | `AuthController` | `/auth`, `/api/auth` |
| `routes/tenants.js` | `TenantsController` | `/tenants` |
| `routes/users.js` | `UsersController` | `/users` |
| `routes/customers.js` | `CustomersController` | `/customers` |
| `routes/jobs.js` | `JobsController` | `/jobs` |
| `routes/tasks.js` | `TasksController` | `/tasks` |
| `routes/appointments.js` | `AppointmentsController` | `/appointments` |
| `routes/activities.js` | `ActivitiesController` | `/activities` |
| `routes/files.js` | `FilesController` | `/files` |
| `routes/calendar.js` | `CalendarController` | `/calendar` |
| `routes/bills.js` | `BillsController` | `/bills` |
| `routes/pipelineLayouts.js` | `PipelineLayoutsController` | `/pipeline-layouts` |
| `routes/twilio.js` | `TwilioController` | `/twilio` (webhooks unauthenticated) |
| `routes/plaid.js` | `PlaidController` | `/plaid` |
| `routes/estimates.js` | `EstimatesController` | `/estimates` |
| `routes/invoices.js` | `InvoicesController` | `/invoices` |
| `routes/contracts.js` | `ContractsController` | `/contracts` |
| `routes/assistant.js` | `AssistantController` | `/assistant` |
| `routes/rfid.js` | `RfidController` | `/rfid` |
| `routes/employeeContacts.js` | `EmployeeContactsController` | `/employee-contacts` |
| `routes/developerTasks.js` | `DeveloperTasksController` | `/developer-tasks` |

Register **duplicate prefix** `/api/*` the same way Express does (two `MapControllerRoute` groups or a global `/api` convention).

### 7.3 Controllers (business logic)

| Current controller | .NET service + controller |
|--------------------|---------------------------|
| `authController.js` | `AuthService` |
| `tenantController.js` | `TenantService` (branding logos, pipeline settings) |
| `userController.js` | `UserService` |
| `customerController.js` | `CustomerService` |
| `jobController.js` | `JobService` (largest; stages, archive, estimates on job) |
| `taskController.js` | `TaskService` (projects, notes, updates) |
| `appointmentController.js` | `AppointmentService` |
| `activityController.js` | `ActivityService` (+ OpenAI summary) |
| `fileController.js` | `FileService` (job/task files + document tree) |
| `calendarController.js` | `GoogleCalendarService` |
| `billController.js` | `BillService` |
| `pipelineLayoutController.js` | `PipelineLayoutService` |
| `twilioController.js` | `TwilioSmsService` (+ scheduler background service) |
| `plaidController.js` | `PlaidService` (+ daily refresh `IHostedService`) |
| `estimateController.js` | `EstimateService` |
| `invoiceController.js` | `InvoiceService` |
| `contractController.js` | `ContractService` |
| `assistantController.js` | `AssistantService` |
| `rfidController.js` | `RfidService` |
| `employeeContactController.js` | `EmployeeContactService` |
| `developerTasksController.js` | `DeveloperTaskService` |

### 7.4 Models (Mongoose schemas → C# documents)

| Model file | C# entity | Tenant-scoped? |
|------------|-----------|----------------|
| `Tenant.js` | `Tenant` | No |
| `User.js` | `User` | Yes |
| `Customer.js` | `Customer` | Yes |
| `Job.js` | `Job` | Yes |
| `Task.js` | `Task` | Yes |
| `Appointment.js` | `Appointment` | Yes |
| `Activity.js` | `Activity` | Yes |
| `File.js` | `FileRecord` | Yes |
| `DocumentFolder.js` | `DocumentFolder` | Yes |
| `Bill.js` | `Bill` | Yes |
| `PipelineLayout.js` | `PipelineLayout` | Yes |
| `SmsMessage.js` | `SmsMessage` | Yes |
| `ScheduledSms.js` | `ScheduledSms` | Yes |
| `PlaidRegisterCache.js` | `PlaidRegisterCache` | Yes |
| `Estimate.js` | `Estimate` | Yes |
| `Invoice.js` | `Invoice` | Yes |
| `Contract.js` | `Contract` | Yes |
| `DocumentSequence.js` | `DocumentSequence` | Yes |
| `EmployeeContact.js` | `EmployeeContact` | Yes |
| `DeveloperTask.js` | `DeveloperTask` | Often global |
| `RfidTag.js` / `RfidScan.js` | `RfidTag`, `RfidScan` | Yes |

**Critical:** Port `models/plugins/tenantScopePlugin.js` as a **global MongoDB filter** or repository wrapper that injects `tenantId` on every query (except `bypassTenant` paths used in auth/branding).

### 7.5 Scripts & one-offs (run against same DB)

| Script | Port to |
|--------|---------|
| `scripts/cloneTenant.js` | `dotnet run --project tools/CloneTenant` |
| `scripts/backfillTenantIds.js` | One-time console app |
| `import-csv.js`, `importCSV.js` | Admin CLI or temporary endpoint |
| `scripts/migrateJobEstimates.js` | Migration console |
| `removeDuplicates.js`, `removeCustomersNotInJobs.js` | Do not port unless still needed |

### 7.6 Do **not** copy to production API

| Path | Reason |
|------|--------|
| `backend/test/` | Rewrite as xUnit integration tests |
| `backend/developer-tasks.json` | Dev-only seed |
| `backend/Contact_list_processed.CSV` | Data artifact |
| `test/proto.html` | Unrelated |

---

## 8. API endpoint checklist (parity)

Use this as a acceptance checklist. Full route list lives in `backend/src/routes/*.js`.

**Auth:** register, login, forgot-password/username, reset-password, me, logout, profile, change-password, profile-photo  

**Tenants:** branding logo GET (public), logo upload light/dark, pipeline-settings GET/PATCH  

**Users:** CRUD, employees-for-sms  

**Customers:** CRUD, global-search, upload-csv, jobs by customer  

**Jobs:** CRUD, pipeline summary, archive/dead-estimates/completed, move-stage, invoices on job, admin resets  

**Tasks:** incomplete/completed lists, job tasks, my-tasks, overdue, project conversion, project notes/updates  

**Appointments:** CRUD, complete, cancel, completed list  

**Activities:** recent, date-range, job/customer activities, manual, payroll print, delete, OpenAI summary  

**Files:** upload, upload-document, document tree/folders/text, job/task files, download, patch, delete  

**Calendar:** Google OAuth URL + callback, sync job to calendar  

**Bills, Pipeline layouts, Estimates, Invoices, Contracts:** as per route files  

**Twilio:** inbound webhooks (no auth), send/schedule SMS, messages list/detail/read, MMS upload  

**Plaid:** webhook, link-token, exchange, disconnect, refresh, register-data  

**Assistant:** POST chat  

**RFID:** scans (device key), tags CRUD  

**Developer tasks:** CRUD (often no tenant)  

**Health:** `GET /health` with Mongo + S3 status JSON shape compatible with today.

---

## 9. Phased implementation order

| Phase | Scope | Exit criteria |
|-------|--------|----------------|
| **0** | Solution scaffold, config, logging, `/health` | Deploy empty API |
| **1** | Mongo connection, tenant middleware, JWT auth | React login works against new API |
| **2** | Customers + Jobs + Tasks (read/write) | Pipeline + customers pages work |
| **3** | Files + S3 + static `/uploads` fallback | Job files + documents upload/download |
| **4** | Appointments, Activities, Calendar | Calendar + activity feed work |
| **5** | Finance: Bills, Estimates, Invoices, Contracts, Plaid | Finance hub works |
| **6** | Twilio + SMS scheduler + webhooks | Messages page + Twilio console callbacks |
| **7** | SignalR hub | Live updates without refresh |
| **8** | Assistant, RFID, developer-tasks | Remaining pages |
| **9** | Background jobs (Plaid daily, SMS schedule) | `IHostedService` parity |
| **10** | Decommission Node API | DNS + `VITE_API_URL` final cutover |

---

## 10. MongoDB vs SQL (decision)

| Approach | Pros | Cons |
|----------|------|------|
| **Keep MongoDB** (`MongoDB.Driver`) | No data migration; fastest | Reimplement tenant plugin manually |
| **Move to SQL Server / PostgreSQL** | Strong typing, EF Core migrations | **Large** one-time data migration + every query rewritten |

**Recommendation:** Keep MongoDB for v1. Consider SQL only after .NET API is stable.

---

## 11. Tenant isolation (highest risk)

Express uses `AsyncLocalStorage` in `tenantContext.js` + Mongoose `tenantScopePlugin.js`.

In .NET:

1. `TenantContextMiddleware` reads headers (`x-tenant-id`, `x-tenant-slug`) like `server.js` lines 103–130.
2. Store `TenantId` and `BypassTenant` in `HttpContext.Items` or `AsyncLocal`.
3. Every repository method adds `Builders<T>.Filter.Eq(x => x.TenantId, tenantId)` unless bypass (auth, branding, Twilio webhooks).

**Files that bypass tenant today (must stay bypass):**

- `server.js` paths: `/auth`, `/twilio`, `/tenants/branding`, `/health`, `/developer-tasks`
- `auth.js` `User.findById` with `bypassTenant: true`

---

## 12. Background work (port to `IHostedService`)

| Node | .NET |
|------|------|
| `plaidController.startDailyPlaidRefreshJob` | `PlaidDailyRefreshService : BackgroundService` |
| `twilioController.startSmsScheduler` | `SmsSchedulerService : BackgroundService` |

---

## 13. External integrations — cutover notes

| Integration | When moving API URL |
|-------------|-------------------|
| **Twilio** | Update webhook URLs to new `PUBLIC_API_BASE_URL` (`/twilio/sms`, `/twilio/sms-status`, voice) |
| **Plaid** | Update webhook URL in Plaid dashboard |
| **Google Calendar** | Update OAuth redirect URI to new host |
| **Render/Vercel** | New services; do not delete old until verified |

---

## 14. Testing plan

1. **Contract tests:** Hit Node and .NET with same requests; diff JSON (status, keys).
2. **Postman/Insomnia collection:** Export from current API; run against new base URL.
3. **xUnit integration tests:** `WebApplicationFactory` + test MongoDB database.
4. **Manual smoke (new frontend URL):** Login → pipeline drag → job detail file upload → documents → finance Plaid link → send SMS.
5. **Load:** Job list + file download under tenant filter (no cross-tenant leaks).

Existing Node test to reimplement:

- `backend/test/plaidRegisterData.test.js` → `PlaidRegisterDataTests.cs`

---

## 15. Deployment (separate webpage + API)

### API (.NET)

- Build: `dotnet publish -c Release -o ./publish`
- Run with env vars from section 5.
- Expose same port **4000** internally if you want zero frontend change during dev.
- Enable HTTPS termination at reverse proxy.

### Frontend (new site)

- `npm run build` in `frontend/`
- `VITE_API_URL=https://api-v2.yourdomain.com`
- Deploy `dist/` to Vercel/Netlify/static on Azure.

### CORS

Mirror `server.js`:

- Methods: GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS  
- Headers: `Content-Type`, `Authorization`, `x-tenant-id`, `x-tenant-slug`, `x-socket-id`, `x-rfid-api-key`  
- `credentials: false`

---

## 16. Cutover runbook (production)

1. Deploy .NET API to **staging** URL; point staging frontend `VITE_API_URL` at it.
2. Run parity checklist (section 8) on staging.
3. Copy production Mongo backup (optional snapshot).
4. Update Twilio/Plaid/Google webhooks to production .NET URL **in a maintenance window** or run dual webhook during test.
5. Switch production frontend env to new API **or** swap DNS for new frontend domain.
6. Monitor logs, 401 rate, S3 404s, webhook failures for 24–48h.
7. Keep Node API running read-only 1 week as rollback.
8. Decommission Node when stable.

---

## 17. Optional: consolidate frontend `API_URL`

Today ~35 files duplicate:

```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
```

**Refactor (separate PR on frontend repo):** import `api` from `utils/axios.ts` everywhere. Not required for migration, but reduces env drift between old and new sites.

---

## 18. Out of scope (unless you choose otherwise)

| Item | Location | Note |
|------|----------|------|
| Raspberry Pi RFID script | `scripts/raspberry-pi/rfid_to_paarth.py` | Keep Python; only needs new API URL + key |
| Root `package.json` OpenAI test | `scripts/test-openai.mjs` | Dev utility |
| Shop view / TV mode PINs | `ViewModeFrame.tsx` | Frontend-only |
| React → Blazor rewrite | — | Future project |

---

## 19. Quick reference — current repo roots

| Area | Path |
|------|------|
| Express entry | `backend/src/server.js` |
| All API routes | `backend/src/routes/` |
| All controllers | `backend/src/controllers/` |
| All Mongoose models | `backend/src/models/` |
| React routes | `frontend/src/App.tsx` |
| React API client | `frontend/src/utils/axios.ts`, `configureAxios.ts` |
| Socket client | `frontend/src/services/socket.ts` |

---

## 20. First week checklist (actionable)

- [ ] Create `Paarth-DotNet` folder/repo (separate from this repo).
- [ ] Scaffold solution (section 3).
- [ ] Add `appsettings.Development.json` with Mongo + JWT from current `.env`.
- [ ] Implement `GET /health` and `GET /` message parity.
- [ ] Port `tenantContext` + `auth` + `User`/`Tenant` models.
- [ ] Port `auth` routes; test login from React with `VITE_API_URL=http://localhost:4000` (or new port).
- [ ] Create second Vercel project → new webpage URL.
- [ ] Document Twilio/Plaid webhook URL changes before go-live.

---

*Generated from Paarth codebase inventory (Express backend + React frontend). Update this file when routes or models change.*
