const { S3Client } = require('@aws-sdk/client-s3');

// Check if S3 is configured
const isS3Configured = () => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET_NAME
  );
};

// Initialize S3 client only if configured
let s3Client = null;
if (isS3Configured()) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  console.log('S3 client initialized with bucket:', process.env.AWS_S3_BUCKET_NAME, 'in region:', process.env.AWS_REGION || 'us-east-2');
} else {
  console.log('S3 not configured - using local file storage');
  console.log('Missing environment variables:', {
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    hasBucket: !!process.env.AWS_S3_BUCKET_NAME,
    hasRegion: !!process.env.AWS_REGION,
  });
}

// S3 bucket name
const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

module.exports = {
  s3Client,
  BUCKET_NAME,
  isS3Configured,
};

