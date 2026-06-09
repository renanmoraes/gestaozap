const router = require('express').Router();
const { eq, and, or, sql, desc, asc, isNotNull } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { sendLogs, campaigns, feedbackAnalyses } = require('../db/schema');
const whatsapp = require('../services/whatsapp.service');
const { requireWAConnected } = require('../middleware/featureGate');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');
const { classifyReply, isGreetingReply } = require('../utils/reply-classifier.util');
const { fetchMergedLogsForJob } = require('../utils/job-merge-logs.util');
const { requeueFailuresForRun } = require('../services/retry.service');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

function normalizeDoc(row) {
  if (!row) return row;
  return { ...row, _id: row.id, campaignId: row.campaignId };
}

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || ''));
}

async function getFeedbackSnapshot(req, res) {
  const db = getDb();
  const tenantId = getTenantId(req);
  const campaignId = req.params.campaignId ?? req.query.campaignId;
  if (!campaignId || !isValidUUID(campaignId)) {
    return res.status(400).json({ error: 'campaignId inválido' });
  }
  const runIdRaw = req.query.runId;
  if (runIdRaw === undefined || runIdRaw === null || String(runIdRaw).trim() === '') {
    return res.status(400).json({ error: 'runId obrigatório' });
  }
  const runId = String(runIdRaw);
  const [doc] = await db.select({ payload: feedbackAnalyses.payload, updatedAt: feedbackAnalyses.updatedAt })
    .from(feedbackAnalyses)
    .where(and(
      eq(feedbackAnalyses.tenantId, tenantId),
      eq(feedbackAnalyses.campaignId, campaignId),
      eq(feedbackAnalyses.runId, runId),
    ));
  if (!doc) return res.json(null);
  res.json({ ...doc.payload, snapshotAt: doc.updatedAt });
}

router.get('/runs', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const rows = await db.execute(sql`
      SELECT
        sl.campaign_id,
        COALESCE(sl.send_job_id, 'legacy-' || sl.id::text) AS run_id,
        MIN(COALESCE(sl.dispatched_at, sl.created_at)) AS started_at,
        MAX(sl.updated_at) AS finished_at,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE sl.status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE sl.status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE sl.status = 'pending')::int AS pending,
        c.name AS campaign_name
      FROM send_logs sl
      LEFT JOIN campaigns c ON c.id = sl.campaign_id
      WHERE sl.tenant_id = ${tenantId}
      GROUP BY sl.campaign_id, run_id, c.name
      ORDER BY started_at DESC
    `);
    res.json(rows.rows.map((r) => ({
      campaignId: r.campaign_id,
      campaignName: r.campaign_name || 'Template removido',
      runId: r.run_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      total: r.total,
      sent: r.sent,
      failed: r.failed,
      pending: r.pending,
    })));
  } catch (err) {
    console.error('logs runs:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/reply-analysis', getFeedbackSnapshot);

async function sendRunInspect(req, res) {
  const db = getDb();
  const tenantId = getTenantId(req);
  const cidRaw = req.params.campaignId != null && String(req.params.campaignId).trim() !== ''
    ? req.params.campaignId
    : req.query.campaignId;
  const cid = cidRaw != null ? String(cidRaw).trim() : '';
  const rid = req.query.runId;
  if (!cid || !isValidUUID(cid)) {
    return res.status(400).json({ error: 'campaignId inválido' });
  }
  if (rid === undefined || rid === null || String(rid).trim() === '') {
    return res.status(400).json({ error: 'runId obrigatório' });
  }
  const rs = String(rid);

  const statsRows = await db.execute(sql`
    SELECT
      status,
      COUNT(*)::int AS n
    FROM send_logs
    WHERE tenant_id = ${tenantId}
      AND campaign_id = ${cid}::uuid
      AND send_job_id = ${rs}
    GROUP BY status
  `);

  const totalRow = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM send_logs
    WHERE tenant_id = ${tenantId} AND campaign_id = ${cid}::uuid AND send_job_id = ${rs}
  `);

  const sentAtRow = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM send_logs
    WHERE tenant_id = ${tenantId} AND campaign_id = ${cid}::uuid AND send_job_id = ${rs}
      AND sent_at IS NOT NULL
  `);

  const sample = await db.select({
    id: sendLogs.id,
    sendJobId: sendLogs.sendJobId,
    status: sendLogs.status,
    phone: sendLogs.phone,
    name: sendLogs.name,
    sentAt: sendLogs.sentAt,
    error: sendLogs.error,
  }).from(sendLogs)
    .where(and(eq(sendLogs.tenantId, tenantId), eq(sendLogs.campaignId, cid), eq(sendLogs.sendJobId, rs)))
    .limit(8)
    .orderBy(asc(sendLogs.createdAt));

  res.json({
    campaignId: cid,
    runId: rs,
    totalLogsEsteJob: totalRow.rows[0]?.n ?? 0,
    sentStatusCount: statsRows.rows.find((r) => r.status === 'sent')?.n ?? 0,
    comSentAt: sentAtRow.rows[0]?.n ?? 0,
    porStatus: statsRows.rows,
    amostra: sample.map(normalizeDoc),
  });
}

