function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

const STANDARD_4060_TEMPLATE = [
  {
    label: 'Deposit',
    amountType: 'percentage',
    percentage: 40,
    dueType: 'deposit',
    dueNote: '',
    status: 'pending',
    paidAmount: 0,
    sortOrder: 0,
  },
  {
    label: 'Final Balance',
    amountType: 'percentage',
    percentage: 60,
    dueType: 'final',
    dueNote: '',
    status: 'pending',
    paidAmount: 0,
    sortOrder: 1,
  },
];

const ALLOWED_AMOUNT_TYPES = new Set(['percentage', 'fixed']);
const ALLOWED_DUE_TYPES = new Set(['deposit', 'milestone', 'final', 'custom']);
const ALLOWED_STATUSES = new Set(['pending', 'invoiced', 'paid']);
const ALLOWED_SCHEDULE_TYPES = new Set(['standard_40_60', 'custom']);

function getContractBase(job) {
  const contracted = Number(job?.valueContracted);
  const estimated = Number(job?.valueEstimated);
  if (Number.isFinite(contracted) && contracted > 0) return contracted;
  if (Number.isFinite(estimated) && estimated > 0) return estimated;
  return 0;
}

function hasStoredPaymentSchedule(job) {
  return Array.isArray(job?.paymentSchedule?.items) && job.paymentSchedule.items.length > 0;
}

function computeItemAmount(item, contractBase) {
  if (!item) return 0;
  if (item.amountType === 'fixed') {
    return roundMoney(Number(item.amount) || 0);
  }
  if (item.amountType === 'percentage') {
    const pct = Number(item.percentage);
    if (!Number.isFinite(pct)) return roundMoney(Number(item.amount) || 0);
    return roundMoney(contractBase * (pct / 100));
  }
  return roundMoney(Number(item.amount) || 0);
}

function resolvePaymentSchedule(job) {
  const contractBase = getContractBase(job);
  if (!hasStoredPaymentSchedule(job)) {
    return {
      type: 'standard_40_60',
      items: STANDARD_4060_TEMPLATE.map((template, idx) => ({
        ...template,
        amount: computeItemAmount(template, contractBase),
        sortOrder: idx,
      })),
      isFallback: true,
    };
  }

  const items = [...job.paymentSchedule.items]
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map((item, idx) => ({
      ...item,
      amount: computeItemAmount(item, contractBase),
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : idx,
    }));

  return {
    type: job.paymentSchedule.type || 'custom',
    items,
    isFallback: false,
  };
}

function validatePaymentSchedule(schedule, contractBase) {
  const items = schedule?.items || [];
  const scheduledTotal = roundMoney(
    items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  );
  const base = roundMoney(contractBase);
  const remaining = roundMoney(base - scheduledTotal);
  const warnings = [];

  if (base > 0 && Math.abs(remaining) > 0.01) {
    const diffLabel = remaining > 0 ? 'under-scheduled' : 'over-scheduled';
    warnings.push(
      `Payment schedule is ${diffLabel} by ${Math.abs(remaining).toFixed(2)} (scheduled ${scheduledTotal.toFixed(2)} vs contract ${base.toFixed(2)})`
    );
  }

  for (const item of items) {
    if (item.amountType === 'percentage') {
      const pct = Number(item.percentage);
      if (!Number.isFinite(pct) || pct < 0) {
        warnings.push(`"${item.label || 'Item'}" has an invalid percentage`);
      }
    } else if (item.amountType === 'fixed') {
      const amt = Number(item.amount);
      if (!Number.isFinite(amt) || amt < 0) {
        warnings.push(`"${item.label || 'Item'}" has an invalid fixed amount`);
      }
    }
    if (!item.label || !String(item.label).trim()) {
      warnings.push('One or more payment items are missing a label');
    }
  }

  return {
    scheduledTotal,
    remaining,
    warnings,
    isBalanced: base <= 0 || Math.abs(remaining) <= 0.01,
  };
}

function normalizeScheduleItem(raw, idx, contractBase) {
  const amountType = ALLOWED_AMOUNT_TYPES.has(raw?.amountType) ? raw.amountType : 'fixed';
  const dueType = ALLOWED_DUE_TYPES.has(raw?.dueType) ? raw.dueType : 'custom';
  const status = ALLOWED_STATUSES.has(raw?.status) ? raw.status : 'pending';

  const item = {
    label: String(raw?.label || '').trim() || `Payment ${idx + 1}`,
    amountType,
    percentage: amountType === 'percentage' ? Number(raw?.percentage) : undefined,
    amount: amountType === 'fixed' ? roundMoney(Number(raw?.amount) || 0) : computeItemAmount(
      {
        amountType: 'percentage',
        percentage: Number(raw?.percentage),
        amount: raw?.amount,
      },
      contractBase
    ),
    dueType,
    dueNote: String(raw?.dueNote || '').trim(),
    dueDate: raw?.dueDate ? new Date(raw.dueDate) : undefined,
    status,
    paidAmount: roundMoney(Number(raw?.paidAmount) || 0),
    paidAt: raw?.paidAt ? new Date(raw.paidAt) : undefined,
    sortOrder: Number.isFinite(Number(raw?.sortOrder)) ? Number(raw.sortOrder) : idx,
  };

  if (amountType === 'percentage') {
    item.percentage = Number(raw?.percentage);
    item.amount = computeItemAmount(item, contractBase);
  }

  if (item.dueDate && Number.isNaN(item.dueDate.getTime())) {
    delete item.dueDate;
  }
  if (item.paidAt && Number.isNaN(item.paidAt.getTime())) {
    delete item.paidAt;
  }

  return item;
}

