const { getTenantContext } = require('../../middleware/tenantContext');

function tenantScopePlugin(schema) {
  schema.add({
    tenantId: {
      type: schema.base.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      required: false,
    },
  });

  schema.pre('save', function setTenantOnSave() {
    if (!this.tenantId) {
      const { tenantId, bypassTenant } = getTenantContext();
      if (tenantId && !bypassTenant) {
        this.tenantId = tenantId;
      }
    }
  });

  const queryHooks = [
    'countDocuments',
    'deleteMany',
    'deleteOne',
    'find',
    'findOne',
    'findOneAndDelete',
    'findOneAndUpdate',
    'updateMany',
    'updateOne',
  ];

  function applyTenantFilter() {
    const { tenantId, bypassTenant } = getTenantContext();
    if (!tenantId || bypassTenant) return;

    const query = this.getQuery() || {};
    if (Object.prototype.hasOwnProperty.call(query, 'tenantId')) return;
    this.where({ tenantId });
  }

  queryHooks.forEach((hook) => {
    schema.pre(hook, applyTenantFilter);
  });

  schema.pre('aggregate', function applyTenantAggregate() {
    const { tenantId, bypassTenant } = getTenantContext();
    if (!tenantId || bypassTenant) return;

    const pipeline = this.pipeline() || [];
    const hasTenantMatch = pipeline.some(
      (stage) =>
        stage &&
        stage.$match &&
        Object.prototype.hasOwnProperty.call(stage.$match, 'tenantId')
    );
    if (!hasTenantMatch) {
      pipeline.unshift({ $match: { tenantId } });
    }
  });
}

module.exports = tenantScopePlugin;
