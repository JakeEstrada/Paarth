const DepositAllocation = require('../models/DepositAllocation');
const Job = require('../models/Job');
const Activity = require('../models/Activity');
const { buildDepositMatchSuggestions } = require('../services/depositMatching');
const {
  roundMoney,
  getContractBase,
  sumChangeOrdersForFinal,
  resolvePaymentSchedule,
  getScheduleItemTotal,
  normalizePaymentScheduleInput,
  diffPaymentScheduleActivities,
} = require('../utils/paymentSchedule');

function parseDepositAmount(raw) {
  return roundMoney(Math.abs(Number(raw) || 0));
}

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
    const depositAmount = parseDepositAmount(req.query.amount);
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
    const plaidTransactionId = String(req.body?.plaidTransactionId || '').trim();
    const jobId = String(req.body?.jobId || '').trim();
    const paymentSortOrder = Number(req.body?.paymentSortOrder);
    const applyMarkPaid = req.body?.applyMarkPaid !== false;

    if (!plaidTransactionId || !jobId || !Number.isFinite(paymentSortOrder)) {
      return res.status(400).json({
        error: 'plaidTransactionId, jobId, and paymentSortOrder are required',
      });
    }

    const existing = await DepositAllocation.findOne({ plaidTransactionId }).lean();
    if (existing) {
      return res.status(409).json({ error: 'This deposit is already linked to a payment' });
    }

    const slotTaken = await DepositAllocation.findOne({ jobId, paymentSortOrder }).lean();
    if (slotTaken) {
      return res.status(409).json({ error: 'That payment slot is already linked to another deposit' });
    }

    const job = await Job.findById(jobId).populate({
      path: 'customerId',
      select: 'name',
      strictPopulate: false,
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const depositAmount = parseDepositAmount(req.body?.depositAmount);
    const transactionDate = String(req.body?.transactionDate || '').trim();
    const transactionName = String(req.body?.transactionName || '').trim();
    const accountId = String(req.body?.accountId || '').trim();

    const oldSchedule = job.paymentSchedule ? JSON.parse(JSON.stringify(job.paymentSchedule)) : null;
    const contractBase = getContractBase(job);
    const coAddedToFinal = sumChangeOrdersForFinal(job);
    const resolved = resolvePaymentSchedule(job.toObject());
    const targetItem = (resolved.items || []).find(
      (item) => Number(item.sortOrder) === paymentSortOrder,
    );
    if (!targetItem) {
      return res.status(400).json({ error: 'Payment schedule item not found on this job' });
    }

    const paymentLabel = String(targetItem.label || '').trim() || `Payment ${paymentSortOrder + 1}`;
    const scheduledTotal = getScheduleItemTotal(targetItem, contractBase, coAddedToFinal);
    let markPaidApplied = false;

    if (applyMarkPaid && targetItem.status !== 'paid') {
      const paidAt = transactionDate ? new Date(`${transactionDate}T12:00:00`) : new Date();
      const items = Array.isArray(job.paymentSchedule?.items) ? [...job.paymentSchedule.items] : [];
      const storedItems =
        items.length > 0
          ? items
          : (resolved.items || []).map((item) => ({
              ...item,
              paidAmount: 0,
              paidAt: null,
              status: item.status || 'pending',
            }));

      const nextItems = storedItems.map((item) => {
        if (Number(item.sortOrder) !== paymentSortOrder) return item;
        return {
          ...item,
          status: 'paid',
          paidAmount: roundMoney(depositAmount || scheduledTotal),
          paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
        };
      });

      const { schedule } = normalizePaymentScheduleInput(
        {
          type: job.paymentSchedule?.type || resolved.type || 'custom',
          items: nextItems,
        },
        contractBase,
      );

      job.paymentSchedule = schedule;
      job.markModified('paymentSchedule');
      await job.save();

      const activities = diffPaymentScheduleActivities(oldSchedule, schedule);
      for (const activity of activities) {
        try {
          await Activity.create({
            type: activity.type,
            jobId: job._id,
            customerId: job.customerId?._id || job.customerId,
            note: activity.note,
            amount: activity.amount,
            paymentType: activity.paymentType,
            createdBy: req.user?._id,
          });
        } catch (activityError) {
          console.error('deposit allocation activity error:', activityError);
        }
      }
      markPaidApplied = true;
    }

    const allocation = await DepositAllocation.create({
      plaidTransactionId,
      accountId,
      transactionDate,
      transactionName,
      depositAmount: depositAmount || scheduledTotal,
      jobId: job._id,
      paymentSortOrder,
      paymentLabel,
      paymentDueType: targetItem.dueType || 'milestone',
      linkedBy: req.user?._id,
      markPaidApplied,
    });

    return res.status(201).json({
      allocation: allocationResponse(allocation, job),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'This deposit or payment slot is already linked' });
    }
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
  deleteDepositAllocation,
};
