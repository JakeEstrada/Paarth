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

function setBrandingCorsHeaders(res) {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
}

/** Tenant has no logo on file — return a tiny PNG so <img> does not error cross-origin. */
function sendTransparentLogo(res, maxAge = 300) {
  if (res.headersSent) return;
  setBrandingCorsHeaders(res);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  res.status(200).end(TRANSPARENT_PNG);
}

/** Logo record exists but binary is missing — 404 lets the UI fall back to /logo.png via onError. */
function sendLogoNotFound(res) {
  if (res.headersSent) return;
  setBrandingCorsHeaders(res);
  res.status(404).end();
}

function setBrandingLogoHeaders(res, mimetype, maxAge = 86400) {
  setBrandingCorsHeaders(res);
  res.setHeader('Content-Type', mimetype || 'image/png');
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
}

function hasLogoBinary(logo) {
  return Boolean(logo && (logo.path || logo.s3Key || logo.filename));
}

/** Ordered fallbacks when the preferred theme asset is missing or unreadable. */
function brandingLogoCandidates(tenant, themeMode) {
  const seen = new Set();
  const list = [];
  const add = (logo) => {
    if (!hasLogoBinary(logo)) return;
    const key = `${logo.s3Key || ''}|${logo.path || ''}|${logo.filename || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(logo);
  };

  const primary = resolveLogoObject(tenant, themeMode);
  add(primary.logo);
  if (themeMode === 'dark') {
    add(tenant?.logoLight);
    add(tenant?.logo);
  } else {
    add(tenant?.logo);
    add(tenant?.logoLight);
  }
  add(tenant?.logoDark);
  return list;
}

function streamLogoFile(res, logo) {
  const pseudoFile = {
    filename: logo.filename,
    path: logo.path,
    s3Key: logo.s3Key,
    mimetype: logo.mimetype,
  };

  return new Promise((resolve, reject) => {
    getFileStream(pseudoFile)
      .then((stream) => {
        stream.on('error', reject);
        res.on('error', reject);
        res.on('finish', resolve);
        stream.pipe(res);
      })
      .catch(reject);
  });
}

/** Public: stream logo for img tags (login sidebar, etc.) */
async function getTenantBrandingLogo(req, res) {
  try {
    const { tenantId } = req.params;
    const themeMode = String(req.query.mode || 'light').toLowerCase() === 'dark' ? 'dark' : 'light';

    const tenant = await Tenant.findById(tenantId).select('logo logoLight logoDark');
    if (!tenant) {
      return sendTransparentLogo(res);
    }

    const candidates = brandingLogoCandidates(tenant, themeMode);
    if (candidates.length === 0) {
      return sendTransparentLogo(res);
    }

    for (const logo of candidates) {
      if (res.headersSent) break;
      try {
        setBrandingLogoHeaders(res, logo.mimetype);
        await streamLogoFile(res, logo);
        return;
      } catch (err) {
        console.error('getTenantBrandingLogo: failed to stream logo candidate', {
          tenantId,
          themeMode,
          path: logo.path,
          s3Key: logo.s3Key,
          error: err?.message || err,
        });
        if (res.headersSent) {
          res.destroy();
          break;
        }
      }
    }

    sendLogoNotFound(res);
  } catch (error) {
    console.error('getTenantBrandingLogo:', error);
    sendLogoNotFound(res);
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

const DEFAULT_ESTIMATE_DOCUMENT_SETTINGS = {
  logoUrl: '/scww.png',
  companyName: 'San Clemente Woodworking',
  addressLine1: '1030 Calle Sombra, Unit F',
  addressLine2: 'San Clemente, CA 92673',
  phoneLabel: 'Phone #',
  phone: '(951)491-1137',
  website: 'www.sanclementewoodworking.com',
  email: 'office@sanclementewoodworking.com',
};

function sanitizeEstimateDocumentSettings(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const trimField = (value, maxLen = 500) => {
    if (value == null) return undefined;
    return String(value).trim().slice(0, maxLen);
  };
  const out = {};
  const fields = [
    'logoUrl',
    'companyName',
    'addressLine1',
    'addressLine2',
    'phoneLabel',
    'phone',
    'website',
    'email',
  ];
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = trimField(raw[key]) ?? '';
    }
  }
  return out;
}

function mergeEstimateDocumentSettings(stored, tenantId) {
  const base = { ...DEFAULT_ESTIMATE_DOCUMENT_SETTINGS };
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return base;
  for (const key of Object.keys(DEFAULT_ESTIMATE_DOCUMENT_SETTINGS)) {
    if (stored[key] != null && String(stored[key]).trim()) {
      base[key] = String(stored[key]).trim();
    }
  }
  if (tenantId && stored.logo && hasLogoBinary(stored.logo)) {
    base.logoUrl = `/tenants/branding/${tenantId}/estimate-logo`;
  }
  return base;
}

/** Any authenticated user in the tenant can read estimate header settings. */
async function getTenantEstimateDocumentSettings(req, res) {
  try {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Your account is not linked to an organization.' });
    }
    const tenant = await Tenant.findById(tenantId).select('estimateDocumentSettings').lean();
    if (!tenant) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json({ settings: mergeEstimateDocumentSettings(tenant.estimateDocumentSettings, tenantId) });
  } catch (error) {
    console.error('getTenantEstimateDocumentSettings:', error);
    res.status(500).json({ error: error.message || 'Failed to load estimate document settings' });
  }
}

/** super_admin + admin only */
async function updateTenantEstimateDocumentSettings(req, res) {
  try {
    if (!req.user || !['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to update estimate header settings.' });
    }
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Your account is not linked to an organization.' });
    }
    const sanitized = sanitizeEstimateDocumentSettings(req.body?.settings ?? req.body);
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    const priorLogo = tenant.estimateDocumentSettings?.logo;
    tenant.estimateDocumentSettings = {
      ...mergeEstimateDocumentSettings(tenant.estimateDocumentSettings, tenantId),
      ...sanitized,
    };
    if (priorLogo && hasLogoBinary(priorLogo)) {
      tenant.estimateDocumentSettings.logo = priorLogo;
      tenant.estimateDocumentSettings.logoUrl = `/tenants/branding/${tenantId}/estimate-logo`;
    }
    await tenant.save();
    res.json({ settings: mergeEstimateDocumentSettings(tenant.estimateDocumentSettings, tenantId) });
  } catch (error) {
    console.error('updateTenantEstimateDocumentSettings:', error);
    res.status(500).json({ error: error.message || 'Failed to save estimate document settings' });
  }
}

/** admin/super_admin: upload logo image for estimate documents */
async function uploadEstimateDocumentLogo(req, res) {
  try {
    if (!req.user || !['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to update estimate header settings.' });
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
      return res.status(404).json({ error: 'Organization not found' });
    }

    const previous = tenant.estimateDocumentSettings?.logo;
    if (previous && (previous.path || previous.s3Key || previous.filename)) {
      await deleteStoredFileBinary({
        filename: previous.filename,
        path: previous.path,
        s3Key: previous.s3Key,
        mimetype: previous.mimetype,
      });
    }

    const payload = logoPayloadFromMulterFile(req.file);
    tenant.estimateDocumentSettings = {
      ...mergeEstimateDocumentSettings(tenant.estimateDocumentSettings, tenantId),
      logo: payload,
      logoUrl: `/tenants/branding/${tenant._id}/estimate-logo`,
    };
    await tenant.save();

    res.json({
      message: 'Estimate logo updated successfully',
      brandingPath: `/tenants/branding/${tenant._id}/estimate-logo`,
      settings: mergeEstimateDocumentSettings(tenant.estimateDocumentSettings, tenantId),
    });
  } catch (error) {
    console.error('uploadEstimateDocumentLogo:', error);
    res.status(500).json({ error: error.message || 'Failed to upload estimate logo' });
  }
}

/** Public: stream estimate document logo for img tags and PDF export */
async function getTenantEstimateDocumentLogo(req, res) {
  try {
    const { tenantId } = req.params;
    const tenant = await Tenant.findById(tenantId).select('estimateDocumentSettings').lean();
    if (!tenant?.estimateDocumentSettings?.logo || !hasLogoBinary(tenant.estimateDocumentSettings.logo)) {
      return sendTransparentLogo(res);
    }

    const logo = tenant.estimateDocumentSettings.logo;
    setBrandingLogoHeaders(res, logo.mimetype);
    await streamLogoFile(res, logo);
  } catch (error) {
    console.error('getTenantEstimateDocumentLogo:', error);
    sendLogoNotFound(res);
  }
}

module.exports = {
  uploadTenantLogo,
  uploadTenantLogoLight,
  uploadTenantLogoDark,
  getTenantBrandingLogo,
  getTenantPipelineSettings,
  updateTenantPipelineSettings,
  getTenantEstimateDocumentSettings,
  updateTenantEstimateDocumentSettings,
  uploadEstimateDocumentLogo,
  getTenantEstimateDocumentLogo,
};
