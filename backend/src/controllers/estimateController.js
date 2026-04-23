const Estimate = require('../models/Estimate');
const Invoice = require('../models/Invoice');
const Contract = require('../models/Contract');
const Job = require('../models/Job');
const { getNextDocumentNumber, initializeSequence, formatDocumentNumber } = require('../utils/documentSequence');

function parseLineItems(lineItems = []) {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((row) => ({
    itemName: String(row?.itemName || '').trim(),
    description: String(row?.description || '').trim(),
    quantity: Number(row?.quantity) || 0,
    unitPrice: Number(row?.unitPrice) || 0,
    total: Number(row?.total) || 0,
  }));
}

function computeTotals({ lineItems = [], taxRate = 0, discountAmount = 0 }) {
  const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.total) || 0), 0);
  const normalizedTaxRate = Number(taxRate) || 0;
  const taxAmount = subtotal * (normalizedTaxRate / 100);
  const normalizedDiscount = Number(discountAmount) || 0;
  const grandTotal = subtotal + taxAmount - normalizedDiscount;
  return {
    subtotal,
    taxRate: normalizedTaxRate,
    taxAmount,
    discountAmount: normalizedDiscount,
    grandTotal,
  };
}

function estimateSummaryFromRevision(revision) {
  return {
    latestAmount: Number(revision?.grandTotal || 0),
    latestEstimateDate: revision?.estimateDate || null,
    projectName: revision?.projectName || '',
    footerNote: revision?.footerNote || '',
  };
}

async function listEstimates(req, res) {
  try {
    const { customerId, jobId, status, search } = req.query;
    const query = {};
    if (customerId) query.customerId = customerId;
    if (jobId) query.jobId = jobId;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { estimateNumber: { $regex: String(search).trim(), $options: 'i' } },
        { projectName: { $regex: String(search).trim(), $options: 'i' } },
      ];
    }

    const estimates = await Estimate.find(query)
      .populate('customerId', 'name primaryEmail')
      .populate('jobId', 'title stage')
      .sort({ createdAt: -1 });
    res.json(estimates);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch estimates' });
  }
}

async function createEstimate(req, res) {
  try {
    const { customerId, jobId = null } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId is required' });

    const numbering = await getNextDocumentNumber({ documentType: 'estimate', prefix: '1102' });
    const lineItems = parseLineItems(req.body?.lineItems || []);
    const totals = computeTotals({
      lineItems,
      taxRate: req.body?.taxRate,
      discountAmount: req.body?.discountAmount,
    });
    const revision = {
      revisionNumber: 1,
      revisionLabel: 'Rev 1',
      estimateDate: req.body?.estimateDate ? new Date(req.body.estimateDate) : new Date(),
      sentAt: req.body?.sentAt ? new Date(req.body.sentAt) : null,
      projectName: String(req.body?.projectName || '').trim(),
      footerNote: String(req.body?.footerNote || '').trim(),
      lineItems,
      notes: String(req.body?.notes || '').trim(),
      changeSummary: 'Initial estimate',
      createdBy: req.user?._id || null,
      isCurrent: true,
      ...totals,
    };

    const estimate = await Estimate.create({
      customerId,
      jobId: jobId || undefined,
      status: String(req.body?.status || 'draft'),
      estimateNumber: numbering.display,
      prefix: numbering.prefix,
      sequenceNumber: numbering.sequenceNumber,
      revisions: [revision],
      currentRevisionId: revision._id,
      revisionCount: 1,
      sourceType: 'manual',
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
      ...estimateSummaryFromRevision(revision),
    });

    if (jobId) {
      await Job.findByIdAndUpdate(jobId, {
        $set: {
          valueEstimated: Number(revision.grandTotal || 0),
        },
      });
    }

    res.status(201).json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create estimate' });
  }
}

async function getEstimate(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id)
      .populate('customerId', 'name primaryPhone primaryEmail')
      .populate('jobId', 'title stage');
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch estimate' });
  }
}

