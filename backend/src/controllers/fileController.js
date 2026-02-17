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
  // Try the stored path first (should be absolute from multer)
  let filePath = file.path;
  
  // If path is absolute, use it directly
  if (path.isAbsolute(filePath)) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  } else {
    // If relative, try resolving it
    const resolvedPath = path.resolve(__dirname, '../../', filePath);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }
  
  // Fallback: try in uploads directory with just the filename
  // This works for both local and deployed environments
  const fallbackPath = path.join(UPLOADS_DIR, file.filename);
  
  if (fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }
  
  // Last resort: try resolving from current working directory
  const cwdPath = path.resolve(process.cwd(), 'uploads', file.filename);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }
  
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
    // Multer should already provide absolute path, but let's be sure
    let absolutePath = req.file.path;
    if (!path.isAbsolute(absolutePath)) {
      absolutePath = path.resolve(UPLOADS_DIR, req.file.filename);
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

