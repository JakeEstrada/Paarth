# Paarth CRM - Complete Deployment Breakdown

## Project Overview

**Paarth** is a full-stack Customer Relationship Management (CRM) system built for San Clemente Woodworking. It's a production-ready application that manages customers, jobs, appointments, tasks, payroll, and file uploads.

**Application Type:** Full-stack web application (MERN-like stack)
**Current Status:** Development/Production-ready
**Deployment Target:** Cloud hosting (AWS, Railway, Render, etc.)

---

## Architecture Overview

### System Architecture
```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   React Frontend │ ◄─────► │  Express Backend │ ◄─────► │   MongoDB       │
│   (Port 5173)    │  REST   │   (Port 4000)    │  ODM    │   Database      │
│   Vite + React   │   API    │   Node.js/Express│         │   (Atlas/Local) │
└─────────────────┘         └─────────────────┘         └─────────────────┘
         │                        │
         │                        │
         ▼                        ▼
┌─────────────────┐         ┌─────────────────┐
│   Material-UI    │         │  Google Calendar│
│   Components     │         │  API (OAuth 2.0)│
└─────────────────┘         └─────────────────┘
```

### Communication Flow
- **Frontend → Backend:** REST API calls via Axios
- **Backend → Database:** Mongoose ODM
- **Backend → Google Calendar:** OAuth 2.0 API integration
- **File Storage:** Currently local filesystem (`backend/uploads/`)

---

## Tech Stack

### Frontend
- **Framework:** React 19.2.0
- **Build Tool:** Vite 7.2.4
- **UI Library:** Material-UI (MUI) v7.3.7
- **Routing:** React Router v7.12.0
- **HTTP Client:** Axios 1.13.2
- **State Management:** React Context API + React Query 5.90.19
- **Drag & Drop:** @dnd-kit (for pipeline board)
- **Date Handling:** date-fns 4.1.0
- **Notifications:** react-hot-toast 2.6.0
- **Language:** JavaScript (with TypeScript config files)

### Backend
- **Runtime:** Node.js
- **Framework:** Express 5.2.1
- **Database:** MongoDB (via Mongoose 9.1.5)
- **Authentication:** JWT (jsonwebtoken 9.0.3)
- **Password Hashing:** bcryptjs 3.0.3
- **File Upload:** Multer 2.0.2
- **CORS:** cors 2.8.5
- **Environment:** dotenv 17.2.3
- **Google APIs:** googleapis 170.1.0

---

## Project Structure

