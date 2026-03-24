const { AsyncLocalStorage } = require('node:async_hooks');

const tenantStorage = new AsyncLocalStorage();

function runWithTenantContext(context, callback) {
  return tenantStorage.run(
    {
      tenantId: context?.tenantId || null,
      bypassTenant: Boolean(context?.bypassTenant),
    },
    callback
  );
}

function getTenantContext() {
  return tenantStorage.getStore() || { tenantId: null, bypassTenant: false };
}

module.exports = {
  runWithTenantContext,
  getTenantContext,
};
