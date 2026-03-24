const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const fs = require('fs');
const { s3Client, BUCKET_NAME, isS3Configured } = require('../config/s3');

const imageFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed for logos (JPEG, PNG, GIF, WebP, SVG).'), false);
  }
};

let storage;

if (isS3Configured()) {
  storage = multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME,
    acl: 'private',
    key: (req, file, cb) => {
      const tid = req.user?.tenantId ? String(req.user.tenantId) : 'unknown';
      const ext = path.extname(file.originalname) || '.png';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `tenant-logos/${tid}/logo-${unique}${ext}`);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
  });
} else {
  const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
  const tenantLogosRoot = path.join(uploadsDir, 'tenant-logos');
  if (!fs.existsSync(tenantLogosRoot)) {
    fs.mkdirSync(tenantLogosRoot, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const tid = req.user?.tenantId ? String(req.user.tenantId) : 'unknown';
      const dir = path.join(tenantLogosRoot, tid);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `logo-${unique}${ext}`);
    },
  });
}

const uploadTenantLogo = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

module.exports = uploadTenantLogo;
