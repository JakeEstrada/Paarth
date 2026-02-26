const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  uploadFile,
  getJobFiles,
  getTaskFiles,
  downloadFile,
  getFile,
  deleteFile
} = require('../controllers/fileController');

//router.use(requireAuth);

router.post('/upload', upload.single('file'), uploadFile);
router.get('/job/:jobId', getJobFiles);
router.get('/task/:taskId', getTaskFiles);
router.get('/:id/download', downloadFile);
router.get('/:id', getFile);
router.delete('/:id', deleteFile);

module.exports = router;

