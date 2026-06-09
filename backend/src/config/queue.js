const Bull = require('bull');

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

/** Map de tenantId → Bull instance */
const queues = new Map();

function getQueueForTenant(tenantId) {
  if (!queues.has(tenantId)) {
    queues.set(tenantId, new Bull(`send-queue:${tenantId}`, { redis: REDIS_CONFIG }));
  }
  return queues.get(tenantId);
}

/* ─── Chaves Redis de controle (isoladas por tenant) ─────── */

const CANCEL_KEY = (tenantId, jobId) => `gestaozap:${tenantId}:send-cancel:${jobId}`;
const DISPATCH_CANCEL_KEY = (tenantId, dispatchId) => `gestaozap:${tenantId}:dispatch-cancel:${dispatchId}`;
const PAUSE_KEY  = (tenantId, jobId) => `gestaozap:${tenantId}:send-pause:${jobId}`;

async function requestCancelFlag(tenantId, jobId) {
  await getQueueForTenant(tenantId).client.set(CANCEL_KEY(tenantId, jobId), '1', 'EX', 86400);
}

async function isCancelRequested(tenantId, jobId) {
  if (!jobId) return false;
  const v = await getQueueForTenant(tenantId).client.get(CANCEL_KEY(tenantId, jobId));
  return v === '1';
}

async function clearCancelFlag(tenantId, jobId) {
  if (!jobId) return;
  await getQueueForTenant(tenantId).client.del(CANCEL_KEY(tenantId, jobId));
}

async function requestCancelDispatch(tenantId, dispatchId) {
  if (!dispatchId) return;
  await getQueueForTenant(tenantId).client.set(DISPATCH_CANCEL_KEY(tenantId, dispatchId), '1', 'EX', 604800);
}

async function isDispatchCancelRequested(tenantId, dispatchId) {
  if (!dispatchId) return false;
  const v = await getQueueForTenant(tenantId).client.get(DISPATCH_CANCEL_KEY(tenantId, dispatchId));
  return v === '1';
}

async function requestPauseFlag(tenantId, jobId) {
  await getQueueForTenant(tenantId).client.set(PAUSE_KEY(tenantId, jobId), '1', 'EX', 86400);
}

async function isPauseRequested(tenantId, jobId) {
  if (!jobId) return false;
  const v = await getQueueForTenant(tenantId).client.get(PAUSE_KEY(tenantId, jobId));
  return v === '1';
}

async function clearPauseFlag(tenantId, jobId) {
  if (!jobId) return;
  await getQueueForTenant(tenantId).client.del(PAUSE_KEY(tenantId, jobId));
}

async function clearDispatchCancel(tenantId, dispatchId) {
  if (!dispatchId) return;
  await getQueueForTenant(tenantId).client.del(DISPATCH_CANCEL_KEY(tenantId, dispatchId));
}

module.exports = {
  getQueueForTenant,
  requestCancelFlag,
  isCancelRequested,
  clearCancelFlag,
  requestCancelDispatch,
  isDispatchCancelRequested,
  clearDispatchCancel,
  requestPauseFlag,
  isPauseRequested,
  clearPauseFlag,
};
