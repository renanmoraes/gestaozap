const router = require('express').Router();
const { eq, and, desc, sql } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { contracts, plans, paymentRecords, sendLogs } = require('../db/schema');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

/**
 * GET /api/billing/summary
 * Plano atual, data de vencimento, mensagens usadas no mês vs incluídas.
 */
router.get('/summary', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);

    // Contrato ativo com dados do plano
    const [activeContract] = await db.execute(sql`
      SELECT
        c.id AS contract_id,
        c.status,
        c.expires_at,
        c.auto_renew,
        c.started_at,
        p.id AS plan_id,
        p.name AS plan_name,
        p.slug AS plan_slug,
        p.price_brl,
        p.messages_per_month
      FROM contracts c
      JOIN plans p ON p.id = c.plan_id
      WHERE c.tenant_id = ${tenantId}
        AND c.status = 'active'
      ORDER BY c.expires_at DESC
      LIMIT 1
    `).then((r) => r.rows);

    // Mensagens enviadas no mês corrente (conta de send_logs com status = 'sent')
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const [usageRow] = await db.execute(sql`
      SELECT COUNT(*)::int AS messages_sent
      FROM send_logs
      WHERE tenant_id = ${tenantId}
        AND status = 'sent'
        AND to_char(sent_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = ${currentMonth}
    `).then((r) => r.rows);

    const messagesSent = usageRow?.messages_sent ?? 0;
    const messagesIncluded = activeContract?.messages_per_month ?? null;
    const messagesExtra = messagesIncluded !== null ? Math.max(0, messagesSent - messagesIncluded) : 0;

    // Dias até o vencimento (null = vitalício, -1 = sem contrato)
    let daysUntilExpiry = null;
    let isLifetime = false;
    if (activeContract) {
      if (!activeContract.expires_at) {
        isLifetime = true;   // contrato vitalício — nunca expira
        daysUntilExpiry = null;
      } else {
        const diffMs = new Date(activeContract.expires_at) - new Date();
        daysUntilExpiry = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }
    }

    res.json({
      contract: activeContract || null,
      isLifetime,
      usage: {
        currentMonth,
        messagesSent,
        messagesIncluded,
        messagesExtra,
        percentUsed: messagesIncluded ? Math.round((messagesSent / messagesIncluded) * 100) : null,
      },
      daysUntilExpiry,
    });
  } catch (err) {
    console.error('billing summary:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/billing/history?page=1&limit=10
 * Histórico de pagamentos paginado.
 */
router.get('/history', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const [totalRow] = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM payment_records WHERE tenant_id = ${tenantId}
    `).then((r) => r.rows);

    const rows = await db.execute(sql`
      SELECT * FROM payment_records
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `).then((r) => r.rows);

    res.json({
      total: totalRow?.total ?? 0,
      page,
      limit,
      records: rows,
    });
  } catch (err) {
    console.error('billing history:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/billing/usage?months=3
 * Uso de mensagens por mês (para gráfico).
 */
router.get('/usage', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const months = Math.min(12, Math.max(1, parseInt(req.query.months) || 3));

    const rows = await db.execute(sql`
      SELECT
        to_char(sent_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
        COUNT(*)::int AS messages_sent
      FROM send_logs
      WHERE tenant_id = ${tenantId}
        AND status = 'sent'
        AND sent_at >= now() - (${months} || ' months')::interval
      GROUP BY month
      ORDER BY month ASC
    `).then((r) => r.rows);

    res.json({ months: rows });
  } catch (err) {
    console.error('billing usage:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/billing/usage/daily?month=2026-06
 * Uso diário de mensagens no mês (para gráfico detalhado).
 */
router.get('/usage/daily', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const rows = await db.execute(sql`
      SELECT
        to_char(sent_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS messages_sent
      FROM send_logs
      WHERE tenant_id = ${tenantId}
        AND status = 'sent'
        AND to_char(sent_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = ${month}
      GROUP BY day
      ORDER BY day ASC
    `).then((r) => r.rows);

    res.json({ month, days: rows });
  } catch (err) {
    console.error('billing usage daily:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
