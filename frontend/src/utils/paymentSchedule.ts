export function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export const STANDARD_4060_TEMPLATE = [
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

export function getContractBase(job) {
  const contracted = Number(job?.valueContracted);
  const estimated = Number(job?.valueEstimated);
  if (Number.isFinite(contracted) && contracted > 0) return contracted;
  if (Number.isFinite(estimated) && estimated > 0) return estimated;
  return 0;
}

export function hasStoredPaymentSchedule(job) {
  return Array.isArray(job?.paymentSchedule?.items) && job.paymentSchedule.items.length > 0;
}

export function computeItemAmount(item, contractBase) {
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

export function resolvePaymentSchedule(job) {
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

export function validatePaymentSchedule(schedule, contractBase) {
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
      `Payment schedule is ${diffLabel} by $${Math.abs(remaining).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    );
  }

  return { scheduledTotal, remaining, warnings, isBalanced: base <= 0 || Math.abs(remaining) <= 0.01 };
}

export function formatScheduleItemLabel(item) {
  if (!item) return '';
  const amount = roundMoney(item.amount);
  if (item.amountType === 'percentage' && Number.isFinite(Number(item.percentage))) {
    return `${item.label} (${item.percentage}%): $${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `${item.label}: $${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function buildCustomScheduleFromItems(items, contractBase) {
  return {
    type: 'custom',
    items: items.map((item, idx) => ({
      ...item,
      sortOrder: idx,
      amount:
        item.amountType === 'percentage'
          ? computeItemAmount(item, contractBase)
          : roundMoney(Number(item.amount) || 0),
    })),
  };
}

export function buildStandardSchedule(contractBase) {
  return {
    type: 'standard_40_60',
    items: STANDARD_4060_TEMPLATE.map((template, idx) => ({
      ...template,
      amount: computeItemAmount(template, contractBase),
      sortOrder: idx,
    })),
  };
}

export function matchesStandard4060Template(items) {
  if (!Array.isArray(items) || items.length !== 2) return false;
  return STANDARD_4060_TEMPLATE.every((template, idx) => {
    const item = items[idx];
    if (!item) return false;
    return (
      item.amountType === template.amountType &&
      Number(item.percentage) === template.percentage &&
      item.dueType === template.dueType &&
      String(item.label || '').trim() === template.label
    );
  });
}

export function buildSchedulePayloadFromItems(items, contractBase) {
  const itemsForSave = (items || []).map(({ localId, ...item }) => item);
  if (matchesStandard4060Template(itemsForSave)) {
    const standard = buildStandardSchedule(contractBase);
    standard.items = standard.items.map((template, idx) => ({
      ...template,
      status: itemsForSave[idx]?.status || template.status,
      paidAmount: itemsForSave[idx]?.paidAmount ?? 0,
      paidAt: itemsForSave[idx]?.paidAt ?? null,
    }));
    return standard;
  }
  return buildCustomScheduleFromItems(itemsForSave, contractBase);
}

export function getCommissionPaymentSplits(job, contractBase, commissionDue) {
  const base = roundMoney(contractBase);
  const due = roundMoney(commissionDue);
  const resolved = resolvePaymentSchedule({
    ...(job || {}),
    valueEstimated: base,
    valueContracted: base,
  });
  const items = resolved.items || [];
  const scheduledTotal = roundMoney(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));

  if (!items.length) {
    return [
      {
        label: 'Commission',
        dueType: 'milestone',
        share: 1,
        scheduledAmount: base,
        amount: due,
        status: 'pending',
        paidAt: null,
      },
    ];
  }

  if (scheduledTotal <= 0) {
    const evenShare = 1 / items.length;
    let running = 0;
    return items.map((item, idx) => {
      const amount =
        idx === items.length - 1 ? roundMoney(due - running) : roundMoney(due * evenShare);
      running += amount;
      return {
        label: item.label || `Payment ${idx + 1}`,
        dueType: item.dueType,
        share: evenShare,
        scheduledAmount: 0,
        amount,
        status: item.status || 'pending',
        paidAt: item.paidAt || null,
      };
    });
  }

  let running = 0;
  return items.map((item, idx) => {
    const scheduledAmount = roundMoney(item.amount);
    const share = scheduledAmount / scheduledTotal;
    const amount =
      idx === items.length - 1 ? roundMoney(due - running) : roundMoney(due * share);
    running += amount;
    return {
      label: item.label || `Payment ${idx + 1}`,
      dueType: item.dueType,
      share,
      scheduledAmount,
      amount,
      status: item.status || 'pending',
      paidAt: item.paidAt || null,
    };
  });
}

export function getCommissionPaymentSplitShares(job, contractBase) {
  const base = roundMoney(contractBase);
  const resolved = resolvePaymentSchedule({
    ...(job || {}),
    valueEstimated: base,
    valueContracted: base,
  });
  const items = resolved.items || [];
  const scheduledTotal = roundMoney(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  const denominator = base > 0 ? base : scheduledTotal;
  if (!denominator) {
    return { payment1Share: 0.4, payment2Share: 0.6 };
  }

  let payment1Amount = 0;
  let payment2Amount = 0;
  for (const item of items) {
    const amt = roundMoney(item.amount);
    if (item.dueType === 'final') payment2Amount += amt;
    else payment1Amount += amt;
  }

  if (payment1Amount <= 0 && payment2Amount <= 0) {
    return { payment1Share: 0.4, payment2Share: 0.6 };
  }
  if (payment2Amount <= 0) {
    payment2Amount = Math.max(0, denominator - payment1Amount);
  }
  if (payment1Amount <= 0) {
    payment1Amount = Math.max(0, denominator - payment2Amount);
  }

  const splitTotal = payment1Amount + payment2Amount;
  if (splitTotal <= 0) {
    return { payment1Share: 0.4, payment2Share: 0.6 };
  }

  return {
    payment1Share: payment1Amount / splitTotal,
    payment2Share: payment2Amount / splitTotal,
  };
}

export function createEmptyScheduleItem(sortOrder = 0) {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    label: '',
    amountType: 'fixed',
    percentage: undefined,
    amount: 0,
    dueType: 'milestone',
    dueNote: '',
    dueDate: null,
    status: 'pending',
    paidAmount: 0,
    paidAt: null,
    sortOrder,
  };
}
