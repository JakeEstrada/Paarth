const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const fs = require('fs');
const { s3Client, BUCKET_NAME, isS3Configured } = require('../config/s3');

// Determine storage strategy: S3 if configured, otherwise local disk
let storage;

if (isS3Configured()) {
  console.log('Using S3 storage for file uploads');
  // Use S3 storage
  storage = multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME,
    acl: 'private', // Files are private by default
    key: (req, file, cb) => {
      // Generate unique filename: timestamp-random-originalname
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      const filename = `${name}-${uniqueSuffix}${ext}`;
      cb(null, `uploads/${filename}`);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
  });
} else {
  console.log('Using local disk storage for file uploads (S3 not configured)');
  // Fallback to local disk storage
  const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename: timestamp-random-originalname
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
  });
}

// File filter - allow images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

module.exports = upload;

