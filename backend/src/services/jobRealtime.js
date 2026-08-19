const {
  publishProjectCreated,
  publishProjectUpdated,
  publishProjectDeleted,
} = require('./eventBus');

function sourceSocketIdFromReq(req) {
  const raw = req?.headers?.['x-socket-id'];
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
}

function getIo(reqOrIo) {
  if (reqOrIo && typeof reqOrIo.to === 'function' && typeof reqOrIo.emit === 'function') {
    return reqOrIo;
  }
  return reqOrIo?.app?.get?.('io') || null;
}

async function toPublishedJob(job) {
  if (!job) return null;
  if (typeof job.populate === 'function') {
    await job.populate({
      path: 'customerId',
      select: 'name primaryPhone primaryEmail address',
      strictPopulate: false,
    });
    await job.populate({
      path: 'assignedTo',
      select: 'name email',
      strictPopulate: false,
    });
  }
  return job.toObject ? job.toObject() : job;
}

async function emitJobCreated(reqOrIo, job, opts = {}) {
  const io = getIo(reqOrIo);
  if (!io || !job) return;
  const plain = await toPublishedJob(job);
  publishProjectCreated(io, plain, {
    sourceSocketId: opts.sourceSocketId || sourceSocketIdFromReq(reqOrIo),
  });
}

async function emitJobUpdated(reqOrIo, job, opts = {}) {
  const io = getIo(reqOrIo);
  if (!io || !job) return;
  const plain = await toPublishedJob(job);
  publishProjectUpdated(io, plain, {
    sourceSocketId: opts.sourceSocketId || sourceSocketIdFromReq(reqOrIo),
  });
}

async function emitJobDeleted(reqOrIo, job, opts = {}) {
  const io = getIo(reqOrIo);
  if (!io || !job) return;
  publishProjectDeleted(io, job, {
    sourceSocketId: opts.sourceSocketId || sourceSocketIdFromReq(reqOrIo),
  });
}

module.exports = {
  sourceSocketIdFromReq,
  emitJobCreated,
  emitJobUpdated,
  emitJobDeleted,
};
