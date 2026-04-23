const Invoice = require('../models/Invoice');
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

async function listInvoices(req, res) {
  try {
    const { customerId, jobId, estimateId } = req.query;
    const query = {};
    if (customerId) query.customerId = customerId;
    if (jobId) query.jobId = jobId;
    if (estimateId) query.estimateId = estimateId;
    const invoices = await Invoice.find(query).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch invoices' });
  }
}

async function createInvoice(req, res) {
  try {
    if (!req.body?.customerId) return res.status(400).json({ error: 'customerId is required' });
    const numbering = await getNextDocumentNumber({ documentType: 'invoice', prefix: '1102' });
    const lineItems = normalizeLineItems(req.body?.lineItems || []);
    const subtotal = Number(req.body?.subtotal) || lineItems.reduce((sum, li) => sum + li.total, 0);
    const taxRate = Number(req.body?.taxRate) || 0;
    const taxAmount = Number(req.body?.taxAmount) || subtotal * (taxRate / 100);
    const discountAmount = Number(req.body?.discountAmount) || 0;
    const total = Number(req.body?.total) || subtotal + taxAmount - discountAmount;
    const invoice = await Invoice.create({
      customerId: req.body.customerId,
      jobId: req.body.jobId || undefined,
      estimateId: req.body.estimateId || undefined,
      estimateRevisionId: req.body.estimateRevisionId || undefined,
      invoiceNumber: numbering.display,
      prefix: numbering.prefix,
      sequenceNumber: numbering.sequenceNumber,
      status: req.body.status || 'draft',
      issuedAt: req.body.issuedAt ? new Date(req.body.issuedAt) : null,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      lineItems,
      subtotal,
      taxRate,
      taxAmount,
      discountAmount,
      total,
      balanceDue: Number(req.body?.balanceDue) || total,
      notes: String(req.body?.notes || '').trim(),
      sourceType: req.body?.sourceType || 'manual',
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    res.status(201).json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to create invoice' });
  }
}

async function getInvoice(req, res) {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch invoice' });
  }
}

async function patchInvoice(req, res) {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const mutable = [
      'status',
      'issuedAt',
      'dueDate',
      'subtotal',
      'taxRate',
      'taxAmount',
      'discountAmount',
      'total',
      'balanceDue',
      'notes',
    ];
    mutable.forEach((k) => {
      if (req.body[k] !== undefined) invoice[k] = req.body[k];
    });
    if (req.body.lineItems !== undefined) invoice.lineItems = normalizeLineItems(req.body.lineItems);
    invoice.updatedBy = req.user?._id || invoice.updatedBy;
    await invoice.save();
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to update invoice' });
  }
}

module.exports = {
  listInvoices,
  createInvoice,
  getInvoice,
  patchInvoice,
};
