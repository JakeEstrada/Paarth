const fs = require('fs');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME, isS3Configured } = require('../config/s3');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

function mimeFromExt(ext) {
  const value = String(ext || '').toLowerCase();
  if (value === '.png') return 'image/png';
  if (value === '.gif') return 'image/gif';
  if (value === '.webp') return 'image/webp';
  if (value === '.jpg' || value === '.jpeg') return 'image/jpeg';
  return 'image/jpeg';
}

function uniqueFilename(originalName) {
  const ext = path.extname(originalName || '') || '.jpg';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

async function storeWebsiteFileFromDisk(tenantId, localFilePath, originalName) {
  const name = String(originalName || path.basename(localFilePath) || 'photo.jpg').slice(0, 200);
  const filename = uniqueFilename(name);
  const mime = mimeFromExt(path.extname(name));
  const size = fs.statSync(localFilePath).size;

  if (isS3Configured()) {
    const key = `website/${tenantId}/${filename}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fs.createReadStream(localFilePath),
        ContentType: mime,
      }),
    );
    return {
      originalName: name,
      filename,
      path: key,
      s3Key: key,
      mimetype: mime,
      size,
      alt: '',
    };
  }

  const destDir = path.join(UPLOADS_DIR, 'website', String(tenantId));
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, filename);
  fs.copyFileSync(localFilePath, dest);
  return {
    originalName: name,
    filename,
    path: dest,
    s3Key: '',
    mimetype: mime,
    size,
    alt: '',
  };
}

module.exports = {
  mimeFromExt,
  storeWebsiteFileFromDisk,
};
