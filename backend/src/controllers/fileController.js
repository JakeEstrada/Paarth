const File = require('../models/File');
const Job = require('../models/Job');
const Activity = require('../models/Activity');
const fs = require('fs');
const path = require('path');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME, isS3Configured } = require('../config/s3');

// Get uploads directory - same as in upload.js middleware
// Use environment variable if set, otherwise use relative path
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

// Helper function to check if file is stored in S3
function isS3File(file) {
  // Check if file has s3Key or if path looks like an S3 key (starts with 'uploads/')
  return file.s3Key || (file.path && file.path.startsWith('uploads/') && !path.isAbsolute(file.path));
}

// Helper function to get file stream from S3 or local filesystem
async function getFileStream(file) {
  if (isS3Configured() && isS3File(file)) {
    // Get file from S3
    const s3Key = file.s3Key || file.path;
    console.log('Fetching file from S3:', s3Key);
    
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });
      
      const response = await s3Client.send(command);
      return response.Body; // This is a stream
    } catch (error) {
      console.error('Error fetching file from S3:', error);
      throw error;
    }
  } else {
    // Get file from local filesystem
    const filePath = findLocalFilePath(file);
    if (!filePath) {
      throw new Error('File not found on server');
    }
    
    console.log('Reading file from local filesystem:', filePath);
    return fs.createReadStream(filePath);
  }
}

// Helper function to find file path on local filesystem (fallback)
function findLocalFilePath(file) {
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

    const { jobId, taskId, fileType = 'other' } = req.body;

    // Support both jobId and taskId (for projects)
    if (!jobId && !taskId) {
      // Delete uploaded file if neither jobId nor taskId is provided
      if (req.file.path && !req.file.location && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      } else if (isS3Configured() && req.file.key) {
        // Delete from S3 if uploaded there
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: req.file.key,
          }));
        } catch (s3Error) {
          console.error('Error deleting file from S3:', s3Error);
        }
      }
      return res.status(400).json({ error: 'Job ID or Task ID is required' });
    }

    let job = null;
    let task = null;
    let customerId = null;
    let createdBy = null;

    if (taskId) {
      // Handle project file upload
      const Task = require('../models/Task');
      task = await Task.findById(taskId);
      if (!task) {
        // Delete uploaded file if task not found
        if (req.file.path && !req.file.location && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        } else if (isS3Configured() && req.file.key) {
          const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: req.file.key,
            }));
          } catch (s3Error) {
            console.error('Error deleting file from S3:', s3Error);
          }
        }
        return res.status(404).json({ error: 'Task/Project not found' });
      }
      customerId = task.customerId;
      createdBy = req.user?._id || task.createdBy;
    } else if (jobId) {
      // Handle job file upload (existing logic)
      job = await Job.findById(jobId);
      if (!job) {
        // Delete uploaded file if job not found
        if (req.file.path && !req.file.location && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        } else if (isS3Configured() && req.file.key) {
          const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: req.file.key,
            }));
          } catch (s3Error) {
            console.error('Error deleting file from S3:', s3Error);
          }
        }
        return res.status(404).json({ error: 'Job not found' });
      }
      customerId = job.customerId;
      createdBy = req.user?._id || job.createdBy;
    }
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      } else {
        // Delete uploaded file if no user available
        if (req.file.path && !req.file.location && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        } else if (isS3Configured() && req.file.key) {
          const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
          try {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: req.file.key,
            }));
          } catch (s3Error) {
            console.error('Error deleting file from S3:', s3Error);
          }
        }
        return res.status(400).json({ error: 'No user available' });
      }
    }

    // Determine file location based on storage type
    let filePath;
    let s3Key;
    
    if (isS3Configured() && (req.file.location || req.file.key)) {
      // File was uploaded to S3 (multer-s3 provides location and key)
      s3Key = req.file.key || (req.file.location ? req.file.location.split('/').slice(-2).join('/') : null);
      filePath = s3Key; // Store S3 key as path for backward compatibility
      console.log('Upload - File uploaded to S3:', s3Key);
      console.log('Upload - req.file.location:', req.file.location);
      console.log('Upload - req.file.key:', req.file.key);
    } else {
      // File was uploaded to local filesystem
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
      
      filePath = absolutePath;
      console.log('Upload - File stored locally:', filePath);
    }

    // Get filename - multer-s3 uses 'key' instead of 'filename'
    const filename = req.file.filename || (req.file.key ? req.file.key.split('/').pop() : 'unknown');
    
    const file = new File({
      jobId: job?._id || undefined,
      taskId: task?._id || undefined,
      customerId: customerId || undefined,
      filename: filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype || req.file.contentType,
      size: req.file.size,
      path: filePath,
      s3Key: s3Key, // Store S3 key separately
      fileType: fileType,
      uploadedBy: createdBy
    });

    await file.save();

    // Log activity
    if (createdBy) {
      await Activity.create({
        type: 'file_uploaded',
        jobId: job?._id || undefined,
        customerId: customerId || undefined,
        fileName: req.file.originalname,
        fileId: file._id,
        createdBy: createdBy
      });
    }

    await file.populate('uploadedBy', 'name email');

    res.status(201).json(file);
  } catch (error) {
    // Clean up uploaded file on error (only for local files)
    if (req.file && req.file.path && !req.file.location && fs.existsSync(req.file.path)) {
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

// Get files for a task/project
async function getTaskFiles(req, res) {
  try {
    const { taskId } = req.params;

    const files = await File.find({ taskId })
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

    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.mimetype);

    const fileStream = await getFileStream(file);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: error.message || 'Failed to download file' });
  }
}

// Get file (for viewing images/PDFs)
async function getFile(req, res) {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);

    const fileStream = await getFileStream(file);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(500).json({ error: error.message || 'Failed to retrieve file' });
  }
}

// Delete file
async function deleteFile(req, res) {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete physical file from S3 or local filesystem
    if (isS3Configured() && isS3File(file)) {
      // Delete from S3
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const s3Key = file.s3Key || file.path;
      try {
        const command = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
        });
        await s3Client.send(command);
        console.log('File deleted from S3:', s3Key);
      } catch (error) {
        console.error('Error deleting file from S3:', error);
        // Continue with database deletion even if S3 deletion fails
      }
    } else {
      // Delete from local filesystem
      const filePath = findLocalFilePath(file);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('File deleted from local filesystem:', filePath);
      }
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
  getTaskFiles,
  downloadFile,
  getFile,
  deleteFile
};

