const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScopePlugin');

const documentFolderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentFolder',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

documentFolderSchema.plugin(tenantScopePlugin);

documentFolderSchema.index({ tenantId: 1, parentId: 1, name: 1 }, { unique: true });
documentFolderSchema.index({ parentId: 1, createdAt: -1 });

module.exports = mongoose.model('DocumentFolder', documentFolderSchema);
