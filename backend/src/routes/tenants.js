const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const uploadTenantLogo = require('../middleware/uploadTenantLogo');
const {
  uploadTenantLogo: uploadTenantLogoHandler,
  getTenantBrandingLogo,
  getTenantPipelineSettings,
  updateTenantPipelineSettings,
} = require('../controllers/tenantController');

// Public branding image (no auth — used on login page with tenant id)
router.get('/branding/:tenantId/logo', getTenantBrandingLogo);

router.post('/logo', requireAuth, uploadTenantLogo.single('logo'), uploadTenantLogoHandler);

router.get('/pipeline-settings', requireAuth, getTenantPipelineSettings);
router.patch('/pipeline-settings', requireAuth, updateTenantPipelineSettings);

module.exports = router;
