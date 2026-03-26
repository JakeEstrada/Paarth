const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const levelSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'Level 1', trim: true },
    order: { type: Number, default: 0 },
    /** Stage keys are tenant-defined stage names used as `Job.stage` values. */
    stageKeys: [{ type: String, trim: true }],
  },
  { _id: false }
);

const pipelineLayoutSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    levels: { type: [levelSchema], default: [] },
  },
  { timestamps: true }
);

pipelineLayoutSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('PipelineLayout', pipelineLayoutSchema);
