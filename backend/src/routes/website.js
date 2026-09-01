const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const uploadWebsiteImage = require('../middleware/uploadWebsiteImage');
const {
  getWebsite,
  updateWebsite,
  uploadHeroPhoto,
  deleteHeroPhoto,
  uploadGalleryPhoto,
  deleteGalleryPhoto,
  createProject,
  updateProject,
  deleteProject,
  uploadProjectPhoto,
  reorderWebsite,
  getPublicWebsite,
  getPublicWebsiteMedia,
} = require('../controllers/websiteController');

router.get('/public', getPublicWebsite);
router.get('/public/media/:tenantId/:assetId', getPublicWebsiteMedia);

router.use(requireAuth, requireSuperAdmin);

router.get('/', getWebsite);
router.put('/', updateWebsite);
router.patch('/order', reorderWebsite);
router.post('/hero', uploadWebsiteImage.single('file'), uploadHeroPhoto);
router.delete('/hero/:assetId', deleteHeroPhoto);
router.post('/gallery', uploadWebsiteImage.single('file'), uploadGalleryPhoto);
router.delete('/gallery/:assetId', deleteGalleryPhoto);
router.post('/projects', createProject);
router.patch('/projects/:projectId', updateProject);
router.delete('/projects/:projectId', deleteProject);
router.post('/projects/:projectId/photo', uploadWebsiteImage.single('file'), uploadProjectPhoto);

module.exports = router;
