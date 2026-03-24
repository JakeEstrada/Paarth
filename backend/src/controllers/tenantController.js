const Tenant = require('../models/Tenant');
const { getFileStream, deleteStoredFileBinary } = require('./fileController');

function logoPayloadFromMulterFile(file) {
  if (!file) return null;
  if (file.key) {
    return {
      filename: file.originalname || 'logo.png',
      path: file.key,
      s3Key: file.key,
      mimetype: file.mimetype || 'image/png',
    };
  }
  return {
    filename: file.filename,
    path: file.path,
    s3Key: undefined,
    mimetype: file.mimetype || 'image/png',
  };
}

/** super_admin only: replace tenant organization logo */
async function uploadTenantLogo(req, res) {
  try {
    if (!req.user || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only the organization super admin can upload a logo.' });
    }
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Your account is not linked to an organization.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    if (tenant.logo && (tenant.logo.path || tenant.logo.s3Key || tenant.logo.filename)) {
      await deleteStoredFileBinary({
        filename: tenant.logo.filename,
        path: tenant.logo.path,
        s3Key: tenant.logo.s3Key,
        mimetype: tenant.logo.mimetype,
      });
    }

    tenant.logo = logoPayloadFromMulterFile(req.file);
    await tenant.save();

    res.json({
      message: 'Logo updated successfully',
      brandingPath: `/tenants/branding/${tenant._id}/logo`,
      tenant: {
        _id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        logo: tenant.logo,
      },
    });
  } catch (error) {
    console.error('uploadTenantLogo:', error);
    res.status(500).json({ error: error.message || 'Failed to upload logo' });
  }
}

/** Public: stream logo for img tags (login sidebar, etc.) */
async function getTenantBrandingLogo(req, res) {
  try {
    const { tenantId } = req.params;
    const tenant = await Tenant.findById(tenantId).select('logo');
    if (!tenant || !tenant.logo || (!tenant.logo.path && !tenant.logo.s3Key)) {
      return res.status(404).end();
    }

    const pseudoFile = {
      filename: tenant.logo.filename,
      path: tenant.logo.path,
      s3Key: tenant.logo.s3Key,
      mimetype: tenant.logo.mimetype,
    };

    res.setHeader('Content-Type', tenant.logo.mimetype || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stream = await getFileStream(pseudoFile);
    stream.pipe(res);
  } catch (error) {
    console.error('getTenantBrandingLogo:', error);
    res.status(500).end();
  }
}

module.exports = {
  uploadTenantLogo,
  getTenantBrandingLogo,
};