async function patchEstimate(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const updatable = ['status', 'projectName', 'footerNote', 'jobId', 'customerId'];
    updatable.forEach((key) => {
      if (req.body[key] !== undefined) estimate[key] = req.body[key];
    });
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();
    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update estimate' });
  }
}

async function createEstimateRevision(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    estimate.revisions.forEach((r) => {
      r.isCurrent = false;
    });

    const nextRevisionNumber = (estimate.revisionCount || estimate.revisions.length || 0) + 1;
    const lineItems = parseLineItems(req.body?.lineItems || []);
    const totals = computeTotals({
      lineItems,
      taxRate: req.body?.taxRate,
      discountAmount: req.body?.discountAmount,
    });
    const revision = {
      revisionNumber: nextRevisionNumber,
      revisionLabel: `Rev ${nextRevisionNumber}`,
      estimateDate: req.body?.estimateDate ? new Date(req.body.estimateDate) : new Date(),
      sentAt: req.body?.sentAt ? new Date(req.body.sentAt) : null,
      projectName: String(req.body?.projectName || estimate.projectName || '').trim(),
      footerNote: String(req.body?.footerNote || estimate.footerNote || '').trim(),
      lineItems,
      notes: String(req.body?.notes || '').trim(),
      changeSummary: String(req.body?.changeSummary || '').trim(),
      createdBy: req.user?._id || null,
      isCurrent: true,
      ...totals,
    };

    estimate.revisions.push(revision);
    estimate.currentRevisionId = revision._id;
    estimate.revisionCount = nextRevisionNumber;
    Object.assign(estimate, estimateSummaryFromRevision(revision));
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();

    if (estimate.jobId) {
      await Job.findByIdAndUpdate(estimate.jobId, { $set: { valueEstimated: Number(revision.grandTotal || 0) } });
    }
    res.status(201).json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create estimate revision' });
  }
}

async function getEstimateRevision(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const revision = estimate.revisions.id(req.params.revisionId);
    if (!revision) return res.status(404).json({ error: 'Revision not found' });
    res.json(revision);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch revision' });
  }
}

async function patchEstimateRevision(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const revision = estimate.revisions.id(req.params.revisionId);
    if (!revision) return res.status(404).json({ error: 'Revision not found' });

    if (req.body.lineItems !== undefined) revision.lineItems = parseLineItems(req.body.lineItems);
    const updatable = ['estimateDate', 'sentAt', 'projectName', 'footerNote', 'notes', 'changeSummary', 'taxRate', 'discountAmount'];
    updatable.forEach((key) => {
      if (req.body[key] !== undefined) revision[key] = req.body[key];
    });
    const totals = computeTotals({
      lineItems: revision.lineItems || [],
      taxRate: revision.taxRate,
      discountAmount: revision.discountAmount,
    });
    Object.assign(revision, totals);

    if (String(estimate.currentRevisionId || '') === String(revision._id)) {
      Object.assign(estimate, estimateSummaryFromRevision(revision));
      if (estimate.jobId) {
        await Job.findByIdAndUpdate(estimate.jobId, { $set: { valueEstimated: Number(revision.grandTotal || 0) } });
      }
    }

    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();
    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to patch revision' });
  }
}

async function deleteEstimateRevision(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const revision = estimate.revisions.id(req.params.revisionId);
    if (!revision) return res.status(404).json({ error: 'Revision not found' });

    if (estimate.revisions.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only revision' });
    }

    const removingCurrent = String(estimate.currentRevisionId || '') === String(revision._id);
    revision.deleteOne();
    estimate.revisionCount = Math.max(0, estimate.revisions.length);

    if (removingCurrent) {
      const sorted = [...estimate.revisions].sort(
        (a, b) => Number(a?.revisionNumber || 0) - Number(b?.revisionNumber || 0)
      );
      const nextCurrent = sorted[sorted.length - 1] || null;
      estimate.revisions.forEach((r) => {
        r.isCurrent = nextCurrent ? String(r._id) === String(nextCurrent._id) : false;
      });
      estimate.currentRevisionId = nextCurrent?._id || null;
      if (nextCurrent) {
        Object.assign(estimate, estimateSummaryFromRevision(nextCurrent));
      }
      if (estimate.jobId) {
        await Job.findByIdAndUpdate(estimate.jobId, {
          $set: { valueEstimated: Number(nextCurrent?.grandTotal || 0) },
        });
      }
    }

    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();
    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete revision' });
  }
}

