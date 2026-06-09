const { getQueueForTenant, requestCancelDispatch, requestCancelFlag } = require('../config/queue');

/** Conta dispatches distintos ativos (continuações compartilham dispatchId). */
async function countActiveDispatches(tenantId) {
  const queue = getQueueForTenant(tenantId);
  const jobs = await queue.getJobs(['active', 'waiting', 'delayed'], 0, 200);
  const dispatchIds = new Set();
  for (const job of jobs) {
    const id = job.data?.dispatchId;
    if (id) dispatchIds.add(String(id));
    else dispatchIds.add(`job:${job.id}`);
  }
  return dispatchIds.size;
}

/** Remove jobs atrasados/na fila de um dispatch (cancelamento de continuação). */
async function removeQueuedJobsForDispatch(tenantId, dispatchId) {
  if (!dispatchId) return 0;
  const queue = getQueueForTenant(tenantId);
  const jobs = await queue.getJobs(['waiting', 'delayed'], 0, 200);
  let removed = 0;
  for (const job of jobs) {
    if (String(job.data?.dispatchId) === String(dispatchId)) {
      await job.remove().catch(() => {});
      removed++;
    }
  }
  return removed;
}

/**
 * Cancela um dispatch por completo: flag no Redis, cancela jobs ativos e remove fila/agendados.
 */
async function cancelDispatchCompletely(tenantId, dispatchId) {
  if (!dispatchId) return { cancelledActive: 0, removed: 0 };
  const queue = getQueueForTenant(tenantId);
  await requestCancelDispatch(tenantId, dispatchId);
  const jobs = await queue.getJobs(['active', 'waiting', 'delayed'], 0, 200);
  let cancelledActive = 0;
  let removed = 0;
  for (const job of jobs) {
    if (String(job.data?.dispatchId) !== String(dispatchId)) continue;
    const state = await job.getState();
    if (state === 'active') {
      await requestCancelFlag(tenantId, job.id);
      cancelledActive++;
    } else if (state === 'waiting' || state === 'delayed') {
      await job.remove().catch(() => {});
      removed++;
    }
  }
  return { cancelledActive, removed };
}

module.exports = { countActiveDispatches, removeQueuedJobsForDispatch, cancelDispatchCompletely };
