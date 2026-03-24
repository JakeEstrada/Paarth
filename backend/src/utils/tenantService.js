const Tenant = require('../models/Tenant');

const DEFAULT_TENANT_SLUG = 'default';
const DEFAULT_TENANT_NAME = 'Default Company';

function normalizeTenantSlug(value) {
  if (!value || typeof value !== 'string') return DEFAULT_TENANT_SLUG;
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

async function ensureTenantBySlug(slug, fallbackName = DEFAULT_TENANT_NAME) {
  const normalizedSlug = normalizeTenantSlug(slug);
  let existing = await Tenant.findOne({ slug: normalizedSlug });
  if (existing) return existing;

  try {
    const tenant = new Tenant({
      slug: normalizedSlug,
      name: fallbackName,
    });
    await tenant.save();
    return tenant;
  } catch (err) {
    if (err && err.code === 11000) {
      existing = await Tenant.findOne({ slug: normalizedSlug });
      if (existing) return existing;
    }
    throw err;
  }
}

async function ensureDefaultTenant() {
  return ensureTenantBySlug(DEFAULT_TENANT_SLUG, DEFAULT_TENANT_NAME);
}

module.exports = {
  DEFAULT_TENANT_SLUG,
  ensureTenantBySlug,
  ensureDefaultTenant,
  normalizeTenantSlug,
};