async function updateEstimateStatus(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const nextStatus = String(req.body?.status || '').trim();
    if (!nextStatus) return res.status(400).json({ error: 'status is required' });
    estimate.status = nextStatus;
    if (nextStatus === 'sent') estimate.sentAt = new Date();
    if (nextStatus === 'approved') estimate.approvedAt = new Date();
    if (nextStatus === 'rejected') estimate.rejectedAt = new Date();
    if (nextStatus === 'archived') estimate.archivedAt = new Date();
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();
    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update status' });
  }
}

async function generateInvoiceFromEstimate(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const revisionId = req.body?.revisionId || estimate.currentRevisionId;
    const revision = estimate.revisions.id(revisionId);
    if (!revision) return res.status(404).json({ error: 'Revision not found' });

    const numbering = await getNextDocumentNumber({ documentType: 'invoice', prefix: estimate.prefix || '1102' });
    const invoice = await Invoice.create({
      customerId: estimate.customerId,
      jobId: estimate.jobId,
      estimateId: estimate._id,
      estimateRevisionId: revision._id,
      invoiceNumber: numbering.display,
      prefix: numbering.prefix,
      sequenceNumber: numbering.sequenceNumber,
      status: 'draft',
      issuedAt: new Date(),
      lineItems: revision.lineItems || [],
      subtotal: revision.subtotal || 0,
      taxRate: revision.taxRate || 0,
      taxAmount: revision.taxAmount || 0,
      discountAmount: revision.discountAmount || 0,
      total: revision.grandTotal || 0,
      balanceDue: revision.grandTotal || 0,
      notes: `Generated from estimate ${estimate.estimateNumber}`,
      sourceType: 'derived_from_estimate',
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    revision.derivedDocuments = revision.derivedDocuments || {};
    revision.derivedDocuments.invoiceIds = revision.derivedDocuments.invoiceIds || [];
    revision.derivedDocuments.invoiceIds.push(invoice._id);
    estimate.status = 'converted_to_invoice';
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();
    res.status(201).json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to generate invoice' });
  }
}

async function generateContractFromEstimate(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const revisionId = req.body?.revisionId || estimate.currentRevisionId;
    const revision = estimate.revisions.id(revisionId);
    if (!revision) return res.status(404).json({ error: 'Revision not found' });

    const numbering = await getNextDocumentNumber({ documentType: 'contract', prefix: estimate.prefix || '1102' });
    const contract = await Contract.create({
      customerId: estimate.customerId,
      jobId: estimate.jobId,
      estimateId: estimate._id,
      estimateRevisionId: revision._id,
      contractNumber: numbering.display,
      prefix: numbering.prefix,
      sequenceNumber: numbering.sequenceNumber,
      status: 'draft',
      contractDate: new Date(),
      terms: String(req.body?.terms || '').trim(),
      scopeOfWork: String(req.body?.scopeOfWork || revision.projectName || '').trim(),
      lineItems: revision.lineItems || [],
      total: revision.grandTotal || 0,
      depositRequired: Number(req.body?.depositRequired || 0),
      depositReceived: Number(req.body?.depositReceived || 0),
      sourceType: 'derived_from_estimate',
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    revision.derivedDocuments = revision.derivedDocuments || {};
    revision.derivedDocuments.contractIds = revision.derivedDocuments.contractIds || [];
    revision.derivedDocuments.contractIds.push(contract._id);
    estimate.status = 'converted_to_contract';
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();
    res.status(201).json(contract);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to generate contract' });
  }
}

async function resetEstimateSequence(req, res) {
  try {
    if (!req.user || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can reset estimate sequence' });
    }
    const prefix = String(req.body?.prefix || '1102').trim() || '1102';
    const nextSequence = Number(req.body?.nextSequence) || 1;
    const targetNumber = formatDocumentNumber({
      prefix,
      sequence: nextSequence,
      documentType: 'estimate',
    });
    const collisions = await Estimate.find({ estimateNumber: targetNumber })
      .select('_id estimateNumber sourceType createdAt')
      .lean();

    if (collisions.length > 0) {
      const allowLegacyOnly = req.body?.allowLegacyOnly === true;
      const allLegacy = collisions.every((c) => c.sourceType === 'migrated');
      if (!(allowLegacyOnly && allLegacy)) {
        return res.status(409).json({
          error: 'Sequence reset would collide with existing estimate numbers',
          targetNumber,
          collisions,
          hint: 'Use allowLegacyOnly=true only if all collisions are migrated legacy estimates.',
        });
      }
    }

    const sequence = await initializeSequence({
      documentType: 'estimate',
      prefix,
      nextSequence,
    });
    return res.json({
      message: 'Estimate sequence reset',
      documentType: 'estimate',
      prefix: sequence.prefix,
      nextSequence: sequence.nextSequence,
      targetNumber,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to reset estimate sequence' });
  }
}

async function getEstimateSequenceSafety(req, res) {
  try {
    const prefix = String(req.query?.prefix || '1102').trim() || '1102';
    const nextSequence = Math.max(1, Number(req.query?.nextSequence) || 1);
    const targetNumber = formatDocumentNumber({
      prefix,
      sequence: nextSequence,
      documentType: 'estimate',
    });
    const collisions = await Estimate.find({ estimateNumber: targetNumber })
      .select('_id estimateNumber sourceType createdAt jobId customerId')
      .lean();

    return res.json({
      prefix,
      nextSequence,
      targetNumber,
      collisionCount: collisions.length,
      collisions,
      safeToReset: collisions.length === 0,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to evaluate sequence safety' });
  }
}

async function renumberEstimate(req, res) {
  try {
    if (!req.user || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can renumber estimates' });
    }
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const numbering = await getNextDocumentNumber({
      documentType: 'estimate',
      prefix: String(req.body?.prefix || estimate.prefix || '1102').trim() || '1102',
    });
    const previousNumber = estimate.estimateNumber;
    estimate.estimateNumber = numbering.display;
    estimate.prefix = numbering.prefix;
    estimate.sequenceNumber = numbering.sequenceNumber;
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();

    return res.json({
      message: 'Estimate renumbered',
      estimateId: estimate._id,
      previousNumber,
      estimateNumber: estimate.estimateNumber,
      prefix: estimate.prefix,
      sequenceNumber: estimate.sequenceNumber,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to renumber estimate' });
  }
}

async function markEstimateAsLegacy(req, res) {
  try {
    if (!req.user || req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can mark legacy estimates' });
    }
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const legacyTag = String(req.body?.legacyTag || 'LEG').trim() || 'LEG';
    const previousNumber = estimate.estimateNumber;
    const candidate = `${legacyTag}-${previousNumber}`;
    const existing = await Estimate.findOne({
      _id: { $ne: estimate._id },
      estimateNumber: candidate,
    })
      .select('_id')
      .lean();
    if (existing) {
      return res.status(409).json({
        error: 'Legacy number already exists for another estimate',
        candidate,
      });
    }

    estimate.estimateNumber = candidate;
    estimate.sourceType = 'migrated';
    estimate.status = estimate.status === 'archived' ? estimate.status : 'archived';
    estimate.archivedAt = estimate.archivedAt || new Date();
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();

    return res.json({
      message: 'Estimate marked as legacy',
      estimateId: estimate._id,
      previousNumber,
      estimateNumber: estimate.estimateNumber,
      sourceType: estimate.sourceType,
      status: estimate.status,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to mark estimate as legacy' });
  }
}

module.exports = {
  listEstimates,
  createEstimate,
  getEstimate,
  patchEstimate,
  createEstimateRevision,
  getEstimateRevision,
  patchEstimateRevision,
  deleteEstimateRevision,
  updateEstimateStatus,
  generateInvoiceFromEstimate,
  generateContractFromEstimate,
  getEstimateSequenceSafety,
  renumberEstimate,
  markEstimateAsLegacy,
  resetEstimateSequence,
};
