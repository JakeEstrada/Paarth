const DepositAllocation = require('../models/DepositAllocation');
const Job = require('../models/Job');
const { buildDepositMatchSuggestions } = require('../services/depositMatching');
const {
  linkDepositToPayment,
  runDepositAutoConnect,
} = require('../services/depositLinkService');

function allocationResponse(doc, job) {
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    ...row,
    jobTitle: job?.title || '',
    customerName:
      job?.customerId && typeof job.customerId === 'object'
        ? job.customerId.name || ''
        : '',
  };
}

async function listDepositAllocations(req, res) {
  try {
    const allocations = await DepositAllocation.find({}).sort({ linkedAt: -1 }).lean();
    const jobIds = [...new Set(allocations.map((row) => String(row.jobId)))];
    const jobs = await Job.find({ _id: { $in: jobIds } })
      .populate({ path: 'customerId', select: 'name', strictPopulate: false })
      .select('title customerId')
      .lean();
    const jobById = new Map(jobs.map((job) => [String(job._id), job]));

    return res.json({
      allocations: allocations.map((row) =>
        allocationResponse(row, jobById.get(String(row.jobId))),
      ),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getDepositMatchSuggestions(req, res) {
  try {
    const depositAmount = Math.abs(Number(req.query.amount) || 0);
    const transactionName = String(req.query.description || req.query.name || '').trim();
    const limit = Number(req.query.limit) || 8;

    if (depositAmount <= 0) {
      return res.status(400).json({ error: 'amount is required' });
    }

    const suggestions = await buildDepositMatchSuggestions({
      depositAmount,
      transactionName,
      limit,
    });

    return res.json({ suggestions });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function createDepositAllocation(req, res) {
  try {
    const result = await linkDepositToPayment({
      plaidTransactionId: String(req.body?.plaidTransactionId || '').trim(),
      accountId: String(req.body?.accountId || '').trim(),
      transactionDate: String(req.body?.transactionDate || '').trim(),
      transactionName: String(req.body?.transactionName || '').trim(),
      depositAmount: Math.abs(Number(req.body?.depositAmount) || 0),
      jobId: String(req.body?.jobId || '').trim(),
      paymentSortOrder: Number(req.body?.paymentSortOrder),
      linkedBy: req.user?._id,
      applyMarkPaid: req.body?.applyMarkPaid !== false,
    });

    return res.status(201).json({
      allocation: allocationResponse(result.allocation, result.job),
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'This deposit or payment slot is already linked' });
    }
    return res.status(status).json({ error: error.message });
  }
}

async function autoConnectDepositAllocations(req, res) {
  try {
    if (!req.user?.tenantId) {
      return res.status(400).json({ error: 'User is not associated with an organization.' });
    }

    const dryRun = req.body?.dryRun === true || req.query?.dryRun === '1';
    const days = Number(req.body?.days || req.query?.days) || 730;

    const result = await runDepositAutoConnect({
      tenantId: req.user.tenantId,
      linkedBy: req.user?._id,
      days,
      dryRun,
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function deleteDepositAllocation(req, res) {
  try {
    const allocation = await DepositAllocation.findByIdAndDelete(req.params.id);
    if (!allocation) return res.status(404).json({ error: 'Link not found' });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listDepositAllocations,
  getDepositMatchSuggestions,
  createDepositAllocation,
  autoConnectDepositAllocations,
  deleteDepositAllocation,
};