### Frontend Structure (`/frontend`)
```
frontend/
├── public/
│   ├── logo.png
│   └── vite.svg
├── src/
│   ├── components/
│   │   ├── appointments/      # Appointment modals and lists
│   │   ├── customers/         # Customer management components
│   │   ├── jobs/              # Job detail modals, forms, notes
│   │   ├── layout/            # MainLayout, Sidebar, TopBar
│   │   ├── pipeline/          # Pipeline board (kanban), JobCard
│   │   ├── tasks/             # Task components
│   │   └── todos/             # Todo list components
│   ├── pages/                 # Route-level pages
│   │   ├── BillsPage.jsx
│   │   ├── CalendarPage.jsx
│   │   ├── CustomersPage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── PayrollPage.jsx    # Timesheet with gas rate (0.725/mile)
│   │   ├── PipelinePage.jsx   # Main kanban board
│   │   ├── TasksPage.jsx
│   │   └── UsersPage.jsx
│   ├── context/
│   │   └── AuthContext.jsx    # Authentication state
│   ├── services/              # API service layer (if any)
│   ├── theme/
│   │   └── theme.js           # MUI theme config
│   ├── utils/
│   │   └── axios.js           # Axios instance with interceptors
│   ├── App.jsx                # Main app component with routes
│   ├── main.jsx               # Entry point
│   └── index.css
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json              # TypeScript config (but using JS)

### Backend Structure (`/backend`)
```
backend/
├── src/
│   ├── controllers/           # Business logic
│   │   ├── authController.js
│   │   ├── customerController.js
│   │   ├── jobController.js
│   │   ├── fileController.js
│   │   ├── taskController.js
│   │   ├── appointmentController.js
│   │   ├── calendarController.js
│   │   ├── billController.js
│   │   └── userController.js
│   ├── models/                # Mongoose schemas
│   │   ├── User.js
│   │   ├── Customer.js
│   │   ├── Job.js
│   │   ├── Task.js
│   │   ├── Activity.js
│   │   ├── Appointment.js
│   │   ├── File.js
│   │   └── Bill.js
│   ├── routes/                # API route definitions
│   │   ├── auth.js
│   │   ├── customers.js
│   │   ├── jobs.js
│   │   ├── tasks.js
│   │   ├── appointments.js
│   │   ├── files.js
│   │   ├── calendar.js
│   │   ├── bills.js
│   │   └── users.js
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication middleware
│   │   └── upload.js          # Multer file upload config
│   ├── utils/
│   │   ├── generateToken.js  # JWT token generation
│   │   └── stageConfig.js    # Job stage configuration
│   └── server.js              # Express app entry point
├── uploads/                   # File storage (LOCAL - needs cloud migration)
├── package.json
└── createSuperAdmin.js        # Script to create admin user
```

---

## Database Schema (MongoDB)

### Collections & Models

#### 1. **User** (`users`)
- `name`, `email` (unique), `password` (hashed), `role` (enum), `isActive`, `isPending`
- Roles: `super_admin`, `admin`, `manager`, `sales`, `installer`, `read_only`, `employee`
- Timestamps: `createdAt`, `updatedAt`

#### 2. **Customer** (`customers`)
- `name`, `primaryPhone`, `primaryEmail`, `phones[]`, `emails[]`
- `address` (street, city, state, zip)
- `addresses[]` (multiple addresses)
- `tags[]`, `notes`, `source` (enum)
- Timestamps

#### 3. **Job** (`jobs`)
- `customerId` (ref), `title`, `stage` (13-stage enum), `valueEstimated`, `valueContracted`
- `assignedTo` (ref), `source` (enum)
- Nested objects: `appointment`, `estimate`, `contract`, `takeoff`, `schedule`
- Timestamps

**Job Stages (13 stages):**
- APPOINTMENT_SCHEDULED
- ESTIMATE_IN_PROGRESS, ESTIMATE_SENT, ENGAGED_DESIGN_REVIEW, CONTRACT_OUT
- DEPOSIT_PENDING, JOB_PREP, TAKEOFF_COMPLETE, READY_TO_SCHEDULE
- SCHEDULED, IN_PRODUCTION, INSTALLED, FINAL_PAYMENT_CLOSED

#### 4. **Task** (`tasks`)
- `jobId` (ref, optional), `customerId` (ref, optional)
- `title`, `description`, `dueDate`, `priority` (enum), `type` (enum)
- `assignedTo` (ref), `completedAt`, `completedBy` (ref)
- Indexes: `jobId + completedAt`, `assignedTo + completedAt + dueDate`

#### 5. **Activity** (`activities`)
- `type` (enum), `jobId` (ref), `customerId` (ref)
- `fromStage`, `toStage`, `changes` (Map), `note`
- `fileId` (ref), `fileName`, `amount`, `paymentType`
- `createdBy` (ref)
- Indexes: `jobId + createdAt`, `customerId + createdAt`

#### 6. **File** (`files`)
- `jobId` (ref), `customerId` (ref)
- `filename`, `originalName`, `mimetype`, `size`, `path` (local filesystem path)
- `fileType` (enum: estimate, contract, photo, other)
- `uploadedBy` (ref)
- Indexes: `jobId + createdAt`, `customerId`, `fileType`

#### 7. **Appointment** (`appointments`)
- `jobId` (ref), `customerId` (ref)
- `dateTime`, `duration`, `location`, `notes`, `status` (enum)
- `googleEventId` (for Calendar sync)
- `createdBy` (ref)

#### 8. **Bill** (`bills`)
- `customerId` (ref), `jobId` (ref, optional)
- `amount`, `dueDate`, `dayOfMonth`, `description`
- `status` (enum), `paidAt`, `notes`
- `createdBy` (ref)

---

## API Endpoints

### Authentication (`/auth`)
- `POST /auth/register` - User registration (creates pending user)
- `POST /auth/login` - Login (returns JWT tokens)
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user
- `POST /auth/forgot-password` - Password reset
- `POST /auth/forgot-username` - Username recovery

### Customers (`/customers`)
- `GET /customers` - List (with pagination, search, tags)
- `GET /customers/:id` - Get single customer
- `POST /customers` - Create customer
- `PATCH /customers/:id` - Update customer
- `DELETE /customers/:id` - Delete customer
- `POST /customers/upload-csv` - Bulk import from CSV

### Jobs (`/jobs`)
- `GET /jobs` - List (with pagination, stage filter, search)
- `GET /jobs/:id` - Get single job
- `POST /jobs` - Create job
- `PATCH /jobs/:id` - Update job
- `DELETE /jobs/:id` - Delete job
- `POST /jobs/:id/archive` - Archive job
- `POST /jobs/:id/move-stage` - Change job stage
- `POST /jobs/dead-estimates/auto-move` - Auto-move stale estimates

### Tasks (`/tasks`)
- `GET /tasks` - List tasks
- `GET /tasks/completed` - Get completed tasks
- `POST /tasks` - Create task
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task
- `POST /tasks/:id/complete` - Mark complete

### Appointments (`/appointments`)
- `GET /appointments` - List (with status, date filters, pagination)
- `GET /appointments/completed` - Get completed appointments
- `POST /appointments` - Create appointment
- `PATCH /appointments/:id` - Update appointment
- `DELETE /appointments/:id` - Delete appointment
- `POST /appointments/:id/complete` - Mark complete

### Files (`/files`)
- `POST /files/upload` - Upload file (multipart/form-data, max 10MB)
- `GET /files/job/:jobId` - Get files for a job
- `GET /files/:id` - View file (inline)
- `GET /files/:id/download` - Download file
- `DELETE /files/:id` - Delete file

**File Storage:** Currently stored in `backend/uploads/` directory on local filesystem

### Calendar (`/calendar`)
- `GET /calendar/jobs/:jobId/sync` - Sync job to Google Calendar
- `DELETE /calendar/jobs/:jobId/sync` - Unsync from Google Calendar
- `POST /calendar/jobs/:jobId/sync` - Create/update calendar event

### Bills (`/bills`)
- `GET /bills` - List bills
- `POST /bills` - Create bill
- `PATCH /bills/:id` - Update bill
- `DELETE /bills/:id` - Delete bill

### Users (`/users`)
- `GET /users` - List users (admin only)
- `POST /users` - Create user (admin only)
- `PATCH /users/:id` - Update user (admin only)
- `DELETE /users/:id` - Delete user (admin only)

### Health Check
- `GET /` - API status
- `GET /health` - Health check with MongoDB status

---

## Environment Variables

### Backend (`.env` in `/backend`)
```env
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/paarth
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/paarth

