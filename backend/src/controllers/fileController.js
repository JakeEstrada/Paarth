const File = require('../models/File');
const Job = require('../models/Job');
const Activity = require('../models/Activity');
const fs = require('fs');
const path = require('path');

// Get uploads directory - same as in upload.js middleware
// Use environment variable if set, otherwise use relative path
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// Helper function to find file path
function findFilePath(file) {
  const pathsToTry = [];
  
  // 1. Try the stored path (should be absolute from multer)
  if (file.path) {
    if (path.isAbsolute(file.path)) {
      pathsToTry.push(file.path);
    } else {
      // If relative, resolve it
      pathsToTry.push(path.resolve(__dirname, '../../', file.path));
    }
  }
  
  // 2. Try in uploads directory with filename (most reliable)
  pathsToTry.push(path.join(UPLOADS_DIR, file.filename));
  
  // 3. Try resolving from current working directory
  pathsToTry.push(path.resolve(process.cwd(), 'uploads', file.filename));
  
  // 4. Try relative to backend directory
  pathsToTry.push(path.resolve(__dirname, '../../uploads', file.filename));
  
  // Try each path
  for (const filePath of pathsToTry) {
    if (fs.existsSync(filePath)) {
      console.log('Found file at:', filePath);
      return filePath;
    }
  }
  
  // Log all attempted paths for debugging
  console.error('File not found. Searched paths:', {
    storedPath: file.path,
    filename: file.filename,
    attemptedPaths: pathsToTry,
    uploadsDir: UPLOADS_DIR,
    __dirname: __dirname,
    cwd: process.cwd()
  });
  
  return null;
}

// Upload file
async function uploadFile(req, res) {
  try {
    const User = require('../models/User');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { jobId, fileType = 'other' } = req.body;

    if (!jobId) {
      // Delete uploaded file if jobId is missing
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Job not found' });
    }

    // Handle createdBy
    let createdBy = req.user?._id || job.createdBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      } else {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'No user available' });
      }
    }

    // Ensure we store an absolute path
    // Multer's req.file.path should be absolute, but let's verify and fix if needed
    let absolutePath = req.file.path;
    console.log('Upload - req.file.path:', req.file.path);
    console.log('Upload - isAbsolute:', path.isAbsolute(absolutePath));
    console.log('Upload - UPLOADS_DIR:', UPLOADS_DIR);
    console.log('Upload - filename:', req.file.filename);
    
    if (!path.isAbsolute(absolutePath)) {
      absolutePath = path.resolve(UPLOADS_DIR, req.file.filename);
      console.log('Upload - resolved to:', absolutePath);
    }
    
    // Verify the file exists at this path
    if (!fs.existsSync(absolutePath)) {
      console.error('Upload - File does not exist at resolved path:', absolutePath);
      // Try the original path
      if (fs.existsSync(req.file.path)) {
        absolutePath = path.resolve(req.file.path);
        console.log('Upload - Using original path resolved:', absolutePath);
      }
    }

    const file = new File({
      jobId: job._id,
      customerId: job.customerId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: absolutePath,
      fileType: fileType,
      uploadedBy: createdBy
    });

    await file.save();

    // Log activity
    if (createdBy) {
      await Activity.create({
        type: 'file_uploaded',
        jobId: job._id,
        customerId: job.customerId,
        fileName: req.file.originalname,
        fileId: file._id,
        createdBy: createdBy
      });
    }

    await file.populate('uploadedBy', 'name email');

    res.status(201).json(file);
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
}

// Get files for a job
async function getJobFiles(req, res) {
  try {
    const { jobId } = req.params;

    const files = await File.find({ jobId })
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Download file
async function downloadFile(req, res) {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Find the file path (with fallback)
    const filePath = findFilePath(file);
    
    if (!filePath) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.mimetype);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get file (for viewing images/PDFs)
async function getFile(req, res) {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Find the file path (with fallback)
    const filePath = findFilePath(file);
    
    if (!filePath) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete file
async function deleteFile(req, res) {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete physical file - find path with fallback
    const filePath = findFilePath(file);
    
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Log activity before deleting
    const User = require('../models/User');
    let createdBy = req.user?._id || file.uploadedBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      }
    }

    if (createdBy) {
      await Activity.create({
        type: 'file_deleted',
        jobId: file.jobId,
        customerId: file.customerId,
        fileName: file.originalName,
        createdBy: createdBy
      });
    }

    await File.findByIdAndDelete(req.params.id);

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  uploadFile,
  getJobFiles,
  downloadFile,
  getFile,
  deleteFile
};

