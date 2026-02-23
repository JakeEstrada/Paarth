const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
// Serve uploaded files statically (before DB check)
app.use('/uploads', express.static('uploads'));

// Middleware to check MongoDB connection before processing requests (except test routes and static files)
app.use((req, res, next) => {
  // Skip check for root test route, health endpoint, static file serving, and developer tasks
  if (req.path === '/' || req.path === '/health' || req.path.startsWith('/uploads/') || req.path.startsWith('/developer-tasks')) {
    return next();
  }
  
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ 
      error: 'Database connection unavailable',
      message: 'MongoDB is not connected. Please check your connection settings.'
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

// Use routes
app.use('/auth', authRoutes);
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

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Paarth CRM API is running!' });
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
app.listen(PORT, () => {
  console.log(`<3 Server running on http://localhost:${PORT}`);
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
})
  .then(() => {
    console.log('Yaas! MongoDB connected');
  })
  .catch(err => {
    console.error('Uhh-oh! MongoDB connection error:', err);
    console.error('\n⚠️  Please check:');
    console.error('1. Your IP address is whitelisted in MongoDB Atlas');
    console.error('2. Your MONGODB_URI in .env is correct');
    console.error('3. Your MongoDB Atlas cluster is running\n');
    console.error('⚠️  Warning: MongoDB is not connected. Some endpoints may fail.');
  });