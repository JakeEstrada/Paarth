<restored README content from git>
# Paarth - San Clemente Woodworking OMS

A comprehensive Operations Management System (OMS) and project management system designed specifically for San Clemente Woodworking. This application helps manage the entire workflow from initial customer contact through project completion, including job tracking, scheduling, customer management, and payroll.

## 📋 Table of Contents

- [Overview](#overview)
- [Engineering Highlights](#engineering-highlights)
- [Architecture](#architecture)
- [Use Cases](#use-cases)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Google Calendar Integration](#google-calendar-integration)
- [Payroll System](#payroll-system)
- [Authentication & Security](#authentication--security)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

Paarth is a full-stack OMS solution I built to streamline operations for a custom woodworking business. It provides end-to-end management of:

- **Customer Relationships**: Centralized customer database with multiple contact methods and addresses
- **Sales Pipeline**: Visual kanban board tracking jobs through 13 distinct stages from appointment to final payment
- **Project Management**: Detailed job tracking with estimates, contracts, scheduling, and file management
- **Calendar Integration**: Google Calendar sync for seamless scheduling with recurrence support
- **Task Management**: General todos and job-specific tasks with priority and due dates
- **Payroll**: Timesheet tracking with hours, travel miles, receipts, and overtime calculations
- **Activity Logging**: Comprehensive audit trail of all customer and job interactions

The system is designed with a modern, responsive UI built on Material-UI and a robust REST API backend using Express and MongoDB.

---

## 💡 Engineering Highlights

This project is designed to showcase pragmatic, real-world problem solving as well as clean full‑stack architecture.

- **Domain modelling for a complex sales pipeline**
  - Designed MongoDB/Mongoose models for customers, jobs, tasks, activities, files, and payroll entries with enums, validation, and indexes.
  - Encoded a 13‑stage job pipeline (appointments → sales → readiness → execution) with soft‑delete style archiving and automatic movement of "dead estimates" after inactivity.

- **Rich audit logging system**
  - Implemented an `Activity` model with 20+ event types (e.g. `stage_change`, `estimate_sent`, `contract_signed`, `job_scheduled`, `task_completed`, `file_uploaded`).
  - Persist detailed metadata per event (stage transitions, value changes, calendar sync status, file references, etc.) so any job or customer’s history can be reconstructed from the log.
  - Recently refined the activity log to always display the acting user’s name for clearer attribution across the UI.

- **Scheduling engine with Google Calendar integration**
  - Built calendar scheduling for jobs with recurrence rules (daily/weekly/monthly/yearly) and crew notes.
  - Integrated with Google Calendar via OAuth 2.0, mapping jobs to calendar events and storing `googleEventId` plus sync status for future updates/deletion.
  - Hardened the integration with explicit error states and clear configuration via environment variables.

- **Task & priority system with urgent workflows**
  - Implemented a unified task model that can optionally attach to jobs and customers, with typed priorities and categories (e.g. follow‑up, schedule_install).
  - Added an explicit **urgent** flag that surfaces visually in the UI so critical follow‑ups can’t be missed.

- **Payroll and weighted overtime calculations**
  - Built a payroll page that derives total hours from clock‑in/out times and breaks, tracks travel miles, and aggregates receipts.
  - Implemented weighted overtime calculations (1.5x for hours over 40/week) and iterated on the logic to fix subtle edge‑cases in how weighted hours are computed.

- **Maintainable, layered architecture**
  - Separated concerns into controllers, models, routes, middleware, and utility modules on the backend; composed small, reusable components and hooks on the frontend.
  - Chose RESTful APIs with clear resource boundaries and consistent response shapes, making it easy to extend the system with new features (e.g. developer tasks, archive views).

---

## 🏗️ Architecture

### System Architecture

Paarth follows a **client-server architecture** with clear separation between frontend and backend:

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   React Frontend │ ◄─────► │  Express Backend │ ◄─────► │   MongoDB       │
│   (Port 5173)    │  REST   │   (Port 4000)    │  ODM    │   Database      │
└─────────────────┘   API    └─────────────────┘         └─────────────────┘
         │                        │
         │                        │
         ▼                        ▼
┌─────────────────┐         ┌─────────────────┐
│   Material-UI    │         │  Google Calendar│
│   Components     │         │  API (OAuth 2.0)│
└─────────────────┘         └─────────────────┘
```

### Frontend Architecture

**Technology Stack:**
- **React 19**: Modern UI framework with hooks and functional components
- **Material-UI (MUI) v7**: Component library for consistent design
- **React Router v7**: Client-side routing
- **Axios**: HTTP client for API communication
- **@dnd-kit**: Drag-and-drop functionality for pipeline board
- **date-fns**: Date manipulation and formatting
- **react-hot-toast**: User notifications
- **Vite**: Fast build tool and dev server

**Structure:**
```
frontend/src/
├── components/          # Reusable UI components
│   ├── appointments/   # Appointment-related components
│   ├── customers/      # Customer management components
│   ├── jobs/           # Job detail modals and forms
│   ├── layout/         # MainLayout, Sidebar, TopBar
│   ├── pipeline/       # Pipeline board and job cards
│   ├── tasks/          # Task management components
│   └── todos/          # Todo list components
├── pages/              # Route-level page components
├── context/            # React Context providers (if any)
├── hooks/              # Custom React hooks
├── services/           # API service layer
├── theme/              # MUI theme configuration
└── utils/              # Utility functions
```

**Key Design Patterns:**
- **Component Composition**: Modular, reusable components
- **Container/Presentational**: Separation of data logic and presentation
- **Context API**: Global state management (if needed)
- **Custom Hooks**: Reusable stateful logic

### Backend Architecture

**Technology Stack:**
- **Node.js**: JavaScript runtime
- **Express 5**: Web framework with middleware support
- **MongoDB**: NoSQL database for flexible schema
- **Mongoose**: ODM (Object Document Mapper) for MongoDB
- **JWT**: Token-based authentication
- **Multer**: File upload handling
- **Google APIs**: Calendar integration via OAuth 2.0
- **bcryptjs**: Password hashing

**Structure:**
```
backend/src/
├── controllers/        # Business logic layer
│   ├── authController.js
│   ├── customerController.js
│   ├── jobController.js
│   ├── taskController.js
│   ├── appointmentController.js
│   ├── calendarController.js
│   ├── fileController.js
│   └── activityController.js
├── models/            # Mongoose schemas
│   ├── User.js
│   ├── Customer.js
│   ├── Job.js
│   ├── Task.js
│   ├── Appointment.js
│   ├── Activity.js
│   └── File.js
├── routes/            # API route definitions
│   ├── auth.js
│   ├── customers.js
│   ├── jobs.js
│   ├── tasks.js
│   ├── appointments.js
│   ├── calendar.js
│   └── files.js
├── middleware/        # Express middleware
│   ├── auth.js        # JWT authentication
│   └── upload.js      # File upload handling
├── utils/             # Helper functions
│   ├── generateToken.js
│   └── stageConfig.js
└── server.js          # Express app setup and MongoDB connection
```

**Key Design Patterns:**
- **MVC (Model-View-Controller)**: Clear separation of concerns
- **RESTful API**: Standard HTTP methods and status codes
- **Middleware Chain**: Authentication, validation, error handling
- **Repository Pattern**: Data access abstraction through Mongoose models

### Data Flow

1. **User Interaction**: User interacts with React component
2. **API Call**: Component calls API service function (Axios)
3. **HTTP Request**: Request sent to Express backend
4. **Middleware**: Authentication, validation, file upload processing
5. **Controller**: Business logic execution
6. **Model**: Database operations via Mongoose
7. **Response**: JSON response sent back to frontend
8. **State Update**: React component updates UI based on response

### Database Architecture

**MongoDB Collections:**
- `users`: User accounts and authentication
- `customers`: Customer information with multiple addresses/contacts
- `jobs`: Job details, stages, estimates, contracts, scheduling
- `tasks`: General tasks and todos
- `appointments`: Scheduled appointments
- `activities`: Activity log for audit trail
- `files`: File metadata and references

**Relationships:**
- Jobs → Customers (many-to-one)
- Jobs → Users (assignedTo, createdBy)
- Tasks → Jobs (optional, many-to-one)
- Tasks → Customers (optional, many-to-one)
- Activities → Jobs (optional, many-to-one)
- Activities → Customers (required, many-to-one)
- Files → Jobs (optional, many-to-one)

**Indexing Strategy:**
- Jobs: `stage`, `isArchived`, `customerId`, `assignedTo`
- Customers: Text search on `name` and `primaryEmail`
- Activities: `jobId`, `customerId` with timestamps
- Tasks: `jobId`, `assignedTo`, `dueDate` for efficient querying

---

## 💼 Use Cases

### Use Case 1: New Customer Inquiry

**Scenario**: A potential customer calls or emails about a custom woodworking project.

**Workflow:**
1. **Create Customer Record**
   - Navigate to Customers page
   - Click "Add Customer"
   - Enter name, phone, email, address
   - Select source (referral, Yelp, Instagram, etc.)
   - Save customer

2. **Schedule Appointment**
   - From customer detail or Pipeline page
   - Create new job with title (e.g., "Kitchen Cabinets - John Smith")
   - Job automatically starts in "Appointment Scheduled" stage
   - Add appointment date/time and location
   - Optionally sync to Google Calendar

3. **Track Follow-up**
   - Create task to "Follow up on appointment"
   - Set due date and priority
   - System logs activity automatically

**System Actions:**
- Customer record created in database
- Job created with `APPOINTMENT_SCHEDULED` stage
- Activity log entry: `customer_created`, `job_created`
- If calendar sync enabled, Google Calendar event created

---

### Use Case 2: Estimate Process

**Scenario**: After appointment, create and send estimate to customer.

**Workflow:**
1. **Move Job to Estimate Stage**
   - Drag job card from "Appointment Scheduled" to "Estimate Current, first 5 days"
   - Or use job detail modal to change stage

2. **Add Estimate Details**
   - Open job detail modal
   - Enter estimated value
   - Add line items (description, quantity, unit price)
   - Upload estimate PDF if available

3. **Send Estimate**
   - Move job to "Estimate Sent" stage
   - System records `estimate.sentAt` timestamp
   - Activity log: `estimate_sent`

4. **Track Response**
   - If no response after 7 days, job automatically moves to "Dead Estimates" archive
   - If customer responds, move to "Design Review" or "Contract Out"

**System Actions:**
- Job stage updated in database
- Estimate data saved (amount, line items, sent date)
- Activity log: `stage_change`, `estimate_sent`
- File upload stored in `backend/uploads/` and metadata in database

---

### Use Case 3: Contract Signing and Deposit

**Scenario**: Customer approves estimate and signs contract.

**Workflow:**
1. **Contract Preparation**
   - Move job to "Contract Out" stage
   - Upload contract PDF
   - Add notes about contract terms

2. **Contract Signed**
   - Move job to "Signed / Deposit Pending" stage
   - Record contract signed date
   - Enter deposit required amount

3. **Deposit Received**
   - Update deposit received amount and date
   - Job moves to "Job Prep" stage
   - Activity log: `contract_signed`, `deposit_received`

**System Actions:**
- Contract details saved (signed date, deposit amounts)
- Job stage progression tracked
- Activity log entries created
- Payment information recorded for financial tracking

---

### Use Case 4: Job Preparation and Scheduling

**Scenario**: Prepare job for production and schedule installation.

**Workflow:**
1. **Job Prep**
   - Job in "Job Prep" stage
   - Add notes about materials, measurements, special requirements

2. **Fabrication**
   - Move to "Fabrication" stage
   - Record takeoff completion date and person
   - Add takeoff notes

3. **Ready to Schedule**
   - Move to "Ready to Schedule" stage
   - All prep work complete

4. **Schedule Installation**
   - Navigate to Calendar page
   - Select job and set start/end dates
   - Configure recurrence if needed (daily, weekly, monthly, yearly)
   - Add crew notes
   - Sync to Google Calendar
   - Job moves to "Scheduled" stage

**System Actions:**
- Schedule data saved (start date, end date, recurrence)
- Google Calendar event created/updated via API
- Job stage updated to `SCHEDULED`
- Activity log: `job_scheduled`, `calendar_sync`

---

### Use Case 5: Production and Installation

**Scenario**: Track job through production and installation phases.

**Workflow:**
1. **In Production**
   - Move job to "In Production" stage
   - Add progress notes
   - Upload photos of work in progress

2. **Installation**
   - Move to "Installed" stage
   - Record installation date
   - Add installation notes and photos

3. **Final Payment**
   - Move to "Final Payment Closed" stage
   - Record final payment amount and method
   - Job completion date recorded

**System Actions:**
- Job stage progression tracked
- Files uploaded and linked to job
- Activity log entries for each stage change
- Payment information recorded

---

### Use Case 6: Task Management

**Scenario**: Create and track tasks for follow-ups and job-related activities.

**Workflow:**
1. **Create Task**
   - Navigate to Tasks page
   - Click "Add Task"
   - Enter title, description, due date
   - Set priority (low, medium, high, urgent)
   - Optionally link to job or customer
   - Assign to team member

2. **Complete Task**
   - Mark task as complete
   - System records completion date and user
   - Task moves to "Completed Tasks" page

**System Actions:**
- Task created in database
- Activity log: `task_created`
- On completion: `task_completed` activity logged
- Task filtered from active list

---

### Use Case 7: Payroll Tracking

**Scenario**: Track employee hours, travel, and expenses for payroll.

**Workflow:**
1. **Daily Time Entry**
   - Navigate to Payroll page
   - Enter date
   - Record clock in/out times
   - Add break duration
   - System calculates total hours

2. **Travel Miles**
   - Add daily travel miles
   - System calculates travel cost (configurable rate)

3. **Receipts**
   - Add multiple receipts with descriptions
   - Upload receipt images/PDFs

4. **Overtime Calculation**
   - System automatically calculates weighted hours
   - Hours over 40/week = 1.5x rate

5. **Print Timesheet**
   - Use print functionality for clean formatted output

**System Actions:**
- Hours calculated from in/out times and breaks
- Overtime calculated based on weekly totals
- Travel costs calculated
- All data stored for payroll processing

---

### Use Case 8: Customer Relationship Management

**Scenario**: Manage customer information and track interactions.

**Workflow:**
1. **View Customer**
   - Navigate to Customers page
   - Search by name or email
   - View customer detail with all jobs

2. **Update Customer**
   - Add additional phone numbers or emails
   - Add multiple addresses
   - Add tags for categorization
   - Update notes

3. **View Customer History**
   - See all jobs associated with customer
   - View activity log for all interactions
   - See all files uploaded for customer's jobs

**System Actions:**
- Customer data updated in database
- Activity log: `customer_updated`
- All related jobs remain linked
- Search functionality uses MongoDB text indexes

---

### Use Case 9: Archive Management

**Scenario**: Archive completed jobs and dead estimates.

**Workflow:**
1. **Archive Completed Job**
   - From job detail modal, click "Archive"
   - Job moves to archive (not deleted)
   - Archived timestamp and user recorded

2. **View Dead Estimates**
   - Navigate to "Dead Estimates" page
   - View estimates sent but no response after 7 days
   - Can reactivate if customer responds later

3. **View Job Archive**
   - Navigate to "Job Archive" page
   - View all archived jobs
   - Filter and search archived jobs

**System Actions:**
- Job `isArchived` flag set to true
- Archived timestamp and user recorded
- Job removed from active pipeline
- All data preserved for historical reference

---

### Use Case 10: Google Calendar Integration

**Scenario**: Sync job schedules with Google Calendar.

**Workflow:**
1. **Initial Setup**
   - Follow `GOOGLE_CALENDAR_SETUP.md` guide
   - Configure OAuth 2.0 credentials
   - Get refresh token

2. **Schedule Job**
   - Set job schedule dates on Calendar page
   - Configure recurrence if needed
   - Click "Sync to Calendar"
   - System creates Google Calendar event

3. **Automatic Updates**
   - When job details change, calendar event updates
   - When job deleted/archived, calendar event removed

**System Actions:**
- OAuth 2.0 authentication with Google
- Google Calendar API calls to create/update/delete events
- Event ID stored in job `calendar.googleEventId`
- Sync status tracked in `calendar.calendarStatus`

---

## ✨ Features

### Core Functionality

#### Sales Pipeline Management
- **Visual Kanban Board**: Drag-and-drop interface for managing jobs through stages
- **13 Job Stages**: From appointment scheduling to final payment
- **Stage Grouping**: Organized into Appointments, Sales, Readiness, and Execution phases
- **Value Tracking**: Estimated and contracted values for revenue forecasting
- **Source Tracking**: Track where leads come from (referral, Yelp, Instagram, etc.)

#### Customer Management
- **Comprehensive Database**: Store customer information with multiple contact methods
- **Multiple Addresses**: Support for multiple addresses per customer
- **Multiple Contacts**: Multiple phone numbers and email addresses
- **Tags**: Categorize customers with custom tags
- **Search Functionality**: Full-text search by name or email
- **Customer History**: View all jobs and activities for each customer

#### Job Tracking
- **Detailed Job Records**: Complete job information with stages, estimates, contracts
- **File Management**: Upload and manage job-related files (PDFs, images, documents)
- **Notes Timeline**: Chronological notes with user attribution
- **Stage History**: Track all stage changes with timestamps
- **Assignment**: Assign jobs to team members
- **Archive System**: Archive instead of delete for historical reference

#### Calendar Integration
- **Google Calendar Sync**: Two-way sync with Google Calendar
- **Recurrence Support**: Daily, weekly, monthly, yearly recurrence patterns
- **Automatic Updates**: Calendar events update when job details change
- **Crew Notes**: Add notes visible in calendar events

#### Task Management
- **General Tasks**: Create tasks independent of jobs
- **Job-Linked Tasks**: Link tasks to specific jobs or customers
- **Priority Levels**: Low, medium, high, urgent priorities
- **Due Dates**: Set and track due dates
- **Assignment**: Assign tasks to team members
- **Completion Tracking**: Mark tasks complete with timestamp

#### Appointment Scheduling
- **Appointment Creation**: Schedule customer appointments
- **Location Tracking**: Record appointment locations
- **Notes**: Add appointment-specific notes
- **Completion Tracking**: Mark appointments as complete

#### File Management
- **Upload Support**: Upload files (PDFs, images, documents)
- **Job Linking**: Link files to specific jobs
- **Metadata Storage**: Store file metadata in database
- **Static Serving**: Files served via Express static middleware

#### Activity Logging
- **Comprehensive Tracking**: Log all customer and job interactions
- **Activity Types**: 20+ activity types (created, updated, stage_change, etc.)
- **User Attribution**: Track who performed each action
- **Timestamps**: All activities timestamped
- **Change Tracking**: Record what changed in updates

#### Payroll System
- **Timesheet Management**: Daily hours tracking with in/out times
- **Break Tracking**: Record break durations
- **Overtime Calculation**: Automatic weighted hours (1.5x for hours over 40)
- **Travel Miles**: Track daily travel with automatic cost calculation
- **Receipts**: Add multiple receipts with descriptions
- **Print Functionality**: Clean formatted print output

#### Developer Tasks
- **Separate Task System**: Task management for development work
- **JSON Storage**: Stored in `developer-tasks.json` file
- **Independent from Main Tasks**: Separate from customer/job tasks

---

## 🛠️ Tech Stack

### Frontend
- **React 19**: UI framework
- **Material-UI (MUI) v7**: Component library
- **React Router v7**: Routing
- **Axios**: HTTP client
- **@dnd-kit**: Drag-and-drop
- **date-fns**: Date manipulation
- **react-hot-toast**: Notifications
- **Vite**: Build tool

### Backend
- **Node.js**: Runtime environment
- **Express 5**: Web framework
- **MongoDB**: Database
- **Mongoose**: ODM
- **JWT**: Authentication
- **Multer**: File uploads
- **Google APIs**: Calendar integration
- **bcryptjs**: Password hashing

---

## 📦 Installation

### Prerequisites

- **Node.js** (v18 or higher)
- **MongoDB** (local installation or MongoDB Atlas account)
- **npm** or **yarn**
- **Google Cloud account** (optional, for Calendar integration)

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd Paarth
```

### Step 2: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 3: Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

---

## ⚙️ Configuration

### Backend Environment Variables

Create a `.env` file in the `backend` directory:

```env
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/paarth
# or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/paarth

# JWT Secret (use a strong random string)
JWT_SECRET=your_jwt_secret_here

# Server Port
PORT=4000

# Google Calendar API (Optional - see GOOGLE_CALENDAR_SETUP.md)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/calendar/auth/callback
GOOGLE_REFRESH_TOKEN=your_refresh_token

# File Upload
MAX_FILE_SIZE=10485760  # 10MB in bytes
```

### Frontend Environment Variables

Create a `.env` file in the `frontend` directory:

```env
VITE_API_URL=http://localhost:4000
```

For production, update to your production API URL.

---

## 🚀 Running the Application

### Development Mode

1. **Start MongoDB** (if running locally):
   ```bash
   mongod
   ```

2. **Start Backend Server**:
   ```bash
   cd backend
   npm run dev
   ```
   Backend will run on `http://localhost:4000`

3. **Start Frontend Development Server**:
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend will run on `http://localhost:5173`

### Production Build

1. **Build Frontend**:
   ```bash
   cd frontend
   npm run build
   ```
   This creates a `dist` folder with optimized production files.

2. **Start Backend**:
   ```bash
   cd backend
   npm start
   ```

3. **Serve Frontend** (optional):
   You can serve the frontend `dist` folder using a web server like Nginx, or configure Express to serve static files.

---

## 📁 Project Structure

```
Paarth/
├── backend/
│   ├── src/
│   │   ├── controllers/     # Business logic
│   │   │   ├── authController.js
│   │   │   ├── customerController.js
│   │   │   ├── jobController.js
│   │   │   ├── taskController.js
│   │   │   ├── appointmentController.js
│   │   │   ├── calendarController.js
│   │   │   ├── fileController.js
│   │   │   └── activityController.js
│   │   ├── models/          # Mongoose schemas
│   │   │   ├── User.js
│   │   │   ├── Customer.js
│   │   │   ├── Job.js
│   │   │   ├── Task.js
│   │   │   ├── Appointment.js
│   │   │   ├── Activity.js
│   │   │   └── File.js
│   │   ├── routes/          # API routes
│   │   │   ├── auth.js
│   │   │   ├── customers.js
│   │   │   ├── jobs.js
│   │   │   ├── tasks.js
│   │   │   ├── appointments.js
│   │   │   ├── calendar.js
│   │   │   ├── files.js
│   │   │   └── activities.js
│   │   ├── middleware/      # Express middleware
│   │   │   ├── auth.js      # JWT authentication
│   │   │   └── upload.js    # File upload handling
│   │   ├── utils/           # Helper functions
│   │   │   ├── generateToken.js
│   │   │   └── stageConfig.js
│   │   └── server.js        # Express server setup
│   ├── uploads/             # Uploaded files storage
│   ├── package.json
│   └── .env                 # Environment variables (create this)
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   │   ├── appointments/
│   │   │   ├── customers/
│   │   │   ├── jobs/
│   │   │   ├── layout/
│   │   │   ├── pipeline/
│   │   │   ├── tasks/
│   │   │   └── todos/
│   │   ├── pages/           # Page components
│   │   │   ├── PipelinePage.jsx
│   │   │   ├── CustomersPage.jsx
│   │   │   ├── CalendarPage.jsx
│   │   │   ├── TasksPage.jsx
│   │   │   ├── PayrollPage.jsx
│   │   │   └── ...
│   │   ├── services/        # API services
│   │   ├── theme/           # MUI theme
│   │   ├── utils/           # Utility functions
│   │   ├── App.jsx          # Main app component
│   │   └── main.jsx         # Entry point
│   ├── public/              # Static assets
│   ├── package.json
│   └── .env                 # Environment variables (create this)
├── GOOGLE_CALENDAR_SETUP.md # Calendar setup guide
└── README.md                # This file
```

---

## 🔌 API Documentation

### Authentication

All protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

#### `POST /auth/register`
Register a new user.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### `POST /auth/login`
Login user.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### `GET /auth/me`
Get current authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": "user_id",
  "name": "John Doe",
  "email": "john@example.com"
}
```

---

### Jobs

#### `GET /jobs`
Get all jobs (optionally filtered by stage, archived status).

**Query Parameters:**
- `stage`: Filter by stage
- `isArchived`: Filter archived jobs (true/false)
- `customerId`: Filter by customer

**Response:**
```json
[
  {
    "id": "job_id",
    "customerId": "customer_id",
    "title": "Kitchen Cabinets",
    "stage": "SCHEDULED",
    "valueEstimated": 15000,
    "valueContracted": 15000,
    "source": "referral",
    "schedule": {
      "startDate": "2024-01-15T00:00:00.000Z",
      "endDate": "2024-01-20T00:00:00.000Z"
    },
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

#### `POST /jobs`
Create a new job.

**Request Body:**
```json
{
  "customerId": "customer_id",
  "title": "Kitchen Cabinets",
  "stage": "APPOINTMENT_SCHEDULED",
  "valueEstimated": 15000,
  "source": "referral"
}
```

#### `GET /jobs/:id`
Get job by ID.

#### `PATCH /jobs/:id`
Update job.

**Request Body:** (partial update, include only fields to update)
```json
{
  "stage": "ESTIMATE_IN_PROGRESS",
  "valueEstimated": 16000
}
```

#### `DELETE /jobs/:id`
Delete job (soft delete - sets isArchived flag).

#### `POST /jobs/:id/move-stage`
Move job to different stage.

**Request Body:**
```json
{
  "stage": "ESTIMATE_SENT",
  "note": "Estimate sent to customer"
}
```

#### `POST /jobs/:id/archive`
Archive job.

---

### Customers

#### `GET /customers`
Get all customers.

**Query Parameters:**
- `search`: Search by name or email

#### `POST /customers`
Create customer.

**Request Body:**
```json
{
  "name": "John Smith",
  "primaryPhone": "555-1234",
  "primaryEmail": "john@example.com",
  "address": {
    "street": "123 Main St",
    "city": "San Clemente",
    "state": "CA",
    "zip": "92672"
  },
  "source": "referral"
}
```

By default, creating a customer also creates an initial pipeline job titled `"<Customer name> — Job"` in stage `ESTIMATE_IN_PROGRESS`, so every customer has at least one job. Set `"skipInitialJob": true` when you will create the job yourself in the same flow (e.g. Add Job from the pipeline).

#### `GET /customers/:id`
Get customer by ID.

#### `PATCH /customers/:id`
Update customer.

#### `DELETE /customers/:id`
Delete customer.

#### `POST /customers/upload-csv`
Upload customers from CSV file.

---

### Tasks

#### `GET /tasks`
Get all tasks.

**Query Parameters:**
- `jobId`: Filter by job
- `customerId`: Filter by customer
- `completed`: Filter completed tasks (true/false)

#### `POST /tasks`
Create task.

**Request Body:**
```json
{
  "title": "Follow up on estimate",
  "description": "Call customer about estimate",
  "dueDate": "2024-01-15T00:00:00.000Z",
  "priority": "high",
  "jobId": "job_id"
}
```

#### `POST /tasks/:id/complete`
Mark task as complete.

#### `DELETE /tasks/:id`
Delete task.

---

### Appointments

#### `GET /appointments`
Get all appointments.

**Query Parameters:**
- `completed`: Filter completed appointments (true/false)

#### `POST /appointments`
Create appointment.

#### `POST /appointments/:id/complete`
Mark appointment as complete.

#### `DELETE /appointments/:id`
Delete appointment.

---

### Calendar

#### `GET /calendar/auth-url`
Get Google Calendar OAuth authorization URL.

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/..."
}
```

#### `GET /calendar/auth/callback`
OAuth callback endpoint (handles code exchange for refresh token).

#### `POST /calendar/jobs/:id/sync`
Sync job to Google Calendar.

**Request Body:**
```json
{
  "startDate": "2024-01-15T00:00:00.000Z",
  "endDate": "2024-01-20T00:00:00.000Z",
  "recurrence": {
    "type": "none",
    "interval": 1,
    "count": 10
  }
}
```

#### `DELETE /calendar/jobs/:id`
Remove job from Google Calendar.

---

### Files

#### `POST /files/upload`
Upload file.

**Request:** Multipart form data
- `file`: File to upload
- `jobId`: (optional) Link to job
- `description`: (optional) File description

**Response:**
```json
{
  "id": "file_id",
  "filename": "contract.pdf",
  "path": "/uploads/contract-1234567890.pdf",
  "mimetype": "application/pdf",
  "size": 102400,
  "jobId": "job_id"
}
```

#### `GET /files/:id`
Get file metadata.

#### `DELETE /files/:id`
Delete file.

---

### Developer Tasks

#### `GET /developer-tasks`
Get all developer tasks.

#### `POST /developer-tasks`
Create developer task.

#### `PATCH /developer-tasks/:id`
Update developer task.

#### `DELETE /developer-tasks/:id`
Delete developer task.

---

## 🗄️ Database Schema

### User Model

```javascript
{
  name: String (required),
  email: String (required, unique, lowercase),
  password: String (required, hashed),
  isActive: Boolean (default: true),
  role: String (enum: ['admin', 'user']),
  createdAt: Date,
  updatedAt: Date
}
```

### Customer Model

```javascript
{
  name: String (required),
  primaryPhone: String,
  primaryEmail: String (lowercase),
  phones: [String],
  emails: [String],
  address: {
    street: String,
    city: String,
    state: String,
    zip: String
  },
  addresses: [{
    street: String,
    city: String,
    state: String,
    zip: String,
    fullAddress: String
  }],
  tags: [String],
  notes: String,
  source: String (enum: ['referral', 'yelp', 'instagram', 'facebook', 'website', 'repeat', 'other']),
  createdBy: ObjectId (ref: 'User'),
  createdAt: Date,
  updatedAt: Date
}
```

### Job Model

```javascript
{
  customerId: ObjectId (ref: 'Customer', required),
  title: String (required),
  stage: String (enum: [
    'APPOINTMENT_SCHEDULED',
    'ESTIMATE_IN_PROGRESS',
    'ESTIMATE_SENT',
    'ENGAGED_DESIGN_REVIEW',
    'CONTRACT_OUT',
    'CONTRACT_SIGNED',
    'DEPOSIT_PENDING',
    'JOB_PREP',
    'TAKEOFF_COMPLETE',
    'READY_TO_SCHEDULE',
    'SCHEDULED',
    'IN_PRODUCTION',
    'INSTALLED',
    'FINAL_PAYMENT_CLOSED'
  ]),
  valueEstimated: Number,
  valueContracted: Number,
  source: String (enum: ['referral', 'yelp', 'instagram', 'facebook', 'website', 'repeat', 'other']),
  assignedTo: ObjectId (ref: 'User'),
  appointment: {
    dateTime: Date,
    location: String,
    notes: String
  },
  estimate: {
    amount: Number,
    sentAt: Date,
    lineItems: [{
      description: String,
      quantity: Number,
      unitPrice: Number,
      total: Number
    }]
  },
  contract: {
    signedAt: Date,
    depositRequired: Number,
    depositReceived: Number,
    depositReceivedAt: Date
  },
  takeoff: {
    completedAt: Date,
    completedBy: ObjectId (ref: 'User'),
    notes: String
  },
  schedule: {
    startDate: Date,
    endDate: Date,
    crewNotes: String,
    recurrence: {
      type: String (enum: ['none', 'daily', 'weekly', 'monthly', 'yearly']),
      interval: Number,
      count: Number
    }
  },
  calendar: {
    googleEventId: String,
    calendarStatus: String (enum: ['created', 'updated', 'error', 'none']),
    lastSyncedAt: Date
  },
  finalPayment: {
    amountDue: Number,
    amountPaid: Number,
    paidAt: Date,
    paymentMethod: String (enum: ['cash', 'check', 'bank_transfer', 'credit_card', 'other'])
  },
  notes: [{
    content: String,
    createdBy: ObjectId (ref: 'User'),
    createdAt: Date,
    isStageChange: Boolean,
    isAppointment: Boolean
  }],
  isArchived: Boolean (default: false),
  archivedAt: Date,
  archivedBy: ObjectId (ref: 'User'),
  isDeadEstimate: Boolean (default: false),
  movedToDeadEstimateAt: Date,
  createdBy: ObjectId (ref: 'User', required),
  createdAt: Date,
  updatedAt: Date
}
```

### Task Model

```javascript
{
  jobId: ObjectId (ref: 'Job', optional),
  customerId: ObjectId (ref: 'Customer', optional),
  title: String (required),
  description: String,
  dueDate: Date,
  priority: String (enum: ['low', 'medium', 'high', 'urgent']),
  type: String (enum: ['follow_up', 'send_estimate', 'review_design', 'collect_deposit', 'schedule_install', 'site_visit', 'quality_check', 'collect_payment', 'other']),
  assignedTo: ObjectId (ref: 'User'),
  completedAt: Date,
  completedBy: ObjectId (ref: 'User'),
  createdBy: ObjectId (ref: 'User', required),
  createdAt: Date,
  updatedAt: Date
}
```

### Activity Model

```javascript
{
  type: String (enum: [
    'customer_created', 'customer_updated',
    'job_created', 'job_updated', 'job_archived',
    'stage_change', 'value_update', 'note',
    'call', 'email', 'sms', 'meeting',
    'file_uploaded', 'file_deleted',
    'estimate_sent', 'estimate_updated',
    'contract_signed', 'deposit_received', 'payment_received',
    'job_scheduled', 'calendar_sync',
    'task_created', 'task_completed',
    'takeoff_complete'
  ]),
  jobId: ObjectId (ref: 'Job', optional),
  customerId: ObjectId (ref: 'Customer', required),
  fromStage: String,
  toStage: String,
  changes: Map,
  note: String,
  fileId: ObjectId (ref: 'File'),
  fileName: String,
  amount: Number,
  paymentType: String,
  paymentMethod: String,
  duration: String,
  location: String,
  subject: String,
  googleEventId: String,
  createdBy: ObjectId (ref: 'User', required),
  createdAt: Date,
  updatedAt: Date
}
```

---

## 📅 Google Calendar Integration

The application supports syncing jobs to Google Calendar for seamless scheduling. See `GOOGLE_CALENDAR_SETUP.md` for detailed setup instructions.

### Key Features

- **Automatic Event Creation**: When jobs are scheduled, events are created in Google Calendar
- **Recurrence Support**: Daily, weekly, monthly, yearly recurrence patterns
- **Event Updates**: Calendar events update when job details change
- **Event Deletion**: Calendar events are removed when jobs are archived or deleted
- **OAuth 2.0**: Secure authentication with Google APIs

### Setup Process

1. Create Google Cloud Project
2. Enable Google Calendar API
3. Create OAuth 2.0 credentials
4. Configure redirect URI
5. Get refresh token
6. Add credentials to `.env` file

See `GOOGLE_CALENDAR_SETUP.md` for step-by-step instructions.

---

## 💰 Payroll System

The payroll page provides comprehensive timesheet management:

### Features

- **Work Hours Tracking**: Daily hours with in/out times and breaks
- **Overtime Calculation**: Automatic weighted hours (1.5x for hours over 40 per week)
- **Travel Miles**: Track daily travel with automatic cost calculation
- **Receipts**: Add multiple receipts with descriptions
- **Print Functionality**: Clean formatted print output for payroll processing

### Usage

1. Navigate to Payroll page
2. Select date
3. Enter clock in/out times
4. Add break duration
5. Add travel miles (if applicable)
6. Add receipts (if applicable)
7. System calculates total hours and overtime
8. Print timesheet for payroll processing

---

## 🔐 Authentication & Security

### Authentication Flow

1. User registers/logs in via `/auth/register` or `/auth/login`
2. Backend validates credentials and generates JWT token
3. Token returned to frontend
4. Frontend stores token (typically in localStorage)
5. Frontend includes token in `Authorization: Bearer <token>` header for protected routes
6. Backend middleware (`requireAuth`) validates token on each request
7. User object attached to request for use in controllers

### Security Features

- **Password Hashing**: Passwords hashed using bcryptjs
- **JWT Tokens**: Secure token-based authentication
- **Protected Routes**: Middleware protects sensitive endpoints
- **CORS**: Configured for secure cross-origin requests
- **File Upload Validation**: File type and size validation
- **Input Validation**: Mongoose schema validation

### Best Practices

- Use strong JWT secrets in production
- Store sensitive environment variables securely
- Use HTTPS in production
- Regularly update dependencies
- Implement rate limiting for production
- Use MongoDB authentication in production

---

## 🐛 Troubleshooting

### MongoDB Connection Issues

**Symptoms:**
- Backend starts but shows "MongoDB connection error"
- API requests return 503 "Database connection unavailable"

**Solutions:**
1. Ensure MongoDB is running:
   ```bash
   # Check if MongoDB is running
   mongosh
   ```

2. Verify `MONGODB_URI` in `.env`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/paarth
   ```

3. For MongoDB Atlas:
   - Check IP whitelist in Atlas dashboard
   - Verify connection string format
   - Check network connectivity

4. Check MongoDB logs for errors

### Google Calendar Not Working

**Symptoms:**
- "Google Calendar not configured" error
- Events not syncing to Google Calendar

**Solutions:**
1. Verify all environment variables are set:
   ```env
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=...
   GOOGLE_REFRESH_TOKEN=...
   ```

2. Check that Calendar API is enabled in Google Cloud Console

3. Verify refresh token is valid (may need to re-authenticate):
   - Visit `/calendar/auth-url` endpoint
   - Complete OAuth flow
   - Update refresh token in `.env`

4. Check backend logs for API errors

### File Upload Issues

**Symptoms:**
- Files not uploading
- "File too large" errors
- Files not accessible

**Solutions:**
1. Check `MAX_FILE_SIZE` in `.env`:
   ```env
   MAX_FILE_SIZE=10485760  # 10MB
   ```

2. Ensure `uploads/` directory exists and is writable:
   ```bash
   mkdir -p backend/uploads
   chmod 755 backend/uploads
   ```

3. Verify file types are allowed (check `upload.js` middleware)

4. Check disk space on server

### Frontend Not Connecting to Backend

**Symptoms:**
- API calls failing
- CORS errors in browser console

**Solutions:**
1. Verify `VITE_API_URL` in frontend `.env`:
   ```env
   VITE_API_URL=http://localhost:4000
   ```

2. Ensure backend is running on correct port

3. Check CORS configuration in `server.js`

4. Verify backend is accessible:
   ```bash
   curl http://localhost:4000/health
   ```

### Build Issues

**Symptoms:**
- Frontend build fails
- TypeScript errors

**Solutions:**
1. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Check Node.js version (should be v18+):
   ```bash
   node --version
   ```

3. Verify all dependencies are installed:
   ```bash
   npm install
   ```

---

## 📝 Notes

- The application uses MongoDB for data persistence
- File uploads are stored in `backend/uploads/`
- Developer tasks are stored in `backend/developer-tasks.json`
- The frontend communicates with the backend via REST API
- All dates are handled in local timezone
- Jobs are archived (soft deleted) rather than permanently deleted
- Dead estimates are automatically moved after 7 days of no response

---

## 📄 License

[Add your license here]

---

## 👥 Contributors

[Add contributors here]

---

## 📞 Support

For issues or questions, please [create an issue](link-to-issues) or contact the development team.

---

## 🔄 Version History

- **v1.1.0** (2026-03-08): Enhancements and fixes
  - Added explicit **urgent** flag and visual emphasis for high-priority tasks
  - Improved appointment flow to explicitly select an existing customer when scheduling
  - Activity log entries now display the acting user's name for clearer attribution
  - Corrected weighted-hours and overtime calculations in the payroll section

- **v1.0.0**: Initial release with core OMS functionality
  - Sales pipeline management
  - Customer management
  - Job tracking
  - Calendar integration
  - Task management
  - Payroll system

---

## 🚧 Future Enhancements

Potential features for future releases:

- Email integration for sending estimates/contracts
- SMS notifications
- Advanced reporting and analytics
- Mobile app (React Native)
- Multi-tenant support
- Advanced search and filtering
- Export functionality (PDF, CSV)
- Integration with accounting software
- Customer portal for viewing job status

---

*Last updated: March 8, 2026*
