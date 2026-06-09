const router = require('express').Router();
const { eq, and, sql } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { computeOverage } = require('../utils/usage.util');
const { getMonthKeyBr } = require('../utils/timezone.util');
const { countActiveDispatches } = require('../services/dispatch.service');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const month = getMonthKeyBr();

    const [contractRow] = await db.execute(sql`
      SELECT
        p.slug AS plan_slug,
        p.name AS plan_name,
        p.messages_per_month,
        p.overage_price_brl,
        p.max_concurrent_sends
      FROM contracts c
      JOIN plans p ON p.id = c.plan_id
      WHERE c.tenant_id = ${tenantId}
        AND c.status = 'active'
      ORDER BY c.expires_at DESC NULLS FIRST
      LIMIT 1
    `).then((r) => r.rows);

    if (!contractRow) {
      return res.json({
        month,
        hasContract: false,
        used: 0,
        quota: null,
        unlimited: false,
        overage: 0,
        projectedOverageCostBrl: 0,
        concurrency: { inUse: 0, allowed: 1 },
      });
    }

    const [usageRow] = await db.execute(sql`
      SELECT COUNT(*)::int AS messages_sent
      FROM send_logs
      WHERE tenant_id = ${tenantId}
        AND status = 'sent'
        AND to_char(sent_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = ${month}
    `).then((r) => r.rows);

    const used = usageRow?.messages_sent ?? 0;
    const quota = contractRow.messages_per_month ?? null;
    const { overage, costBrl } = computeOverage({
      used,
      quota,
      pricePerMsg: contractRow.overage_price_brl,
    });
    const inUse = await countActiveDispatches(tenantId);

    res.json({
      month,
      hasContract: true,
      plan: { slug: contractRow.plan_slug, name: contractRow.plan_name },
      used,
      quota,
      unlimited: quota == null,
      overage,
      projectedOverageCostBrl: costBrl,
      overagePriceBrl: contractRow.overage_price_brl != null
        ? Number(contractRow.overage_price_brl)
        : null,
      concurrency: {
        inUse,
        allowed: Number(contractRow.max_concurrent_sends) || 1,
      },
    });
  } catch (err) {
    console.error('usage get:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
