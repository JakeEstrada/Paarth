const Estimate = require('../models/Estimate');
const Invoice = require('../models/Invoice');
const Contract = require('../models/Contract');
const Job = require('../models/Job');
const File = require('../models/File');
const fs = require('fs');
const path = require('path');
const { getNextDocumentNumber, initializeSequence, formatDocumentNumber } = require('../utils/documentSequence');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
const DOCUMENT_TEXT_DIR = path.join(UPLOADS_DIR, 'documents-text');

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

function formatIsoDate(value) {
  try {
    if (!value) return '-';
    return new Date(value).toISOString();
  } catch {
    return '-';
  }
}

function buildSentEstimateArtifactContent(estimate) {
  const lineItems = Array.isArray(estimate?.lineItems) ? estimate.lineItems : [];
  const lines = [
    'IMMUTABLE ESTIMATE ARTIFACT',
    `Estimate ID: ${String(estimate?._id || '')}`,
    `Estimate Number: ${String(estimate?.estimateNumber || '')}`,
    `Status: ${String(estimate?.status || '')}`,
    `Customer ID: ${String(estimate?.customerId || '')}`,
    `Job ID: ${String(estimate?.jobId || '')}`,
    `Sent At: ${formatIsoDate(estimate?.sentAt)}`,
    `Estimate Date: ${formatIsoDate(estimate?.estimateDate)}`,
    `Project Name: ${String(estimate?.projectName || '')}`,
    `Footer Note: ${String(estimate?.footerNote || '')}`,
    `Notes: ${String(estimate?.notes || '')}`,
    `Subtotal: ${Number(estimate?.subtotal || 0)}`,
    `Tax Rate: ${Number(estimate?.taxRate || 0)}`,
    `Tax Amount: ${Number(estimate?.taxAmount || 0)}`,
    `Discount Amount: ${Number(estimate?.discountAmount || 0)}`,
    `Grand Total: ${Number(estimate?.grandTotal || 0)}`,
    '',
    'Line Items:',
  ];
  lineItems.forEach((li, idx) => {
    lines.push(
      `${idx + 1}. itemName=${String(li?.itemName || '')} | description=${String(li?.description || '')} | quantity=${Number(li?.quantity || 0)} | unitPrice=${Number(li?.unitPrice || 0)} | total=${Number(li?.total || 0)}`
    );
  });
  return lines.join('\n');
}

