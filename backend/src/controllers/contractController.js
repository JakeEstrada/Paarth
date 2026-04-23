const Contract = require('../models/Contract');
const { getNextDocumentNumber } = require('../utils/documentSequence');

function normalizeLineItems(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    itemName: String(r?.itemName || '').trim(),
    description: String(r?.description || '').trim(),
    quantity: Number(r?.quantity) || 0,
    unitPrice: Number(r?.unitPrice) || 0,
    total: Number(r?.total) || 0,
  }));
}

async function listContracts(req, res) {
  try {
    const { customerId, jobId, estimateId } = req.query;
    const query = {};
    if (customerId) query.customerId = customerId;
    if (jobId) query.jobId = jobId;
    if (estimateId) query.estimateId = estimateId;
    const contracts = await Contract.find(query).sort({ createdAt: -1 });
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch contracts' });
  }
}

async function createContract(req, res) {
  try {
    if (!req.body?.customerId) return res.status(400).json({ error: 'customerId is required' });
    const numbering = await getNextDocumentNumber({ documentType: 'contract', prefix: '1102' });
    const lineItems = normalizeLineItems(req.body?.lineItems || []);
    const subtotal = lineItems.reduce((sum, li) => sum + li.total, 0);
    const total = Number(req.body?.total) || subtotal;

    const contract = await Contract.create({
      customerId: req.body.customerId,
      jobId: req.body.jobId || undefined,
      estimateId: req.body.estimateId || undefined,
      estimateRevisionId: req.body.estimateRevisionId || undefined,
      contractNumber: numbering.display,
      prefix: numbering.prefix,
      sequenceNumber: numbering.sequenceNumber,
      status: req.body.status || 'draft',
      contractDate: req.body.contractDate ? new Date(req.body.contractDate) : new Date(),
      terms: String(req.body?.terms || '').trim(),
      scopeOfWork: String(req.body?.scopeOfWork || '').trim(),
      lineItems,
      total,
      depositRequired: Number(req.body?.depositRequired) || 0,
      depositReceived: Number(req.body?.depositReceived) || 0,
      signedAt: req.body?.signedAt ? new Date(req.body.signedAt) : null,
      sourceType: req.body?.sourceType || 'manual',
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    res.status(201).json(contract);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create contract' });
  }
}

async function getContract(req, res) {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    res.json(contract);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch contract' });
  }
}

async function patchContract(req, res) {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    const mutable = [
      'status',
      'contractDate',
      'terms',
      'scopeOfWork',
      'total',
      'depositRequired',
      'depositReceived',
      'signedAt',
    ];
    mutable.forEach((k) => {
      if (req.body[k] !== undefined) contract[k] = req.body[k];
    });
    if (req.body.lineItems !== undefined) contract.lineItems = normalizeLineItems(req.body.lineItems);
    contract.updatedBy = req.user?._id || contract.updatedBy;
    await contract.save();
    res.json(contract);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update contract' });
  }
}

module.exports = {
  listContracts,
  createContract,
  getContract,
  patchContract,
};
