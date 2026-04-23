/* eslint-disable no-console */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Job = require('../src/models/Job');
const Estimate = require('../src/models/Estimate');
const DocumentSequence = require('../src/models/DocumentSequence');

function snapshotNonEmpty(est) {
  if (!est || typeof est !== 'object') return false;
  return Boolean(
    (est.number && String(est.number).trim()) ||
      (Array.isArray(est.lineItems) && est.lineItems.length > 0) ||
      (typeof est.amount === 'number' && est.amount > 0) ||
      est.sentAt != null ||
      (est.estimateDate && String(est.estimateDate).trim())
  );
}

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

function deriveLegacySequence(number) {
  const raw = String(number || '').trim();
  const m = raw.match(/(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  return {
    prefix: m[1],
    seq: Number(m[2]),
  };
}

async function migrate() {
  const mongo = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongo) throw new Error('MONGODB_URI (or MONGO_URI) is required');
  await mongoose.connect(mongo);
  console.log('Connected to MongoDB');

  const jobs = await Job.find({
    $or: [
      { estimate: { $exists: true, $ne: null } },
      { estimateHistory: { $exists: true, $not: { $size: 0 } } },
    ],
  }).lean();
  console.log(`Jobs to inspect: ${jobs.length}`);

  let createdCount = 0;
  for (const job of jobs) {
    const already = await Estimate.findOne({ jobId: job._id });
    if (already) continue;

    const history = Array.isArray(job.estimateHistory) ? job.estimateHistory : [];
    const current = job.estimate || null;
    const snapshots = history.filter(snapshotNonEmpty);
    if (snapshotNonEmpty(current)) snapshots.push(current);
    if (!snapshots.length) continue;

    const firstNumber = snapshots.find((s) => s?.number)?.number || '';
    const legacy = deriveLegacySequence(firstNumber);
    const latest = snapshots[snapshots.length - 1] || {};
    const lineItems = normalizeLineItems(latest.lineItems || []);
    const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.total) || 0), 0);
    const amount = Number(latest.amount || subtotal || 0);
    const doc = await Estimate.create({
      tenantId: job.tenantId || undefined,
      customerId: job.customerId,
      jobId: job._id,
      status: 'draft',
      estimateNumber: String(current?.number || firstNumber || `MIG-${job._id}`),
      prefix: legacy?.prefix || '1102',
      sequenceNumber: legacy?.seq || 0,
      estimateDate: latest.estimateDate ? new Date(latest.estimateDate) : null,
      lineItems,
      subtotal,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      grandTotal: amount,
      notes: '',
      projectName: String(latest.projectName || '').trim(),
      footerNote: String(latest.footerNote || '').trim(),
      sourceType: 'migrated',
      sentAt: latest.sentAt ? new Date(latest.sentAt) : null,
      createdBy: job.createdBy || null,
      updatedBy: job.createdBy || null,
    });

    if (legacy?.seq && legacy?.prefix) {
      await DocumentSequence.findOneAndUpdate(
        { tenantId: doc.tenantId || null, documentType: 'estimate' },
        {
          $setOnInsert: { prefix: legacy.prefix, nextSequence: legacy.seq + 1 },
          $max: { nextSequence: legacy.seq + 1 },
          $set: { prefix: legacy.prefix },
        },
        { upsert: true }
      );
    }

    createdCount += 1;
    console.log(`Migrated job ${job._id} -> estimate ${doc._id}`);
  }

  console.log(`Migration complete. Created estimates: ${createdCount}`);
  await mongoose.disconnect();
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
