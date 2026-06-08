const { eq, and, inArray } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { sendLogs } = require('../db/schema');
const { getQueueForTenant } = require('../config/queue');
const { normalizePhoneForWhatsApp, phonesMatchLoose } = require('./phone.util');

function canonicalPhoneForLog(p) {
  return normalizePhoneForWhatsApp(p) || String(p || '').replace(/\D/g, '');
}

function dedupeLogsPreferThisJob(logs, preferredSendJobId) {
  const priority = (log) => {
    if (log.sendJobId != null && String(log.sendJobId) === String(preferredSendJobId)) return 2;
    if (log.sendJobId != null && String(log.sendJobId).length > 0) return 1;
    return 0;
  };
  const sorted = [...logs].sort((a, b) => priority(b) - priority(a) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const seen = new Map();
  for (const log of sorted) {
    const k = canonicalPhoneForLog(log.phone);
    if (!k) continue;
    if (!seen.has(k)) seen.set(k, log);
  }
  return [...seen.values()];
}

async function fetchMergedLogsForJob(jobId, jobPreload = null) {
  // Infere tenantId do job precarregado para buscar a fila certa
  const preloadTenantId = jobPreload?.data?.tenantId || DEFAULT_TENANT_ID;
  const queue = getQueueForTenant(preloadTenantId);
  const job = jobPreload ?? await queue.getJob(String(jobId));
  if (!job) return null;

  const db = getDb();
  const campaignId = job.data?.campaignId;
  const tenantId = job.data?.tenantId || DEFAULT_TENANT_ID;
  const sendJobId = String(job.id);
  const queueContacts = Array.isArray(job.data?.contacts) ? job.data.contacts : [];

  let logs = [];

  if (campaignId) {
    logs = await db.select().from(sendLogs)
      .where(and(eq(sendLogs.tenantId, tenantId), eq(sendLogs.campaignId, campaignId), eq(sendLogs.sendJobId, sendJobId)))
      .orderBy(sendLogs.createdAt);

    const phoneKeys = [...new Set(
      queueContacts.map((c) => canonicalPhoneForLog(c.phone)).filter(Boolean),
    )];

    const needFallback = phoneKeys.length > 0 && (logs.length === 0 || logs.length < queueContacts.length);

    if (needFallback) {
      const byPhone = await db.select().from(sendLogs)
        .where(and(
          eq(sendLogs.tenantId, tenantId),
          eq(sendLogs.campaignId, campaignId),
          inArray(sendLogs.phone, phoneKeys),
        ))
        .orderBy(sendLogs.createdAt);

      logs = dedupeLogsPreferThisJob([...logs, ...byPhone], sendJobId);
    } else {
      logs = dedupeLogsPreferThisJob(logs, sendJobId);
    }
  }

  return {
    logs,
    campaignId: campaignId ? String(campaignId) : null,
    sendJobId,
  };
}

function logMatchesContact(contactPhone, logDoc) {
  const a = canonicalPhoneForLog(contactPhone);
  const b = canonicalPhoneForLog(logDoc.phone);
  if (a && b && a === b) return true;
  return phonesMatchLoose(contactPhone, logDoc.phone);
}

module.exports = {
  fetchMergedLogsForJob,
  canonicalPhoneForLog,
  dedupeLogsPreferThisJob,
  logMatchesContact,
};
