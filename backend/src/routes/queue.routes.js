const router = require('express').Router();
const { eq, and, inArray } = require('drizzle-orm');
const {
  getQueueForTenant,
  requestCancelFlag,
  requestPauseFlag,
  clearPauseFlag,
  isPauseRequested,
} = require('../config/queue');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { campaigns } = require('../db/schema');
const {
  fetchMergedLogsForJob,
  canonicalPhoneForLog,
  logMatchesContact,
} = require('../utils/job-merge-logs.util');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || ''));
}

const STATE_LABELS = {
  waiting: 'Na fila',
  active: 'Em execução',
  delayed: 'Agendado',
  completed: 'Concluído',
  failed: 'Falhou',
  paused: 'Pausado',
};

function normalizeReturnValue(job) {
  let rv = job.returnvalue;
  if (rv == null) return null;
  if (typeof rv === 'string') {
    try { rv = JSON.parse(rv); } catch { return null; }
  }
  return typeof rv === 'object' && rv !== null ? rv : null;
}

router.get('/jobs', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const queue = getQueueForTenant(tenantId);

    const types = ['waiting', 'active', 'delayed', 'completed', 'failed'];
    const jobs = await queue.getJobs(types, 0, 100);

    const campaignIds = [...new Set(jobs.map((j) => j.data?.campaignId).filter((id) => id && isValidUUID(id)))];
    const campaignRows = campaignIds.length
      ? await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns)
          .where(and(inArray(campaigns.id, campaignIds), eq(campaigns.tenantId, tenantId)))
      : [];
    const nameById = Object.fromEntries(campaignRows.map((c) => [c.id, c.name]));

    const out = await Promise.all(
      jobs.map(async (job) => {
        const state = await job.getState();
        const cid = job.data?.campaignId;
        const campaignName = cid && isValidUUID(cid) ? nameById[cid] ?? null : null;
        const total = job.data?.contacts?.length ?? 0;
        const prog = typeof job.progress === 'function' ? job.progress() : 0;
        const result = normalizeReturnValue(job);
        const paused = state === 'active' ? await isPauseRequested(tenantId, job.id) : false;
        return {
          id: String(job.id),
          state,
          stateLabel: STATE_LABELS[state] || state,
          paused,
          campaignId: cid,
          campaignName,
          contactsTotal: total,
          progress: prog,
          createdAt: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          failedReason: job.failedReason || null,
          result,
        };
      }),
    );

    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json(out);
  } catch (err) {
    console.error('queue list:', err);
    res.status(500).json({ error: err.message });
  }
});

async function mergeRecipientsForJob(tenantId, jobId, res) {
  try {
    const queue = getQueueForTenant(tenantId);
    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job não encontrado na fila' });
    }

    const campaignId = job.data?.campaignId;
    const sendJobId = String(job.id);
    const queueContacts = Array.isArray(job.data?.contacts) ? job.data.contacts : [];

    const merged = await fetchMergedLogsForJob(jobId, job);
    const logs = merged?.logs ?? [];
    const remaining = [...logs];

    const recipients = [];
    for (const c of queueContacts) {
      let mi = remaining.findIndex((log) => canonicalPhoneForLog(c.phone) === canonicalPhoneForLog(log.phone));
      if (mi < 0) mi = remaining.findIndex((log) => logMatchesContact(c.phone, log));
      let log = null;
      if (mi >= 0) log = remaining.splice(mi, 1)[0];
      recipients.push({
        _id: log?.id,
        name: log?.name ?? c.name,
        phone: c.phone,
        status: log?.status ?? 'unknown',
        error: log?.error ?? null,
        sentAt: log?.sentAt ?? null,
        source: log ? 'merged' : 'queue_only',
      });
    }

    for (const log of remaining) {
      recipients.push({
        _id: log.id,
        name: log.name,
        phone: log.phone,
        status: log.status,
        error: log.error ?? null,
        sentAt: log.sentAt ?? null,
        source: 'log_only',
      });
    }

    res.json({ jobId: sendJobId, campaignId: campaignId ? String(campaignId) : null, recipients });
  } catch (err) {
    console.error('job recipients:', err);
    res.status(500).json({ error: err.message });
  }
}

router.get('/job-recipients', async (req, res) => {
  const jobId = req.query.jobId;
  if (!jobId || String(jobId).trim() === '') {
    return res.status(400).json({ error: 'jobId obrigatório' });
  }
  return mergeRecipientsForJob(getTenantId(req), jobId, res);
});

router.get('/jobs/:jobId/recipients', async (req, res) => {
  return mergeRecipientsForJob(getTenantId(req), req.params.jobId, res);
});

router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const queue = getQueueForTenant(tenantId);
    const job = await queue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') return res.status(400).json({ error: 'Job já finalizado' });
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      return res.json({ ok: true, action: 'removed' });
    }
    if (state === 'active') {
      await requestCancelFlag(tenantId, job.id);
      return res.json({ ok: true, action: 'cancelling' });
    }
    return res.status(400).json({ error: `Estado não suportado: ${state}` });
  } catch (err) {
    console.error('queue cancel:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs/:id/pause', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const queue = getQueueForTenant(tenantId);
    const job = await queue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    const state = await job.getState();
    if (state !== 'active') {
      return res.status(400).json({ error: `Só é possível pausar um job em execução (estado atual: ${state})` });
    }
    await requestPauseFlag(tenantId, job.id);
    return res.json({ ok: true, action: 'pausing' });
  } catch (err) {
    console.error('queue pause:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs/:id/resume', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const queue = getQueueForTenant(tenantId);
    const job = await queue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    await clearPauseFlag(tenantId, job.id);
    return res.json({ ok: true, action: 'resuming' });
  } catch (err) {
    console.error('queue resume:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