# JWT Secret (required - use strong random string)
JWT_SECRET=your_jwt_secret_here

# Server Port
PORT=4000

# Google Calendar API (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/calendar/auth/callback
GOOGLE_REFRESH_TOKEN=your_refresh_token

# File Upload
MAX_FILE_SIZE=10485760  # 10MB in bytes
```

### Frontend (`.env` in `/frontend`)
```env
# Backend API URL
VITE_API_URL=http://localhost:4000
# For production:
# VITE_API_URL=https://your-backend-domain.com
```

---

## Authentication & Security

### Authentication Flow
1. User logs in via `POST /auth/login`
2. Backend returns `accessToken` and `refreshToken` (JWT)
3. Frontend stores tokens in `localStorage`
4. Axios interceptor adds `Authorization: Bearer <token>` to all requests
5. Backend middleware (`requireAuth`) validates token on protected routes
6. On 401, frontend clears tokens and redirects to login

### Security Features
- Password hashing with bcryptjs (10 rounds)
- JWT token-based authentication
- Role-based access control (RBAC)
- CORS enabled (configured in Express)
- File type validation (images + PDFs only)
- File size limits (10MB per file)

### Missing Security Features (for production)
- Rate limiting (not implemented)
- HTTPS enforcement (should be handled by hosting)
- Input sanitization (should add)
- SQL injection protection (N/A - using MongoDB)
- XSS protection (should add)

---

## File Storage (CRITICAL FOR DEPLOYMENT)

### Current Implementation
- **Storage:** Local filesystem (`backend/uploads/`)
- **Upload Library:** Multer with disk storage
- **File Size Limit:** 10MB per file
- **Allowed Types:** Images (JPEG, PNG, GIF, WebP) and PDFs
- **File Naming:** `originalname-timestamp-random.ext`

### Issues for Production
1. **Files stored on server disk** - will be lost on redeploy
2. **No horizontal scaling** - multiple servers can't share files
3. **Disk space limits** - server will run out of space
4. **No CDN** - slow file serving under load

### Migration Needed
- Move to cloud storage: **AWS S3**, **Cloudinary**, or **Google Cloud Storage**
- Update `fileController.js` to use cloud storage SDK
- Update file paths in database to use cloud URLs
- Remove local file serving (`app.use('/uploads', express.static('uploads'))`)

---

## Build & Deployment

### Frontend Build
```bash
cd frontend
npm install
npm run build
# Output: frontend/dist/ (static files)
```

**Build Command:** `npm run build` (runs `tsc -b && vite build`)
**Output:** Static files in `frontend/dist/`
**Server:** Can be served by any static file server (Nginx, Vercel, Netlify, S3+CloudFront)

### Backend Build
```bash
cd backend
npm install
npm start
# Runs: node src/server.js
```

**Start Command:** `npm start` (runs `node src/server.js`)
**Dev Command:** `npm run dev` (runs `nodemon src/server.js`)
**Entry Point:** `backend/src/server.js`

### Dependencies
- **Node.js:** Required (version not specified, but using modern features)
- **MongoDB:** Required (local or Atlas)
- **npm:** For package management

---

## Key Features

### 1. Pipeline Management (Kanban Board)
- Visual drag-and-drop board with 13 job stages
- Real-time stage updates
- Auto-move stale estimates after 5 days

### 2. Customer Management
- Multiple contact methods (phones, emails)
- Multiple addresses per customer
- Tagging system
- CSV import functionality

### 3. Job Tracking
- 13-stage workflow from appointment to payment
- Estimate and contract management
- Deposit tracking
- File attachments per job

### 4. Calendar Integration
- Google Calendar sync (OAuth 2.0)
- Recurring appointments
- Job scheduling with calendar events

### 5. Task Management
- Job-specific and general tasks
- Priority levels
- Due dates
- Assignment to users

### 6. Payroll System
- Timesheet with hours tracking
- Travel miles (currently 0.725 cents/mile)
- Receipt tracking
- Overtime calculation (1.5x after 40 hours)
- Print functionality

### 7. File Management
- Upload images and PDFs
- Attach to jobs
- View and download files
- File type categorization

### 8. Activity Logging
- Comprehensive audit trail
- Tracks all customer/job interactions
- Stage changes, file uploads, payments

---

## Scalability Concerns

### Current Limitations
1. **File Storage:** Local filesystem (won't scale)
2. **MongoDB Connection Pool:** Default settings (may need tuning)
3. **No Rate Limiting:** Vulnerable to abuse
4. **No Caching:** Every request hits database
5. **Single Server:** No load balancing
6. **No CDN:** Static assets served from same server

### Recommended Improvements
1. **Cloud File Storage** (AWS S3, Cloudinary)
2. **Connection Pooling** (configure maxPoolSize in Mongoose)
3. **Rate Limiting** (express-rate-limit)
4. **Caching Layer** (Redis for frequently accessed data)
5. **Load Balancing** (multiple backend instances)
6. **CDN** (for static frontend assets)

---

## Deployment Checklist

### Pre-Deployment
- [ ] Set up MongoDB Atlas (or use existing MongoDB)
- [ ] Configure environment variables
- [ ] Set strong JWT_SECRET
- [ ] Migrate file storage to cloud (S3/Cloudinary)
- [ ] Update CORS settings for production domain
- [ ] Test all API endpoints
- [ ] Build frontend (`npm run build`)

### Deployment Steps
1. **Database:** Set up MongoDB Atlas cluster
2. **Backend:** Deploy to hosting (Railway, Render, AWS, Heroku)
3. **Frontend:** Deploy to static hosting (Vercel, Netlify, S3+CloudFront)
4. **File Storage:** Set up cloud storage bucket
5. **Environment Variables:** Configure on hosting platform
6. **Domain:** Point domain to frontend and backend
7. **SSL:** Ensure HTTPS (usually automatic on modern platforms)

### Post-Deployment
- [ ] Test authentication flow
- [ ] Test file uploads
- [ ] Test all major features
- [ ] Monitor error logs
- [ ] Set up monitoring/alerting
- [ ] Configure backups (MongoDB Atlas has automatic backups)

---

## Current Configuration Details

### MongoDB Connection
- **Connection String:** From `MONGODB_URI` env variable
- **Timeout:** 5 seconds (serverSelectionTimeoutMS)
- **Socket Timeout:** 45 seconds
- **Connection Pool:** Default (not explicitly configured)

### File Upload Configuration
- **Storage:** Multer disk storage
- **Destination:** `backend/uploads/`
- **Max Size:** 10MB
- **Allowed MIME Types:** image/jpeg, image/jpg, image/png, image/gif, image/webp, application/pdf

### CORS Configuration
- **Enabled:** Yes (via `cors()` middleware)
- **Configuration:** Default (allows all origins - should restrict in production)

### Server Configuration
- **Port:** 4000 (default) or from `PORT` env variable
- **Static Files:** Served from `/uploads` route
- **JSON Body Parser:** Enabled (via `express.json()`)

---

## Additional Notes

### Google Calendar Integration
- Uses OAuth 2.0
- Requires Google Cloud Console setup
- Stores refresh tokens for long-term access
- Optional feature (app works without it)

### Payroll Gas Rate
- Currently set to **0.725 cents per mile** (in `PayrollPage.jsx`)

### Database Indexes
- Some indexes exist (Activity, Task, File)
- May need additional indexes for production queries

### Error Handling
- Basic error handling in controllers
- Frontend shows toast notifications for errors
- No centralized error logging service (should add Sentry or similar)

---

## Questions for Deployment Consultation

1. **What's the best hosting platform for this stack?** (Railway, Render, AWS, Heroku, etc.)
2. **How should we handle file storage migration?** (AWS S3 vs Cloudinary vs others)
3. **What MongoDB Atlas tier is needed?** (Free tier vs paid)
4. **How to set up CI/CD?** (GitHub Actions, etc.)
5. **What monitoring/alerting should we use?** (Sentry, DataDog, etc.)
6. **How to handle environment variable management?** (Secrets management)
7. **What's the estimated cost for small/medium/large teams?**
8. **How to set up automated backups?**
9. **What security improvements are critical before launch?**
10. **How to scale horizontally when needed?**

---

## Contact & Support

This document provides a complete technical overview for deployment consultation. All code is production-ready but requires cloud storage migration and environment configuration for deployment.

**Key Files to Review:**
- `backend/src/server.js` - Main server setup
- `backend/src/middleware/upload.js` - File upload config
- `backend/src/controllers/fileController.js` - File handling logic
- `frontend/src/utils/axios.js` - API client configuration
- `frontend/vite.config.ts` - Build configuration

