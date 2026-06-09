const {
  getQueueForTenant,
  clearCancelFlag,
  clearPauseFlag,
} = require('../config/queue');
const guard = require('./whatsapp.guard');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');

async function clearDispatchCancel(tenantId, dispatchId) {
  if (!dispatchId) return;
  await getQueueForTenant(tenantId).client.del(`gestaozap:${tenantId}:dispatch-cancel:${dispatchId}`);
}

function mergeUniqueContacts(existing, additions) {
  const seen = new Set(
    (existing || []).map((c) => normalizePhoneForWhatsApp(c.phone) || String(c.phone || '').replace(/\D/g, '')),
  );
  const out = [...(existing || [])];
  for (const row of additions) {
    const phone = row.phone;
    const key = normalizePhoneForWhatsApp(phone) || String(phone || '').replace(/\D/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ phone, name: row.name || '' });
  }
  return out;
}

async function releaseLocksForRows(tenantId, rows) {
  for (const row of rows) {
    const digits = normalizePhoneForWhatsApp(row.phone) || String(row.phone || '').replace(/\D/g, '');
    if (digits) await guard.releaseRecipientLock(tenantId, digits);
  }
}

/**
 * Reenfileira falhas reutilizando o job Bull original (runId) quando possível.
 * Não cancela dispatches nem cria um novo disparo separado.
 */
async function requeueFailuresForRun(tenantId, campaign, runId, failedRows, hourOptions = {}) {
  const queue = getQueueForTenant(tenantId);
  const { hourStart = 8, hourEnd = 20, ignoreHours = false } = hourOptions;

  await releaseLocksForRows(tenantId, failedRows);

  if (!runId) {
    const job = await queue.add({
      campaignId: campaign.id,
      tenantId,
      contacts: failedRows.map((l) => ({ phone: l.phone, name: l.name })),
      text: campaign.text,
      imagePath: campaign.imagePath || null,
      appendOptOut: campaign.appendOptOut || false,
      optOutText: campaign.optOutText || '',
      hourStart,
      hourEnd,
      ignoreHours: Boolean(ignoreHours),
      dispatchedAt: new Date().toISOString(),
    });
    return { jobId: String(job.id), retrying: failedRows.length, reusedJob: false };
  }

  const job = await queue.getJob(String(runId));
  if (!job) {
    const dispatchId = failedRows.find((r) => r.dispatchId)?.dispatchId || null;
    const continuation = await queue.add({
      campaignId: campaign.id,
      tenantId,
      dispatchId,
      sendJobIdOverride: String(runId),
      isRetryContinuation: true,
      contacts: failedRows.map((l) => ({ phone: l.phone, name: l.name })),
      text: campaign.text,
      imagePath: campaign.imagePath || null,
      appendOptOut: campaign.appendOptOut || false,
      optOutText: campaign.optOutText || '',
      hourStart,
      hourEnd,
      ignoreHours: Boolean(ignoreHours),
      dispatchedAt: new Date().toISOString(),
    });
    return {
      jobId: String(continuation.id),
      retrying: failedRows.length,
      reusedJob: false,
      continuation: true,
      runId: String(runId),
    };
  }

  await clearCancelFlag(tenantId, job.id);
  await clearPauseFlag(tenantId, job.id);
  if (job.data?.dispatchId) await clearDispatchCancel(tenantId, job.data.dispatchId);

  const mergedContacts = mergeUniqueContacts(job.data?.contacts || [], failedRows);
  if (mergedContacts.length > (job.data?.contacts || []).length) {
    await job.update({ ...job.data, contacts: mergedContacts });
  }

  const state = await job.getState();
  if (state === 'completed' || state === 'failed') {
    await job.retry();
  }

  return {
    jobId: String(job.id),
    retrying: failedRows.length,
    reusedJob: true,
    runId: String(runId),
    state,
  };
}

module.exports = {
  requeueFailuresForRun,
  mergeUniqueContacts,
  releaseLocksForRows,
  clearDispatchCancel,
};