function normalizePaymentScheduleInput(input, contractBase) {
  const type = ALLOWED_SCHEDULE_TYPES.has(input?.type) ? input.type : 'custom';
  const rawItems = Array.isArray(input?.items) ? input.items : [];

  let items;
  if (type === 'standard_40_60' && rawItems.length === 0) {
    items = STANDARD_4060_TEMPLATE.map((template, idx) =>
      normalizeScheduleItem(template, idx, contractBase)
    );
  } else {
    items = rawItems
      .map((raw, idx) => normalizeScheduleItem(raw, idx, contractBase))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((item, idx) => ({ ...item, sortOrder: idx }));
  }

  const schedule = { type, items };
  const validation = validatePaymentSchedule(
    {
      items: items.map((item) => ({
        ...item,
        amount: computeItemAmount(item, contractBase),
      })),
    },
    contractBase
  );

  return { schedule, warnings: validation.warnings, validation };
}

function buildStandard4060Schedule(contractBase) {
  return normalizePaymentScheduleInput({ type: 'standard_40_60', items: [] }, contractBase).schedule;
}

function findScheduleAmountForKind(schedule, kind) {
  const items = schedule?.items || [];
  if (!items.length) return null;

  if (kind === 'deposit') {
    const hit =
      items.find((i) => i.dueType === 'deposit') ||
      items.find((i) => /deposit/i.test(String(i.label || '')));
    return hit ? roundMoney(Number(hit.amount) || 0) : null;
  }

  if (kind === 'final') {
    const finals = items.filter((i) => i.dueType === 'final');
    if (finals.length) {
      return roundMoney(finals.reduce((sum, i) => sum + (Number(i.amount) || 0), 0));
    }
    const hit = items.find((i) => /final/i.test(String(i.label || '')));
    return hit ? roundMoney(Number(hit.amount) || 0) : null;
  }

  return null;
}

function describeScheduleItem(item) {
  if (!item) return '';
  if (item.amountType === 'percentage' && Number.isFinite(Number(item.percentage))) {
    return `${item.label} (${item.percentage}%): $${roundMoney(item.amount).toFixed(2)}`;
  }
  return `${item.label}: $${roundMoney(item.amount).toFixed(2)}`;
}

function scheduleItemKey(item) {
  return `${item.label}|${item.sortOrder}|${item.dueType}`;
}

function diffPaymentScheduleActivities(oldSchedule, newSchedule) {
  const oldItems = Array.isArray(oldSchedule?.items) ? oldSchedule.items : [];
  const newItems = Array.isArray(newSchedule?.items) ? newSchedule.items : [];
  const activities = [];

  const hadSchedule = oldItems.length > 0;
  const hasSchedule = newItems.length > 0;
  const oldJson = JSON.stringify(oldSchedule || {});
  const newJson = JSON.stringify(newSchedule || {});

  if (!hadSchedule && hasSchedule) {
    activities.push({ type: 'payment_schedule_updated', note: 'Payment schedule created' });
  } else if (hadSchedule && oldJson !== newJson) {
    activities.push({ type: 'payment_schedule_updated', note: 'Payment schedule updated' });
  }

  const oldByKey = new Map(oldItems.map((item) => [scheduleItemKey(item), item]));

  for (const newItem of newItems) {
    const key = scheduleItemKey(newItem);
    const oldItem = oldByKey.get(key);

    if (!oldItem) {
      if (newItem.status === 'paid') {
        activities.push({
          type: 'payment_received',
          note: `Payment received: ${describeScheduleItem(newItem)}`,
          amount: roundMoney(newItem.paidAmount || newItem.amount),
          paymentType: newItem.dueType || 'milestone',
        });
      }
      continue;
    }

    if (oldItem.status === 'paid' && newItem.status !== 'paid') {
      activities.push({
        type: 'payment_schedule_updated',
        note: `Payment status reset: ${newItem.label || 'item'}`,
      });
    } else if (newItem.status === 'paid' && oldItem.status !== 'paid') {
      activities.push({
        type: 'payment_received',
        note: `Payment received: ${describeScheduleItem(newItem)}`,
        amount: roundMoney(newItem.paidAmount || newItem.amount),
        paymentType: newItem.dueType || 'milestone',
      });
    } else if (newItem.status === 'paid' && oldItem.status === 'paid') {
      const amountChanged =
        roundMoney(oldItem.paidAmount || oldItem.amount) !==
        roundMoney(newItem.paidAmount || newItem.amount);
      const oldPaidAt = oldItem.paidAt ? new Date(oldItem.paidAt).toISOString() : '';
      const newPaidAt = newItem.paidAt ? new Date(newItem.paidAt).toISOString() : '';
      if (amountChanged || oldPaidAt !== newPaidAt) {
        activities.push({
          type: 'payment_schedule_updated',
          note: `Payment record updated: ${describeScheduleItem(newItem)}`,
          amount: roundMoney(newItem.paidAmount || newItem.amount),
          paymentType: newItem.dueType || 'milestone',
        });
      }
    }
  }

  return activities;
}

module.exports = {
  roundMoney,
  STANDARD_4060_TEMPLATE,
  getContractBase,
  hasStoredPaymentSchedule,
  computeItemAmount,
  resolvePaymentSchedule,
  validatePaymentSchedule,
  normalizePaymentScheduleInput,
  buildStandard4060Schedule,
  findScheduleAmountForKind,
  describeScheduleItem,
  diffPaymentScheduleActivities,
};
