const Tenant = require('../models/Tenant');
const { getFileStream, deleteStoredFileBinary } = require('./fileController');

// 1x1 transparent PNG — used when a tenant has no logo yet so <img> requests don't 404 cross-origin.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=',
  'base64'
);

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

function getLogoFieldName(themeMode) {
  return themeMode === 'dark' ? 'logoDark' : 'logoLight';
}

function resolveLogoObject(tenant, themeMode) {
  const field = getLogoFieldName(themeMode);
  if (tenant && tenant[field] && (tenant[field].path || tenant[field].s3Key || tenant[field].filename)) {
    return { field, logo: tenant[field] };
  }
  // Backward compatibility:
  // - Light mode: if no themed light logo exists, fall back to legacy `logo`.
  // - Dark mode: fall back to light logo (logoLight or legacy `logo`) when no dark logo exists.
  if (themeMode === 'dark' && tenant && tenant.logoLight && (tenant.logoLight.path || tenant.logoLight.s3Key || tenant.logoLight.filename)) {
    return { field: 'logoLight', logo: tenant.logoLight };
  }
  if (tenant && tenant.logo && (tenant.logo.path || tenant.logo.s3Key || tenant.logo.filename)) {
    return { field: 'logo', logo: tenant.logo };
  }
  return { field, logo: null };
}

/** super_admin only: replace tenant organization logo (themeMode: 'light'|'dark') */
async function uploadTenantThemeLogo(req, res, themeMode = 'light') {
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

    const targetField = getLogoFieldName(themeMode);
    // Delete previous file if exists
    const previous =
      themeMode === 'light'
        ? tenant[targetField] || tenant.logo
        : tenant[targetField];
    if (previous && (previous.path || previous.s3Key || previous.filename)) {
      await deleteStoredFileBinary({
        filename: previous.filename,
        path: previous.path,
        s3Key: previous.s3Key,
        mimetype: previous.mimetype,
      });
    }

    const payload = logoPayloadFromMulterFile(req.file);
    tenant[targetField] = payload;
    // Backward compatibility for older consumers:
    // - Keep legacy `logo` in sync for light uploads.
    // - If `logoDark` is missing, initialize it once from the light upload
    //   (so dark doesn't start "empty", but future light uploads won't overwrite it).
    if (themeMode === 'light') {
      tenant.logo = payload;
      const darkMissing = !tenant.logoDark || !(tenant.logoDark.path || tenant.logoDark.s3Key || tenant.logoDark.filename);
      if (darkMissing) tenant.logoDark = payload;
    }
    await tenant.save();

    res.json({
      message: 'Logo updated successfully',
      brandingPath: `/tenants/branding/${tenant._id}/logo?mode=${themeMode}`,
      tenant: {
        _id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
        [targetField]: tenant[targetField],
      },
    });
  } catch (error) {
    console.error('uploadTenantThemeLogo:', error);
    res.status(500).json({ error: error.message || 'Failed to upload logo' });
  }
}

/** super_admin only: replace tenant organization logo (light) */
async function uploadTenantLogo(req, res) {
  return uploadTenantThemeLogo(req, res, 'light');
}

async function uploadTenantLogoLight(req, res) {
  return uploadTenantThemeLogo(req, res, 'light');
}

async function uploadTenantLogoDark(req, res) {
  return uploadTenantThemeLogo(req, res, 'dark');
}

/** Public: stream logo for img tags (login sidebar, etc.) */
async function getTenantBrandingLogo(req, res) {
  try {
    const { tenantId } = req.params;
    const themeMode = String(req.query.mode || 'light').toLowerCase() === 'dark' ? 'dark' : 'light';

    const tenant = await Tenant.findById(tenantId).select('logo logoLight logoDark');
    const resolved = resolveLogoObject(tenant, themeMode);
    if (!resolved.logo) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).end(TRANSPARENT_PNG);
    }

    const pseudoFile = {
      filename: resolved.logo.filename,
      path: resolved.logo.path,
      s3Key: resolved.logo.s3Key,
      mimetype: resolved.logo.mimetype,
    };

    res.setHeader('Content-Type', resolved.logo.mimetype || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Allow cross-origin <img> / fetch from Vite dev server (Firefox ORB / canvas use)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const stream = await getFileStream(pseudoFile);
    stream.on('error', (err) => {
      console.error('getTenantBrandingLogo stream:', err);
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy();
      }
    });
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
  uploadTenantLogoLight,
  uploadTenantLogoDark,
  getTenantBrandingLogo,
  getTenantPipelineSettings,
  updateTenantPipelineSettings,
};