async function ensureSentEstimateArtifact(estimate, userId) {
  if (!estimate?._id || String(estimate?.status || '') !== 'sent' || !estimate?.sentAt) return null;
  const marker = `[IMMUTABLE_ESTIMATE_SENT] estimateId:${String(estimate._id)} sentAt:${new Date(estimate.sentAt).toISOString()}`;
  const existing = await File.findOne({ description: marker }).select('_id').lean();
  if (existing) return existing;

  fs.mkdirSync(DOCUMENT_TEXT_DIR, { recursive: true });
  const safeEstimateNumber = String(estimate.estimateNumber || 'estimate').replace(/[^a-zA-Z0-9_-]/g, '_');
  const diskName = `estimate-sent-${safeEstimateNumber}-${Date.now()}.txt`;
  const diskPath = path.join(DOCUMENT_TEXT_DIR, diskName);
  const content = buildSentEstimateArtifactContent(estimate);
  fs.writeFileSync(diskPath, content, 'utf8');

  return File.create({
    jobId: estimate.jobId || undefined,
    customerId: estimate.customerId || undefined,
    filename: diskName,
    originalName: `Estimate-${estimate.estimateNumber || 'unknown'}-sent-artifact.txt`,
    mimetype: 'text/plain',
    size: Buffer.byteLength(content, 'utf8'),
    path: diskPath,
    fileType: 'estimate',
    uploadedBy: userId || estimate.updatedBy || estimate.createdBy,
    description: `${marker} estimateNumber:${String(estimate.estimateNumber || '')} jobId:${String(
      estimate.jobId || ''
    )} customerId:${String(estimate.customerId || '')}`,
  });
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
    const estimate = await Estimate.create({
      customerId,
      jobId: jobId || undefined,
      status: String(req.body?.status || 'draft'),
      estimateNumber: numbering.display,
      prefix: numbering.prefix,
      sequenceNumber: numbering.sequenceNumber,
      estimateDate: req.body?.estimateDate ? new Date(req.body.estimateDate) : new Date(),
      lineItems,
      notes: String(req.body?.notes || '').trim(),
      ...totals,
      projectName: String(req.body?.projectName || '').trim(),
      footerNote: String(req.body?.footerNote || '').trim(),
      sourceType: 'manual',
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
      sentAt: req.body?.sentAt ? new Date(req.body.sentAt) : null,
    });

    if (jobId) {
      await Job.findByIdAndUpdate(jobId, {
        $set: {
          valueEstimated: Number(estimate.grandTotal || 0),
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

    if (req.body.lineItems !== undefined) estimate.lineItems = parseLineItems(req.body.lineItems);
    const updatable = [
      'status',
      'projectName',
      'footerNote',
      'jobId',
      'customerId',
      'notes',
      'estimateDate',
      'sentAt',
      'taxRate',
      'discountAmount',
    ];
    updatable.forEach((key) => {
      if (req.body[key] !== undefined) {
        if (key === 'estimateDate' || key === 'sentAt') {
          estimate[key] = req.body[key] ? new Date(req.body[key]) : null;
        } else {
          estimate[key] = req.body[key];
        }
      }
    });
    const totals = computeTotals({
      lineItems: estimate.lineItems || [],
      taxRate: estimate.taxRate,
      discountAmount: estimate.discountAmount,
    });
    Object.assign(estimate, totals);
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();
    if (estimate.jobId) {
      await Job.findByIdAndUpdate(estimate.jobId, { $set: { valueEstimated: Number(estimate.grandTotal || 0) } });
    }
    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update estimate' });
  }
}

async function deleteEstimate(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const jobId = estimate.jobId ? String(estimate.jobId) : null;
    await Estimate.deleteOne({ _id: estimate._id });
    if (jobId) {
      const replacement = await Estimate.findOne({ jobId }).sort({ createdAt: -1 }).lean();
      await Job.findByIdAndUpdate(jobId, { $set: { valueEstimated: Number(replacement?.grandTotal || 0) } });
    }
    res.json({ deleted: true, estimateId: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to delete estimate' });
  }
}

async function updateEstimateStatus(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
    const nextStatus = String(req.body?.status || '').trim();
    if (!nextStatus) return res.status(400).json({ error: 'status is required' });
    const previousStatus = estimate.status;
    estimate.status = nextStatus;
    if (nextStatus === 'sent') estimate.sentAt = new Date();
    if (nextStatus === 'approved') estimate.approvedAt = new Date();
    if (nextStatus === 'rejected') estimate.rejectedAt = new Date();
    if (nextStatus === 'archived') estimate.archivedAt = new Date();
    estimate.updatedBy = req.user?._id || estimate.updatedBy;
    await estimate.save();
    if (nextStatus === 'sent' && previousStatus !== 'sent') {
      await ensureSentEstimateArtifact(estimate, req.user?._id || null);
    }
    res.json(estimate);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update status' });
  }
}

async function generateInvoiceFromEstimate(req, res) {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const numbering = await getNextDocumentNumber({ documentType: 'invoice', prefix: estimate.prefix || '1102' });
    const invoice = await Invoice.create({
      customerId: estimate.customerId,
      jobId: estimate.jobId,
      estimateId: estimate._id,
      estimateRevisionId: undefined,
      invoiceNumber: numbering.display,
      prefix: numbering.prefix,
      sequenceNumber: numbering.sequenceNumber,
      status: 'draft',
      issuedAt: new Date(),
      lineItems: estimate.lineItems || [],
      subtotal: estimate.subtotal || 0,
      taxRate: estimate.taxRate || 0,
      taxAmount: estimate.taxAmount || 0,
      discountAmount: estimate.discountAmount || 0,
      total: estimate.grandTotal || 0,
      balanceDue: estimate.grandTotal || 0,
      notes: `Generated from estimate ${estimate.estimateNumber}`,
      sourceType: 'derived_from_estimate',
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    estimate.derivedDocuments = estimate.derivedDocuments || {};
    estimate.derivedDocuments.invoiceIds = estimate.derivedDocuments.invoiceIds || [];
    estimate.derivedDocuments.invoiceIds.push(invoice._id);
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

    const numbering = await getNextDocumentNumber({ documentType: 'contract', prefix: estimate.prefix || '1102' });
    const contract = await Contract.create({
      customerId: estimate.customerId,
      jobId: estimate.jobId,
      estimateId: estimate._id,
      estimateRevisionId: undefined,
      contractNumber: numbering.display,
      prefix: numbering.prefix,
      sequenceNumber: numbering.sequenceNumber,
      status: 'draft',
      contractDate: new Date(),
      terms: String(req.body?.terms || '').trim(),
      scopeOfWork: String(req.body?.scopeOfWork || estimate.projectName || '').trim(),
      lineItems: estimate.lineItems || [],
      total: estimate.grandTotal || 0,
      depositRequired: Number(req.body?.depositRequired || 0),
      depositReceived: Number(req.body?.depositReceived || 0),
      sourceType: 'derived_from_estimate',
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    estimate.derivedDocuments = estimate.derivedDocuments || {};
    estimate.derivedDocuments.contractIds = estimate.derivedDocuments.contractIds || [];
    estimate.derivedDocuments.contractIds.push(contract._id);
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
  deleteEstimate,
  updateEstimateStatus,
  generateInvoiceFromEstimate,
  generateContractFromEstimate,
  getEstimateSequenceSafety,
  renumberEstimate,
  markEstimateAsLegacy,
  resetEstimateSequence,
};
