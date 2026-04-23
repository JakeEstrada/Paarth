const DocumentSequence = require('../models/DocumentSequence');

function formatDocumentNumber({ prefix, sequence, documentType }) {
  const seq = String(sequence).padStart(4, '0');
  // Keep estimate format backward-friendly by default.
  if (documentType === 'estimate') return `${prefix}-${seq}`;
  if (documentType === 'invoice') return `${prefix}-INV-${seq}`;
  if (documentType === 'contract') return `${prefix}-CON-${seq}`;
  return `${prefix}-${seq}`;
}

async function getNextDocumentNumber({ documentType, prefix = '1102' }) {
  await DocumentSequence.findOneAndUpdate(
    { documentType },
    {
      $setOnInsert: { documentType, prefix, nextSequence: 0 },
    },
    { upsert: true }
  );

  const seq = await DocumentSequence.findOneAndUpdate(
    { documentType },
    {
      $inc: { nextSequence: 1 },
    },
    { new: true }
  );

  const sequenceNumber = seq.nextSequence;
  const display = formatDocumentNumber({
    prefix: seq.prefix || prefix,
    sequence: sequenceNumber,
    documentType,
  });

  return {
    sequenceNumber,
    display,
    prefix: seq.prefix || prefix,
  };
}

async function initializeSequence({ documentType, prefix = '1102', nextSequence = 1 }) {
  const safeNext = Math.max(1, Number(nextSequence) || 1);
  const doc = await DocumentSequence.findOneAndUpdate(
    { documentType },
    { $set: { documentType, prefix, nextSequence: safeNext } },
    { new: true, upsert: true }
  );
  return doc;
}

module.exports = {
  formatDocumentNumber,
  getNextDocumentNumber,
  initializeSequence,
};
