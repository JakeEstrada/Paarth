const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  uploadFile,
  getJobFiles,
  getTaskFiles,
  uploadDocument,
  downloadFile,
  getFile,
  deleteFile,
  updateFile,
} = require('../controllers/fileController');

//router.use(requireAuth);

router.post('/upload', upload.single('file'), uploadFile);
/** Standalone file upload (e.g. Finance Hub PDF artifacts, payroll PDFs) — not the removed Documents browser */
router.post('/upload-document', upload.single('file'), uploadDocument);
router.get('/job/:jobId', getJobFiles);
router.get('/task/:taskId', getTaskFiles);
router.get('/:id/download', downloadFile);
router.get('/:id', getFile);
router.patch('/:id', updateFile);
router.delete('/:id', deleteFile);

module.exports = router;
