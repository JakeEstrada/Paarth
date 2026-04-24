function toIsoDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** Pull accounts + transactions from Plaid for the register cache. */
async function fetchRegisterSnapshotFromPlaid(client, accessToken, fetchedDays, { preferLiveBalances = false } = {}) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - fetchedDays);

  let accountsResp;
  if (preferLiveBalances) {
    try {
      accountsResp = await client.accountsBalanceGet({ access_token: accessToken });
    } catch (balanceErr) {
      console.warn('accountsBalanceGet fallback to accountsGet:', balanceErr?.message || balanceErr);
      accountsResp = await client.accountsGet({ access_token: accessToken });
    }
  } else {
    accountsResp = await client.accountsGet({ access_token: accessToken });
  }
  const accounts = Array.isArray(accountsResp?.data?.accounts) ? accountsResp.data.accounts : [];

  const txReqBase = {
    access_token: accessToken,
    start_date: toIsoDateOnly(startDate),
    end_date: toIsoDateOnly(endDate),
  };
  const txOptions = { count: 500, offset: 0 };
  let allTransactions = [];
  while (true) {
    const txResp = await client.transactionsGet({
      ...txReqBase,
      options: txOptions,
    });
    const page = Array.isArray(txResp?.data?.transactions) ? txResp.data.transactions : [];
    allTransactions = allTransactions.concat(page);
    const total = Number(txResp?.data?.total_transactions || 0);
    txOptions.offset += page.length;
    if (txOptions.offset >= total || page.length === 0) break;
  }

  const normalized = allTransactions.map((t) => ({
    transaction_id: t.transaction_id,
    account_id: t.account_id,
    date: t.date,
    name: t.name || t.merchant_name || 'Transaction',
    amount: Number(t.amount || 0),
    pending: Boolean(t.pending),
    category: Array.isArray(t.category) ? t.category : [],
    transactionCode: t.transaction_code || '',
    checkNumber: t.check_number || t.payment_meta?.check_number || t.payment_meta?.reference_number || '',
    referenceNumber: t.payment_meta?.reference_number || '',
    paymentChannel: t.payment_channel || '',
    imageUrl: t.check_image_url || t.payment_meta?.image_url || '',
  }));
  normalized.sort((a, b) => {
    if (a.date === b.date) return String(a.transaction_id).localeCompare(String(b.transaction_id));
    return String(a.date).localeCompare(String(b.date));
  });

  return {
    accounts: accounts.map((a) => ({
      account_id: a.account_id,
      name: a.name,
      official_name: a.official_name,
      subtype: a.subtype,
      type: a.type,
      mask: a.mask,
      balances: a.balances || {},
    })),
    transactions: normalized,
    range: {
      start: toIsoDateOnly(startDate),
      end: toIsoDateOnly(endDate),
      fetchedDays,
    },
  };
}

module.exports = {
  fetchRegisterSnapshotFromPlaid,
};
