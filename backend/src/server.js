const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const { runWithTenantContext } = require('./middleware/tenantContext');
const { ensureTenantBySlug, ensureDefaultTenant, normalizeTenantSlug } = require('./utils/tenantService');
const { backfillTenantIds } = require('./scripts/backfillTenantIds');
const Tenant = require('./models/Tenant');
const { initializeSocketServer } = require('./services/socketServer');

function isLikelyObjectId(value) {
  if (!value || typeof value !== 'string') return false;
  const s = value.trim();
  if (s.length !== 24) return false;
  return /^[a-fA-F0-9]{24}$/.test(s);
}

const app = express();
const httpServer = http.createServer(app);

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || !String(raw).trim()) return true;
  const list = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return true;
  // Non-production: merge Vite/preview dev origins so a production-only CORS_ORIGINS copy still allows local UI.
  if (process.env.NODE_ENV !== 'production') {
    return [...new Set([...list, ...LOCAL_DEV_ORIGINS])];
  }
  return list;
}

// Middleware — explicit headers so browser preflight (e.g. x-tenant-id) succeeds cross-origin.
// credentials: false — JWT is sent via Authorization header only; true + wrong CORS_ORIGINS breaks browsers.
app.use(
  cors({
    origin: parseCorsOrigins(),
    credentials: false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-tenant-slug'],
    maxAge: 86400,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Serve uploaded files statically (before DB check)
app.use('/uploads', express.static('uploads'));

// Resolve tenant context for every request (must run only when MongoDB is ready, or skip DB for static paths)
app.use(async (req, res, next) => {
  // Let CORS preflight through without touching the DB (avoids "CORS failed" when Mongo is cold / slow)
  if (req.method === 'OPTIONS') {
    return next();
  }

  const skipTenantDb =
    req.path === '/' ||
    req.path === '/health' ||
    req.path.startsWith('/uploads/') ||
    req.path.startsWith('/developer-tasks') ||
    req.path.startsWith('/auth') ||
    req.path.startsWith('/twilio') ||
    req.path.startsWith('/tenants/branding') ||
    req.path.startsWith('/api/tenants/branding');

  if (skipTenantDb) {
    return runWithTenantContext({ tenantId: null, bypassTenant: true }, () => next());
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Database connection unavailable',
      message: 'MongoDB is not connected yet. Retry in a few seconds.',
    });
  }

  try {
    const rawHeader = req.headers['x-tenant-id'];
    const tenantIdHeader =
      typeof rawHeader === 'string' ? rawHeader.trim() : Array.isArray(rawHeader) ? String(rawHeader[0] || '').trim() : '';

    if (tenantIdHeader && isLikelyObjectId(tenantIdHeader)) {
      const tenantById = await Tenant.findById(tenantIdHeader).select('_id');
      if (tenantById) {
        return runWithTenantContext(
          {
            tenantId: String(tenantById._id),
            bypassTenant: false,
          },
          () => next()
        );
      }
    }

    const tenantHeader = req.headers['x-tenant-slug'];
    const tenantBody = req.body && typeof req.body === 'object' ? req.body.tenantSlug : null;
    const tenantSlug = normalizeTenantSlug(tenantHeader || tenantBody);
    const tenant = await ensureTenantBySlug(tenantSlug, tenantSlug === 'default' ? 'Default Company' : tenantSlug);

    runWithTenantContext(
      {
        tenantId: String(tenant._id),
        bypassTenant: false,
      },
      () => next()
    );
  } catch (error) {
    console.error('Tenant context middleware:', error.message || error);
    return res.status(500).json({
      error: 'Failed to resolve tenant context',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Middleware to check MongoDB connection before processing requests (except test routes and static files)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  // Skip check for root test route, health endpoint, static files, developer tasks, auth (session restore during cold start)
  if (
    req.path === '/' ||
    req.path === '/health' ||
    req.path.startsWith('/uploads/') ||
    req.path.startsWith('/developer-tasks') ||
    req.path.startsWith('/auth') ||
    req.path.startsWith('/twilio') ||
    req.path.startsWith('/tenants/branding') ||
    req.path.startsWith('/api/tenants/branding')
  ) {
    return next();
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Database connection unavailable',
      message: 'MongoDB is not connected. Please check your connection settings.',
    });
  }
  next();
});

// Import routes
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const jobRoutes = require('./routes/jobs');
const activityRoutes = require('./routes/activities');
const taskRoutes = require('./routes/tasks');
const appointmentRoutes = require('./routes/appointments');
const fileRoutes = require('./routes/files');
const calendarRoutes = require('./routes/calendar');
const developerTasksRoutes = require('./routes/developerTasks');
const userRoutes = require('./routes/users');
const billRoutes = require('./routes/bills');
const tenantRoutes = require('./routes/tenants');
const pipelineLayoutRoutes = require('./routes/pipelineLayouts');
const twilioRoutes = require('./routes/twilio');
const plaidRoutes = require('./routes/plaid');

// Use routes
app.use('/auth', authRoutes);
app.use('/tenants', tenantRoutes);
app.use('/users', userRoutes);
app.use('/customers', customerRoutes);
app.use('/jobs', jobRoutes);
app.use('/activities', activityRoutes);
app.use('/tasks', taskRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/files', fileRoutes);
app.use('/calendar', calendarRoutes);
app.use('/developer-tasks', developerTasksRoutes);
app.use('/bills', billRoutes);
app.use('/pipeline-layouts', pipelineLayoutRoutes);
app.use('/twilio', twilioRoutes);
app.use('/plaid', plaidRoutes);
// Some deployments expose the API under `/api` without stripping the prefix from the path.
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/developer-tasks', developerTasksRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/pipeline-layouts', pipelineLayoutRoutes);
app.use('/api/twilio', twilioRoutes);
app.use('/api/plaid', plaidRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Paarth OMS API is running!' });
});

// Diagnostic route to check MongoDB connection status and S3 configuration
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const connectionState = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  // Check S3 configuration
  const { isS3Configured } = require('./config/s3');
  const s3Configured = isS3Configured();
  
  res.json({
    server: 'running',
    mongodb: {
      status: states[connectionState] || 'unknown',
      readyState: connectionState,
      connected: connectionState === 1,
      host: mongoose.connection.host || 'not connected',
      name: mongoose.connection.name || 'not connected'
    },
    s3: {
      configured: s3Configured,
      bucket: s3Configured ? process.env.AWS_S3_BUCKET_NAME : null,
      region: process.env.AWS_REGION || 'us-east-2',
      message: s3Configured 
        ? 'S3 storage is configured and ready' 
        : 'S3 not configured - using local file storage (files will be lost on restart)'
    },
    timestamp: new Date().toISOString()
  });
});

// Start server (will work even if MongoDB isn't connected yet)
const PORT = process.env.PORT || 4000;
const io = initializeSocketServer(httpServer);
app.set('io', io);
httpServer.listen(PORT, () => {
  console.log(`<3 Server running on http://localhost:${PORT}`);
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
})
  .then(() => {
    console.log('Yaas! MongoDB connected');
    ensureDefaultTenant()
      .then((tenant) => backfillTenantIds(tenant._id))
      .catch((error) => {
        console.error('Failed to initialize tenant data:', error.message);
      });
  })
  .catch(err => {
    console.error('Uhh-oh! MongoDB connection error:', err);
    console.error('\n⚠️  Please check:');
    console.error('1. Your IP address is whitelisted in MongoDB Atlas');
    console.error('2. Your MONGODB_URI in .env is correct');
    console.error('3. Your MongoDB Atlas cluster is running\n');
    console.error('⚠️  Warning: MongoDB is not connected. Some endpoints may fail.');
  });