router.get('/run-inspect', sendRunInspect);
router.get('/:campaignId/inspect-run', sendRunInspect);
router.get('/:campaignId/analysis', getFeedbackSnapshot);

router.get('/:campaignId/runs', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const { campaignId } = req.params;
    if (!isValidUUID(campaignId)) {
      return res.status(400).json({ error: 'campaignId inválido' });
    }
    const rows = await db.execute(sql`
      SELECT
        COALESCE(send_job_id, 'legacy-' || id::text) AS run_id,
        MIN(created_at) AS started_at,
        MAX(updated_at) AS finished_at,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
      FROM send_logs
      WHERE tenant_id = ${tenantId} AND campaign_id = ${campaignId}::uuid
      GROUP BY run_id
      ORDER BY started_at DESC
    `);
    res.json(rows.rows.map((r) => ({
      runId: r.run_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      total: r.total,
      sent: r.sent,
      failed: r.failed,
      pending: r.pending,
    })));
  } catch (err) {
    console.error('logs campaign runs:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:campaignId', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const { campaignId } = req.params;
    if (!isValidUUID(campaignId)) {
      return res.status(400).json({ error: 'campaignId inválido' });
    }
    const { runId } = req.query;
    const conditions = [eq(sendLogs.tenantId, tenantId), eq(sendLogs.campaignId, campaignId)];
    if (runId) {
      conditions.push(eq(sendLogs.sendJobId, String(runId)));
    }
    const rows = await db.select().from(sendLogs)
      .where(and(...conditions))
      .orderBy(runId ? asc(sendLogs.createdAt) : desc(sendLogs.updatedAt));
    res.json(rows.map(normalizeDoc));
  } catch (err) {
    console.error('logs get campaign:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/retry/:logId', requireWAConnected, async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, req.params.campaignId), eq(campaigns.tenantId, tenantId)));
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    const [log] = await db.select().from(sendLogs)
      .where(and(
        eq(sendLogs.id, req.params.logId),
        eq(sendLogs.campaignId, req.params.campaignId),
        eq(sendLogs.tenantId, tenantId),
        eq(sendLogs.status, 'failed'),
      ));
    if (!log) {
      return res.status(404).json({ error: 'Registro não encontrado ou já não está com falha' });
    }

    await db.update(sendLogs)
      .set({ status: 'pending', error: null, sentAt: null, updatedAt: new Date() })
      .where(eq(sendLogs.id, log.id));

    const { hourStart = 8, hourEnd = 20, ignoreHours = false } = req.body;
    const result = await requeueFailuresForRun(
      tenantId,
      campaign,
      log.sendJobId ? String(log.sendJobId) : null,
      [log],
      { hourStart, hourEnd, ignoreHours },
    );

    res.json({ jobId: result.jobId, retrying: 1, reusedJob: result.reusedJob, runId: result.runId || log.sendJobId || null });
  } catch (err) {
    console.error('logs retry single:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/retry-failed', requireWAConnected, async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, req.params.campaignId), eq(campaigns.tenantId, tenantId)));
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    const runId = req.body && req.body.runId ? String(req.body.runId) : null;
    const conditions = [
      eq(sendLogs.tenantId, tenantId),
      eq(sendLogs.campaignId, req.params.campaignId),
      eq(sendLogs.status, 'failed'),
    ];
    if (runId) conditions.push(eq(sendLogs.sendJobId, runId));

    const failedRows = await db.select().from(sendLogs).where(and(...conditions));
    if (!failedRows.length) {
      return res.json({ message: 'Nenhum registro com falha para reenviar', retrying: 0 });
    }

    await db.update(sendLogs)
      .set({ status: 'pending', error: null, sentAt: null, updatedAt: new Date() })
      .where(and(...conditions));

    const { hourStart = 8, hourEnd = 20, ignoreHours = false } = req.body;
    const result = await requeueFailuresForRun(
      tenantId,
      campaign,
      runId,
      failedRows,
      { hourStart, hourEnd, ignoreHours },
    );

    res.json({
      jobId: result.jobId,
      retrying: failedRows.length,
      runId: result.runId || runId || null,
      reusedJob: result.reusedJob,
    });
  } catch (err) {
    console.error('logs retry-failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:campaignId/analyze-replies', requireWAConnected, async (req, res) => {
  try {

    const db = getDb();
    const tenantId = getTenantId(req);
    const cidParam = req.params.campaignId;
    if (!isValidUUID(cidParam)) {
      return res.status(400).json({ error: 'campaignId inválido' });
    }

    const [campaign] = await db.select({ id: campaigns.id, name: campaigns.name })
      .from(campaigns)
      .where(and(eq(campaigns.id, cidParam), eq(campaigns.tenantId, tenantId)));
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    const runId = req.body && req.body.runId ? String(req.body.runId) : null;

    const sentLogs = await findSentLogsForAnalysis(db, tenantId, cidParam, runId);

    if (!sentLogs.length) {
      const emptyBody = {
        campaignId: cidParam,
        campaignName: campaign.name,
        runId: runId || null,
        totals: { sentContacts: 0, respondedContacts: 0, positive: 0, negative: 0, neutral: 0, noReply: 0 },
        contacts: [],
        generatedAt: new Date(),
        diagnostic: {
          message: 'Nenhum log "enviado" encontrado para este par campaignId + sendJobId (= runId do job).',
          ...(runId ? { runInspectUrl: `/api/logs/${encodeURIComponent(cidParam)}/inspect-run?runId=${encodeURIComponent(runId)}` } : {}),
        },
      };
      return res.json(emptyBody);
    }

    const contacts = [];
    let positive = 0, negative = 0, neutral = 0, noReply = 0, respondedContacts = 0;

    const sentTimestampsMs = sentLogs.map((row) =>
      row.outboundAt != null && Number.isFinite(Number(row.outboundAt))
        ? Number(row.outboundAt)
        : new Date(row.sentAt || row.updatedAt || row.createdAt || 0).getTime(),
    );

    let chatIndex = new Map();
    try {
      chatIndex = await whatsapp.buildTimestampToChatIndex(tenantId, sentTimestampsMs);
    } catch (_) {}

    for (const row of sentLogs) {
      const phone = normalizePhoneForWhatsApp(row.phone) || row.phone;
      const outboundRef = {
        messageId: row.outboundMessageId != null && String(row.outboundMessageId).trim() !== ''
          ? String(row.outboundMessageId)
          : null,
        timestamp: row.outboundAt != null && Number.isFinite(Number(row.outboundAt))
          ? Number(row.outboundAt)
          : new Date(row.sentAt || row.updatedAt || row.createdAt || 0).getTime(),
      };

      const indexedChat = chatIndex.get(outboundRef.timestamp);
      let parsedReplies = [];

      if (indexedChat) {
        try {
          const rawReplies = await whatsapp.fetchRepliesFromChat(indexedChat, outboundRef, 12);
          parsedReplies = rawReplies.map((r) => ({
            text: r.body, timestamp: new Date(r.timestamp),
            sentiment: classifyReply(r.body), isGreeting: isGreetingReply(r.body),
          })).filter((r) => r.text);
        } catch (_) {}
      }

      if (!parsedReplies.length) {
        try {
          const windowRes = await whatsapp.analyzeReplyWindow(tenantId, phone, outboundRef, { maxReplies: 12, knownChatId: row.chatId || null });
          if (windowRes.replyCount > 0) {
            parsedReplies = windowRes.analyzedReplies.map((r) => ({
              text: r.body, timestamp: new Date(r.timestamp),
              sentiment: r.classification, isGreeting: r.greetingOnly,
            }));
          }
        } catch (_) {}
      }

      if (!parsedReplies.length) {
        const anchor = row.sentAt || row.updatedAt || row.createdAt || new Date(0);
        let sinceMs = new Date(anchor).getTime();
        if (row.sentAt) sinceMs -= 8000;
        const since = new Date(Math.max(0, sinceMs));
        try {
          const replies = await whatsapp.listIncomingMessagesSince(tenantId, phone, since);
          parsedReplies = replies.map((r) => ({
            text: r.body, timestamp: new Date(r.timestamp),
            sentiment: classifyReply(r.body), isGreeting: isGreetingReply(r.body),
          }));
        } catch (_) {}
      }

      let finalSentiment = 'no_reply';
      if (parsedReplies.length > 0) {
        respondedContacts++;
        const latestClassified = [...parsedReplies].reverse().find((r) => !r.isGreeting && r.sentiment !== 'neutral');
        finalSentiment = latestClassified ? latestClassified.sentiment : 'neutral';
      }

      if (finalSentiment === 'positive') positive++;
      else if (finalSentiment === 'negative') negative++;
      else if (finalSentiment === 'neutral') neutral++;
      else noReply++;

      contacts.push({ name: row.name, phone, sentAt: row.sentAt, replies: parsedReplies, totalReplies: parsedReplies.length, finalSentiment });
    }

    const responseBody = {
      campaignId: cidParam,
      campaignName: campaign.name,
      runId: runId || null,
      totals: { sentContacts: sentLogs.length, respondedContacts, positive, negative, neutral, noReply },
      contacts,
      generatedAt: new Date(),
    };

    await db.insert(feedbackAnalyses).values({
      tenantId,
      campaignId: cidParam,
      runId: runId || '__all__',
      payload: responseBody,
    }).onConflictDoUpdate({
      target: [feedbackAnalyses.tenantId, feedbackAnalyses.campaignId, feedbackAnalyses.runId],
      set: { payload: responseBody, updatedAt: new Date() },
    });

    res.json(responseBody);
  } catch (err) {
    console.error('analyze-replies:', err);
    res.status(500).json({ error: err.message });
  }
});

async function findSentLogsForAnalysis(db, tenantId, campaignId, runId) {
  const baseConditions = [eq(sendLogs.tenantId, tenantId), eq(sendLogs.campaignId, campaignId)];

  if (!runId) {
    return db.select().from(sendLogs)
      .where(and(...baseConditions, eq(sendLogs.status, 'sent')))
      .orderBy(asc(sendLogs.createdAt));
  }

  let list = await db.select().from(sendLogs)
    .where(and(...baseConditions, eq(sendLogs.sendJobId, runId), eq(sendLogs.status, 'sent')))
    .orderBy(asc(sendLogs.createdAt));

  if (!list.length) {
    list = await db.select().from(sendLogs)
      .where(and(...baseConditions, eq(sendLogs.sendJobId, runId), isNotNull(sendLogs.sentAt)))
      .orderBy(asc(sendLogs.createdAt));
  }

  if (!list.length) {
    try {
      const merged = await fetchMergedLogsForJob(runId);
      if (merged && merged.campaignId && merged.campaignId === campaignId) {
        list = merged.logs.filter((l) => l.status === 'sent');
      }
    } catch (_) {}
  }

  return list;
}

module.exports = router;
