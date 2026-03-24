const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {
  uploadFile,
  getJobFiles,
  getTaskFiles,
  uploadDocument,
  getDocuments,
  getDocumentTree,
  createDocumentFolder,
  updateDocumentFolder,
  deleteDocumentFolder,
  downloadFile,
  getFile,
  deleteFile,
  updateFile,
} = require('../controllers/fileController');

//router.use(requireAuth);

router.post('/upload', upload.single('file'), uploadFile);
router.post('/upload-document', upload.single('file'), uploadDocument);
router.get('/documents', getDocuments);
router.get('/documents/tree', getDocumentTree);
router.post('/documents/folders', createDocumentFolder);
router.patch('/documents/folders/:id', updateDocumentFolder);
router.delete('/documents/folders/:id', deleteDocumentFolder);
router.get('/job/:jobId', getJobFiles);
router.get('/task/:taskId', getTaskFiles);
router.get('/:id/download', downloadFile);
router.get('/:id', getFile);
router.patch('/:id', updateFile);
router.delete('/:id', deleteFile);

module.exports = router;

