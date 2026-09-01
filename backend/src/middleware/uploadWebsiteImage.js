const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const fs = require('fs');
const { s3Client, BUCKET_NAME, isS3Configured } = require('../config/s3');

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP).'), false);
  }
};

let storage;

if (isS3Configured()) {
  storage = multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME,
    key: (req, file, cb) => {
      const tid = req.user?.tenantId ? String(req.user.tenantId) : 'unknown';
      const ext = path.extname(file.originalname) || '.jpg';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `website/${tid}/${unique}${ext}`);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
  });
} else {
  const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
  const websiteRoot = path.join(uploadsDir, 'website');
  if (!fs.existsSync(websiteRoot)) {
    fs.mkdirSync(websiteRoot, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const tid = req.user?.tenantId ? String(req.user.tenantId) : 'unknown';
      const dir = path.join(websiteRoot, tid);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${ext}`);
    },
  });
}

const uploadWebsiteImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});

module.exports = uploadWebsiteImage;
