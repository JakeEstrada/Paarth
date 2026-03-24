const Tenant = require('../models/Tenant');

const DEFAULT_TENANT_SLUG = 'default';
const DEFAULT_TENANT_NAME = 'Default Company';

function normalizeTenantSlug(value) {
  if (!value || typeof value !== 'string') return DEFAULT_TENANT_SLUG;
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

async function ensureTenantBySlug(slug, fallbackName = DEFAULT_TENANT_NAME) {
  const normalizedSlug = normalizeTenantSlug(slug);
  const existing = await Tenant.findOne({ slug: normalizedSlug });
  if (existing) return existing;

  const tenant = new Tenant({
    slug: normalizedSlug,
    name: fallbackName,
  });
  await tenant.save();
  return tenant;
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
