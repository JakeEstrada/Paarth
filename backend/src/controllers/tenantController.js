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

function sanitizePipelineOverrides(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(k)) continue;
    if (v == null || typeof v !== 'object' || Array.isArray(v)) continue;
    const entry = {};
    if (typeof v.hidden === 'boolean') entry.hidden = v.hidden;
    if (v.label != null && String(v.label).trim()) entry.label = String(v.label).trim().slice(0, 160);
    if (Object.keys(entry).length) out[k] = entry;
  }
  return out;
}

/** Any authenticated user in the tenant can read (labels must match for everyone). */
async function getTenantPipelineSettings(req, res) {
  try {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Your account is not linked to an organization.' });
    }
    const tenant = await Tenant.findById(tenantId).select('pipelineStageOverrides').lean();
    if (!tenant) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    const o = tenant.pipelineStageOverrides;
    const overrides = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    res.json({ overrides });
  } catch (error) {
    console.error('getTenantPipelineSettings:', error);
    res.status(500).json({ error: error.message || 'Failed to load pipeline settings' });
  }
}

/** Match frontend canModifyPipeline: super_admin + admin only */
async function updateTenantPipelineSettings(req, res) {
  try {
    if (!req.user || !['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to update pipeline settings.' });
    }
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Your account is not linked to an organization.' });
    }
    const { overrides } = req.body;
    const sanitized = sanitizePipelineOverrides(overrides);
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    tenant.pipelineStageOverrides = sanitized;
    await tenant.save();
    res.json({ overrides: sanitized });
  } catch (error) {
    console.error('updateTenantPipelineSettings:', error);
    res.status(500).json({ error: error.message || 'Failed to save pipeline settings' });
  }
}

module.exports = {
  uploadTenantLogo,
  getTenantBrandingLogo,
  getTenantPipelineSettings,
  updateTenantPipelineSettings,
};
