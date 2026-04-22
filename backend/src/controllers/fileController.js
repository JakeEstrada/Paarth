const File = require('../models/File');
const DocumentFolder = require('../models/DocumentFolder');
const Job = require('../models/Job');
const Customer = require('../models/Customer');
const Activity = require('../models/Activity');
const fs = require('fs');
const path = require('path');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME, isS3Configured } = require('../config/s3');

// Get uploads directory - same as in upload.js middleware
// Use environment variable if set, otherwise use relative path
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
const DOCUMENT_TEXT_DIR = path.join(UPLOADS_DIR, 'documents-text');
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function sanitizePathSegment(segment) {
  return String(segment || '')
    .trim()
    .replace(/[<>:"\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');
}

function ensureTxtExtension(name) {
  return name.toLowerCase().endsWith('.txt') ? name : `${name}.txt`;
}

function sanitizeDisplayFilename(raw) {
  const base = path.basename(String(raw || '').trim());
  if (!base) return '';
  return base
    .replace(/[<>:"\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 220);
}

function hasAnyValue(input) {
  if (input == null) return false;
  if (typeof input === 'string') return input.trim().length > 0;
  if (typeof input === 'number') return Number.isFinite(input);
  if (typeof input === 'boolean') return input;
  if (Array.isArray(input)) return input.length > 0 && input.some((v) => hasAnyValue(v));
  if (typeof input === 'object') return Object.values(input).some((v) => hasAnyValue(v));
  return false;
}

async function resolveFolderPath(folderPath, createdBy) {
  if (!folderPath) return null;
  const segments = String(folderPath)
    .split('/')
    .map((part) => sanitizePathSegment(part))
    .filter(Boolean);

  let parentId = null;
  for (const segment of segments) {
    let folder = await DocumentFolder.findOne({ parentId, name: segment });
    if (!folder) {
      folder = await DocumentFolder.create({
        name: segment,
        parentId,
        createdBy,
      });
    }
    parentId = folder._id;
  }

  return parentId;
}

async function findOrCreateFolderByName(parentId, name, createdBy) {
  let folder = await DocumentFolder.findOne({ parentId, name });
  if (folder) return folder;
  folder = await DocumentFolder.create({ name, parentId, createdBy });
  return folder;
}

function formatDateOrDash(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString();
}

function buildEstimateSummary(job) {
  const e = job?.estimate || {};
  const lineItems = Array.isArray(e.lineItems) ? e.lineItems : [];
  const lines = [
    `Job: ${job.title || 'Untitled'}`,
    `Estimate Number: ${e.number || '-'}`,
    `Estimate Date: ${e.estimateDate || '-'}`,
    `Amount: ${e.amount != null ? e.amount : '-'}`,
    `Sent At: ${formatDateOrDash(e.sentAt)}`,
    `Project Name: ${e.projectName || '-'}`,
    '',
    'Line Items:',
  ];
  if (!lineItems.length) {
    lines.push('- (none)');
  } else {
    lineItems.forEach((li, i) => {
      lines.push(
        `${i + 1}. ${li.itemName || li.description || 'Item'} | Qty: ${li.quantity ?? '-'} | Unit: ${li.unitPrice ?? '-'} | Total: ${li.total ?? '-'}`
      );
    });
  }
  if (e.footerNote) {
    lines.push('', 'Footer Note:', e.footerNote);
  }
  return lines.join('\n');
}

function buildContractSummary(job) {
  const c = job?.contract || {};
  return [
    `Job: ${job.title || 'Untitled'}`,
    `Signed At: ${formatDateOrDash(c.signedAt)}`,
    `Deposit Required: ${c.depositRequired ?? '-'}`,
    `Deposit Received: ${c.depositReceived ?? '-'}`,
    `Deposit Received At: ${formatDateOrDash(c.depositReceivedAt)}`,
  ].join('\n');
}

function buildInvoicesSummary(job) {
  const invoices = Array.isArray(job?.invoices) ? job.invoices : [];
  const lines = [`Job: ${job.title || 'Untitled'}`, '', 'Invoices:'];
  invoices.forEach((inv, idx) => {
    lines.push(
      `${idx + 1}. ${inv.kind || 'invoice'} | ${inv.label || '-'} | Amount: ${inv.amount ?? '-'} | Estimate: ${inv.estimateNumber || '-'} | Date: ${inv.invoiceDate || '-'}`
    );
  });
  return lines.join('\n');
}

function buildTakeoffSummary(job) {
  const t = job?.takeoff || {};
  const lines = [
    `Job: ${job.title || 'Untitled'}`,
    `Completed At: ${formatDateOrDash(t.completedAt)}`,
    `Notes: ${t.notes || '-'}`,
    `Sheet Updated At: ${formatDateOrDash(t.sheetUpdatedAt)}`,
  ];
  if (t.sheetData != null) {
    lines.push('', 'Sheet Data JSON:', JSON.stringify(t.sheetData, null, 2));
  }
  return lines.join('\n');
}

async function upsertGeneratedTextDocument({
  customerId,
  jobId,
  kind,
  folderId,
  createdBy,
  originalName,
  content,
}) {
  const marker = `[AUTO_DOC:${kind}] customer:${String(customerId)} job:${String(jobId)}`;
  const existing = await File.findOne({
    customerId,
    jobId: null,
    taskId: null,
    description: marker,
  });

  fs.mkdirSync(DOCUMENT_TEXT_DIR, { recursive: true });

  if (existing) {
    const filePath = findLocalFilePath(existing) || existing.path;
    if (filePath && path.isAbsolute(filePath)) {
      fs.writeFileSync(filePath, content, 'utf8');
      existing.path = filePath;
    }
    existing.originalName = originalName;
    existing.folderId = folderId;
    existing.size = Buffer.byteLength(content, 'utf8');
    existing.description = marker;
    await existing.save();
    return;
  }

  const baseName = sanitizePathSegment(originalName.replace(/\.txt$/i, '')) || `${kind}-summary`;
  const diskName = `${baseName}-${Date.now()}.txt`;
  const diskPath = path.join(DOCUMENT_TEXT_DIR, diskName);
  fs.writeFileSync(diskPath, content, 'utf8');

  await File.create({
    jobId: undefined,
    taskId: undefined,
    customerId,
    folderId,
    filename: diskName,
    originalName,
    mimetype: 'text/plain',
    size: Buffer.byteLength(content, 'utf8'),
    path: diskPath,
    fileType: 'other',
    uploadedBy: createdBy,
    description: marker,
  });
}

async function ensureCustomerDocumentLibrary(createdBy) {
  if (!createdBy) return;

  const customers = await Customer.find({}, '_id name').sort({ name: 1 }).lean();
  if (!customers.length) return;

  const customersRoot = await findOrCreateFolderByName(null, 'Customers', createdBy);
  const foldersUnderRoot = await DocumentFolder.find({ parentId: customersRoot._id }, '_id name').lean();
  const folderByName = new Map(foldersUnderRoot.map((f) => [f.name, String(f._id)]));
  const customerFolderById = new Map();
  const usedNames = new Set(foldersUnderRoot.map((f) => f.name));

  for (const customer of customers) {
    const preferred = sanitizePathSegment(customer.name) || `Customer-${String(customer._id).slice(-6)}`;
    let folderName = preferred;
    if (usedNames.has(folderName) && !folderByName.has(folderName)) {
      folderName = `${preferred} (${String(customer._id).slice(-6)})`;
    }
    if (!folderByName.has(folderName) && usedNames.has(folderName)) {
      folderName = `${preferred} (${String(customer._id).slice(-6)})`;
    }
    if (!folderByName.has(folderName)) {
      const folder = await findOrCreateFolderByName(customersRoot._id, folderName, createdBy);
      folderByName.set(folderName, String(folder._id));
      usedNames.add(folderName);
    }
    customerFolderById.set(String(customer._id), folderByName.get(folderName));
  }

  const filesWithCustomer = await File.find(
    {
      customerId: { $in: customers.map((c) => c._id) },
      folderId: null,
    },
    '_id customerId'
  ).lean();
  if (filesWithCustomer.length) {
    const bulk = filesWithCustomer
      .map((f) => {
        const folderId = customerFolderById.get(String(f.customerId));
        if (!folderId) return null;
        return {
          updateOne: {
            filter: { _id: f._id },
            update: { $set: { folderId } },
          },
        };
      })
      .filter(Boolean);
    if (bulk.length) await File.bulkWrite(bulk);
  }

  const jobs = await Job.find(
    { customerId: { $in: customers.map((c) => c._id) } },
    'customerId title estimate contract invoices takeoff'
  ).lean();

  for (const job of jobs) {
    const folderId = customerFolderById.get(String(job.customerId));
    if (!folderId) continue;

    if (hasAnyValue(job.estimate)) {
      await upsertGeneratedTextDocument({
        customerId: job.customerId,
        jobId: job._id,
        kind: 'estimate',
        folderId,
        createdBy,
        originalName: `${sanitizePathSegment(job.title) || 'Job'} - Estimate.txt`,
        content: buildEstimateSummary(job),
      });
    }
    if (hasAnyValue(job.contract)) {
      await upsertGeneratedTextDocument({
        customerId: job.customerId,
        jobId: job._id,
        kind: 'contract',
        folderId,
        createdBy,
        originalName: `${sanitizePathSegment(job.title) || 'Job'} - Contract.txt`,
        content: buildContractSummary(job),
      });
    }
    if (Array.isArray(job.invoices) && job.invoices.length > 0) {
      await upsertGeneratedTextDocument({
        customerId: job.customerId,
        jobId: job._id,
        kind: 'invoices',
        folderId,
        createdBy,
        originalName: `${sanitizePathSegment(job.title) || 'Job'} - Invoices.txt`,
        content: buildInvoicesSummary(job),
      });
    }
    if (hasAnyValue(job.takeoff)) {
      await upsertGeneratedTextDocument({
        customerId: job.customerId,
        jobId: job._id,
        kind: 'takeoff',
        folderId,
        createdBy,
        originalName: `${sanitizePathSegment(job.title) || 'Job'} - Takeoff.txt`,
        content: buildTakeoffSummary(job),
      });
    }
  }
}

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

async function deleteStoredFileBinary(file) {
  if (!file) return;
  if (isS3Configured() && isS3File(file)) {
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
    }
    return;
  }

  const filePath = findLocalFilePath(file);
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log('File deleted from local filesystem:', filePath);
  }
}

async function resolveCreatedBy(req, fallbackUserId = null) {
  const User = require('../models/User');
  let createdBy = req.user?._id || req.body?.createdBy || fallbackUserId || null;
  if (!createdBy) {
    const defaultUser = await User.findOne({ isActive: true });
    if (defaultUser) createdBy = defaultUser._id;
  }
  return createdBy;
}

async function getDescendantFolderIds(rootFolderId) {
  const allFolders = await DocumentFolder.find({}, '_id parentId').lean();
  const childrenByParent = new Map();
  allFolders.forEach((f) => {
    const key = f.parentId ? String(f.parentId) : 'root';
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(String(f._id));
  });

  const queue = [String(rootFolderId)];
  const descendants = [];
  while (queue.length > 0) {
    const current = queue.shift();
    descendants.push(current);
    const kids = childrenByParent.get(current) || [];
    kids.forEach((k) => queue.push(k));
  }
  return descendants;
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

    // Log activity (only if customerId exists, as it's required by Activity model)
    if (createdBy && customerId) {
      try {
        await Activity.create({
          type: 'file_uploaded',
          jobId: job?._id || undefined,
          customerId: customerId,
          fileName: req.file.originalname,
          fileId: file._id,
          createdBy: createdBy
        });
      } catch (activityError) {
        // Log but don't fail if activity creation fails (e.g., missing customerId for tasks)
        console.error('Failed to create activity log:', activityError.message);
      }
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

// Upload standalone document (not tied to job or task)
async function uploadDocument(req, res) {
  try {
    const User = require('../models/User');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(req.file.mimetype)) {
      // Delete uploaded file
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
      return res.status(400).json({ error: 'Unsupported file type. Allowed: PDF, TXT, PNG, JPG, WEBP, GIF, DOC, DOCX, XLS, XLSX' });
    }

    const { fileType = 'other', folderId } = req.body;

    // Handle createdBy
    let createdBy = req.user?._id || req.body.createdBy;
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
      s3Key = req.file.key || (req.file.location ? req.file.location.split('/').slice(-2).join('/') : null);
      filePath = s3Key;
      console.log('Upload Document - File uploaded to S3:', s3Key);
    } else {
      let absolutePath = req.file.path;
      if (!path.isAbsolute(absolutePath)) {
        absolutePath = path.resolve(UPLOADS_DIR, req.file.filename);
      }
      if (!fs.existsSync(absolutePath)) {
        if (fs.existsSync(req.file.path)) {
          absolutePath = path.resolve(req.file.path);
        }
      }
      filePath = absolutePath;
      console.log('Upload Document - File stored locally:', filePath);
    }

    let resolvedFolderId = null;
    if (folderId) {
      const folder = await DocumentFolder.findById(folderId).select('_id');
      if (!folder) {
        await deleteStoredFileBinary({
          ...req.file,
          path: filePath,
          s3Key,
          filename: req.file.filename || (req.file.key ? req.file.key.split('/').pop() : 'unknown'),
        });
        return res.status(404).json({ error: 'Folder not found' });
      }
      resolvedFolderId = folder._id;
    }

    const filename = req.file.filename || (req.file.key ? req.file.key.split('/').pop() : 'unknown');
    
    const file = new File({
      jobId: undefined,
      taskId: undefined,
      customerId: undefined,
      filename: filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype || req.file.contentType,
      size: req.file.size,
      path: filePath,
      s3Key: s3Key,
      fileType: fileType,
      uploadedBy: createdBy,
      folderId: resolvedFolderId,
      description: req.body.description ? String(req.body.description).trim() : undefined,
    });

    await file.save();
    await file.populate('uploadedBy', 'name email');

    res.status(201).json(file);
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && req.file.path && !req.file.location && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
}

// Get all standalone documents (not tied to jobs or tasks)
async function getDocuments(req, res) {
  try {
    const { folderId = null } = req.query;
    const query = {};
    if (folderId === 'root' || folderId === '' || folderId === 'null' || folderId === null) {
      query.jobId = null;
      query.taskId = null;
      query.folderId = null;
    } else if (folderId) {
      query.folderId = folderId;
    }

    const files = await File.find({
      ...query,
    })
      .populate('uploadedBy', 'name email')
      .populate('folderId', 'name parentId')
      .sort({ createdAt: -1 });

    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createTextDocument(req, res) {
  try {
    const rawPath = String(req.body.path || '').trim();
    if (!rawPath) return res.status(400).json({ error: 'Path is required' });

    const createdBy = await resolveCreatedBy(req);
    if (!createdBy) return res.status(400).json({ error: 'No user available' });

    const parts = rawPath.split('/').map((p) => sanitizePathSegment(p)).filter(Boolean);
    if (parts.length === 0) return res.status(400).json({ error: 'Path is invalid' });

    const fileNameRaw = ensureTxtExtension(parts.pop());
    const folderPath = parts.join('/');
    const folderId = await resolveFolderPath(folderPath, createdBy);

    const now = Date.now();
    const safeBase = sanitizePathSegment(fileNameRaw.replace(/\.txt$/i, '')) || 'untitled';
    const diskName = `${safeBase}-${now}.txt`;
    const content = String(req.body.content || '');

    fs.mkdirSync(DOCUMENT_TEXT_DIR, { recursive: true });
    const diskPath = path.join(DOCUMENT_TEXT_DIR, diskName);
    fs.writeFileSync(diskPath, content, 'utf8');

    const file = await File.create({
      jobId: undefined,
      taskId: undefined,
      customerId: undefined,
      folderId: folderId || null,
      filename: diskName,
      originalName: fileNameRaw,
      mimetype: 'text/plain',
      size: Buffer.byteLength(content, 'utf8'),
      path: diskPath,
      fileType: 'other',
      uploadedBy: createdBy,
      description: req.body.description ? String(req.body.description).trim() : undefined,
    });

    await file.populate('uploadedBy', 'name email');
    await file.populate('folderId', 'name parentId');
    return res.status(201).json(file);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'A folder with this name already exists in that location' });
    return res.status(500).json({ error: error.message || 'Failed to create file' });
  }
}

async function getTextDocument(req, res) {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (file.mimetype !== 'text/plain') return res.status(400).json({ error: 'Only text documents are editable' });

    const filePath = findLocalFilePath(file);
    if (!filePath) return res.status(404).json({ error: 'File not found on server' });
    const content = fs.readFileSync(filePath, 'utf8');
    return res.json({
      _id: file._id,
      originalName: file.originalName,
      folderId: file.folderId || null,
      content,
      updatedAt: file.updatedAt,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load file content' });
  }
}

async function updateTextDocument(req, res) {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (file.mimetype !== 'text/plain') return res.status(400).json({ error: 'Only text documents are editable' });

    const content = String(req.body.content || '');
    const filePath = findLocalFilePath(file);
    if (!filePath) return res.status(404).json({ error: 'File not found on server' });
    fs.writeFileSync(filePath, content, 'utf8');

    file.size = Buffer.byteLength(content, 'utf8');
    if (req.body.originalName !== undefined) {
      const nextName = ensureTxtExtension(sanitizePathSegment(req.body.originalName));
      if (!nextName || nextName === '.txt') return res.status(400).json({ error: 'File name cannot be empty' });
      file.originalName = nextName;
    }
    if (req.body.description !== undefined) {
      file.description = req.body.description ? String(req.body.description).trim() : '';
    }
    await file.save();
    await file.populate('uploadedBy', 'name email');
    await file.populate('folderId', 'name parentId');
    return res.json(file);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to save file' });
  }
}

async function getDocumentTree(req, res) {
  try {
    const createdBy = await resolveCreatedBy(req);
    await ensureCustomerDocumentLibrary(createdBy);

    const [folders, files] = await Promise.all([
      DocumentFolder.find({})
        .populate('createdBy', 'name email')
        .sort({ name: 1 })
        .lean(),
      File.find({
        $or: [
          { jobId: null, taskId: null },
          { folderId: { $ne: null } },
        ],
      })
        .populate('uploadedBy', 'name email')
        .populate('folderId', 'name parentId')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({ folders, files });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load document tree' });
  }
}

async function createDocumentFolder(req, res) {
  try {
    const name = String(req.body.name || '').trim();
    const parentId = req.body.parentId || null;
    if (!name) return res.status(400).json({ error: 'Folder name is required' });

    if (parentId) {
      const parent = await DocumentFolder.findById(parentId).select('_id');
      if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
    }

    const createdBy = await resolveCreatedBy(req);
    if (!createdBy) return res.status(400).json({ error: 'No user available' });

    const folder = await DocumentFolder.create({ name, parentId, createdBy });
    await folder.populate('createdBy', 'name email');
    res.status(201).json(folder);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'A folder with this name already exists in that location' });
    res.status(500).json({ error: error.message || 'Failed to create folder' });
  }
}

async function updateDocumentFolder(req, res) {
  try {
    const folder = await DocumentFolder.findById(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Folder name cannot be empty' });
      updates.name = name;
    }

    if (req.body.parentId !== undefined) {
      const nextParent = req.body.parentId || null;
      if (nextParent && String(nextParent) === String(folder._id)) {
        return res.status(400).json({ error: 'Folder cannot be its own parent' });
      }
      if (nextParent) {
        const parent = await DocumentFolder.findById(nextParent).select('_id');
        if (!parent) return res.status(404).json({ error: 'Parent folder not found' });

        const descendants = await getDescendantFolderIds(folder._id);
        if (descendants.includes(String(nextParent))) {
          return res.status(400).json({ error: 'Cannot move a folder into its own descendant' });
        }
      }
      updates.parentId = nextParent;
    }

    Object.assign(folder, updates);
    await folder.save();
    await folder.populate('createdBy', 'name email');
    res.json(folder);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'A folder with this name already exists in that location' });
    res.status(500).json({ error: error.message || 'Failed to update folder' });
  }
}

async function deleteDocumentFolder(req, res) {
  try {
    const folder = await DocumentFolder.findById(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const recursive = req.query.recursive === 'true' || req.body?.recursive === true;

    if (!recursive) {
      const [childFoldersCount, childFilesCount] = await Promise.all([
        DocumentFolder.countDocuments({ parentId: folder._id }),
        File.countDocuments({ folderId: folder._id }),
      ]);
      if (childFoldersCount > 0 || childFilesCount > 0) {
        return res.status(400).json({ error: 'Folder is not empty. Use recursive delete.' });
      }
      await DocumentFolder.findByIdAndDelete(folder._id);
      return res.json({ message: 'Folder deleted' });
    }

    const folderIds = await getDescendantFolderIds(folder._id);
    const filesToDelete = await File.find({
      folderId: { $in: folderIds },
    });
    for (const file of filesToDelete) {
      await deleteStoredFileBinary(file);
    }
    await File.deleteMany({ _id: { $in: filesToDelete.map((f) => f._id) } });
    await DocumentFolder.deleteMany({ _id: { $in: folderIds } });

    res.json({
      message: 'Folder and descendants deleted',
      deletedFolders: folderIds.length,
      deletedFiles: filesToDelete.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete folder' });
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

// Update file (e.g., description, move, display name for standalone library files)
async function updateFile(req, res) {
  try {
    const existing = await File.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'File not found' });
    }

    const update = {};
    if (req.body.description !== undefined) {
      update.description = req.body.description ? String(req.body.description).trim() : '';
    }
    if (req.body.folderId !== undefined) {
      const nextFolderId = req.body.folderId || null;
      if (nextFolderId) {
        const folder = await DocumentFolder.findById(nextFolderId).select('_id');
        if (!folder) return res.status(404).json({ error: 'Folder not found' });
      }
      update.folderId = nextFolderId;
    }

    if (req.body.originalName !== undefined) {
      const isStandalone = !existing.jobId && !existing.taskId;
      if (!isStandalone) {
        return res.status(400).json({ error: 'Renaming is only supported for library documents' });
      }
      let next = sanitizeDisplayFilename(req.body.originalName);
      if (!next) return res.status(400).json({ error: 'Invalid file name' });
      if (existing.mimetype === 'text/plain') {
        next = ensureTxtExtension(sanitizePathSegment(next.replace(/\.txt$/i, '')) || 'untitled');
      }
      update.originalName = next;
    }

    const file = await File.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    })
      .populate('uploadedBy', 'name email')
      .populate('folderId', 'name parentId');

    res.json(file);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update file' });
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
    await deleteStoredFileBinary(file);

    // Log activity before deleting
    const User = require('../models/User');
    let createdBy = req.user?._id || file.uploadedBy;
    if (!createdBy) {
      const defaultUser = await User.findOne({ isActive: true });
      if (defaultUser) {
        createdBy = defaultUser._id;
      }
    }

    // Log activity only if file is associated with a job or customer
    if (createdBy && (file.jobId || file.customerId)) {
      try {
        await Activity.create({
          type: 'file_deleted',
          jobId: file.jobId || undefined,
          customerId: file.customerId || undefined,
          fileName: file.originalName,
          createdBy: createdBy
        });
      } catch (activityError) {
        // Log but don't fail if activity creation fails (e.g., for standalone documents)
        console.error('Failed to create activity log:', activityError.message);
      }
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
  uploadDocument,
  getDocuments,
  createTextDocument,
  getTextDocument,
  updateTextDocument,
  getDocumentTree,
  createDocumentFolder,
  updateDocumentFolder,
  deleteDocumentFolder,
  downloadFile,
  getFile,
  deleteFile,
  updateFile,
  getFileStream,
  deleteStoredFileBinary,
};

