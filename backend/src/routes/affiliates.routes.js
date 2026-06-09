const router = require('express').Router();
const { randomBytes } = require('crypto');
const { eq, and, sql, desc } = require('drizzle-orm');
const { getDb } = require('../db');
const { affiliates, affiliateReferrals, tenants, contracts, plans, whatsappSessions } = require('../db/schema');
const { registerProcessorForTenant } = require('../services/queue.service');
const { getIo } = require('../config/registry');

/* ─── Helpers ────────────────────────────────────────────── */

function generateCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0,O,1,I
  return Array.from(
    { length: len },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join('');
}

function calcValues(priceBrl, discountPct, commissionPct) {
  const original = Number(priceBrl) || 0;
  const discount = Math.round(original * (Number(discountPct) / 100) * 100) / 100;
  const final    = Math.round((original - discount) * 100) / 100;
  const commission = Math.round(final * (Number(commissionPct) / 100) * 100) / 100;
  return { original, discount, final, commission };
}

/* ─── Admin: CRUD afiliados ─────────────────────────────── */

// GET /api/admin/affiliates — lista com total de ganhos
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT
        a.*,
        COUNT(r.id)::int              AS total_referrals,
        COALESCE(SUM(r.commission_brl) FILTER (WHERE r.status != 'paid'), 0) AS pending_brl,
        COALESCE(SUM(r.commission_brl) FILTER (WHERE r.status = 'paid'), 0)  AS paid_brl,
        COALESCE(SUM(r.commission_brl), 0)                                   AS total_earned_brl,
        COALESCE(SUM(r.discount_brl), 0)                                     AS total_discounts_brl
      FROM affiliates a
      LEFT JOIN affiliate_referrals r ON r.affiliate_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    console.error('affiliates list:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/affiliates — criar afiliado
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { name, email, code, commissionPct, discountPct, notes } = req.body;

    if (!name) return res.status(400).json({ error: 'name é obrigatório' });

    const finalCode = (code || '').trim().toUpperCase() || generateCode();

    const [affiliate] = await db.insert(affiliates).values({
      name,
      email: email || null,
      code: finalCode,
      commissionPct: String(commissionPct ?? 0),
      discountPct: String(discountPct ?? 0),
      notes: notes || null,
      active: true,
    }).returning();

    res.status(201).json(affiliate);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Código já existe — escolha outro' });
    console.error('affiliates post:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/affiliates/:id — editar
router.patch('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { name, email, commissionPct, discountPct, active, notes } = req.body;
    const update = { updatedAt: new Date() };
    if (name          !== undefined) update.name          = name;
    if (email         !== undefined) update.email         = email;
    if (commissionPct !== undefined) update.commissionPct = String(commissionPct);
    if (discountPct   !== undefined) update.discountPct   = String(discountPct);
    if (active        !== undefined) update.active        = Boolean(active);
    if (notes         !== undefined) update.notes         = notes;

    const [affiliate] = await db.update(affiliates).set(update)
      .where(eq(affiliates.id, req.params.id)).returning();
    if (!affiliate) return res.status(404).json({ error: 'Afiliado não encontrado' });
    res.json(affiliate);
  } catch (err) {
    console.error('affiliates patch:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/affiliates/:id/referrals — histórico de referências
router.get('/:id/referrals', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT
        r.*,
        t.name AS tenant_name,
        t.slug AS tenant_slug
      FROM affiliate_referrals r
      JOIN tenants t ON t.id = r.tenant_id
      WHERE r.affiliate_id = ${req.params.id}
      ORDER BY r.created_at DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/affiliates/:id/pay — marca comissões como pagas
router.post('/:id/pay', async (req, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const result = await db.execute(sql`
      UPDATE affiliate_referrals
      SET status = 'paid', paid_at = ${now}
      WHERE affiliate_id = ${req.params.id} AND status = 'confirmed'
      RETURNING id
    `);
    res.json({ paid: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Público: validar código + info do afiliado ──────── */

// GET /api/affiliates/validate/:code — usado pelo frontend no link de afiliado
router.get('/validate/:code', async (req, res) => {
  try {
    const db = getDb();
    const [affiliate] = await db.select({
      id:            affiliates.id,
      name:          affiliates.name,
      code:          affiliates.code,
      commissionPct: affiliates.commissionPct,
      discountPct:   affiliates.discountPct,
    }).from(affiliates)
      .where(and(eq(affiliates.code, req.params.code.toUpperCase()), eq(affiliates.active, true)));

    if (!affiliate) return res.status(404).json({ error: 'Código de afiliado inválido ou inativo' });

    const availPlans = await db.select().from(plans).where(eq(plans.active, true));

    res.json({
      affiliate: {
        name: affiliate.name,
        code: affiliate.code,
        discountPct: affiliate.discountPct,
      },
      plans: availPlans.map((p) => {
        const { discount, final } = calcValues(p.priceBrl, affiliate.discountPct, affiliate.commissionPct);
        return {
          slug: p.slug,
          name: p.name,
          originalPriceBrl: p.priceBrl,
          discountBrl: discount,
          finalPriceBrl: final,
          messagesPerMonth: p.messagesPerMonth,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Público: auto-cadastro aposentado (Fase 1) ──────── */

// POST /api/affiliates/register — DESCONTINUADO: use POST /api/signup
// (pré-cadastro com aprovação do admin; não cria trial sem aprovação).
router.post('/register', (req, res) => res.status(410).json({ error: 'Endpoint descontinuado. Use /api/signup.' }));

module.exports = router;
