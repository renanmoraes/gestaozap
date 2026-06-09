const router = require('express').Router();
const { randomBytes } = require('crypto');
const { eq, and, sql, desc } = require('drizzle-orm');
const { getDb } = require('../db');
const { affiliates, affiliateReferrals, plans } = require('../db/schema');
const { assertTenantLinkable, fillAffiliateFromTenant } = require('../services/affiliate.service');
const { setAffiliateRefCookie } = require('../utils/cookie.util');
const { sendAffiliateWelcome } = require('../services/affiliate-email.service');
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
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        co.company_id,
        COUNT(r.id)::int              AS total_referrals,
        COALESCE(SUM(r.commission_brl) FILTER (WHERE r.status != 'paid'), 0) AS pending_brl,
        COALESCE(SUM(r.commission_brl) FILTER (WHERE r.status = 'paid'), 0)  AS paid_brl,
        COALESCE(SUM(r.commission_brl), 0)                                   AS total_earned_brl,
        COALESCE(SUM(r.discount_brl), 0)                                     AS total_discounts_brl
      FROM affiliates a
      LEFT JOIN tenants t ON t.id = a.tenant_id
      LEFT JOIN companies co ON co.tenant_id = t.id
      LEFT JOIN affiliate_referrals r ON r.affiliate_id = a.id
      GROUP BY a.id, t.name, t.slug, co.company_id
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
    const {
      name, email, code, commissionPct, discountPct, notes, tenantId,
    } = req.body;

    if (!name && !tenantId) return res.status(400).json({ error: 'name é obrigatório' });

    const finalCode = (code || '').trim().toUpperCase() || generateCode();
    let resolvedName = name;
    let resolvedEmail = email || null;

    if (tenantId) {
      await assertTenantLinkable(db, tenantId);
      const filled = await fillAffiliateFromTenant(db, tenantId, { name: resolvedName, email: resolvedEmail });
      resolvedName = resolvedName || filled.name;
      resolvedEmail = resolvedEmail || filled.email || null;
    }

    if (!resolvedName) return res.status(400).json({ error: 'name é obrigatório' });

    const [affiliate] = await db.insert(affiliates).values({
      tenantId: tenantId || null,
      name: resolvedName,
      email: resolvedEmail,
      code: finalCode,
      commissionPct: String(commissionPct ?? 0),
      discountPct: String(discountPct ?? 0),
      notes: notes || null,
      active: true,
    }).returning();

    if (affiliate.email) {
      sendAffiliateWelcome({
        to: affiliate.email,
        name: affiliate.name,
        code: affiliate.code,
        commissionPct: affiliate.commissionPct,
        discountPct: affiliate.discountPct,
      }).catch((err) => console.warn('[affiliates] email welcome:', err.message));
    }

    res.status(201).json(affiliate);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Código já existe — escolha outro' });
    console.error('affiliates post:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/affiliates/:id — editar
router.patch('/:id', async (req, res) => {
  try {
    const db = getDb();
    const {
      name, email, commissionPct, discountPct, active, notes, tenantId,
    } = req.body;
    const update = { updatedAt: new Date() };
    if (name          !== undefined) update.name          = name;
    if (email         !== undefined) update.email         = email;
    if (commissionPct !== undefined) update.commissionPct = String(commissionPct);
    if (discountPct   !== undefined) update.discountPct   = String(discountPct);
    if (active        !== undefined) update.active        = Boolean(active);
    if (notes         !== undefined) update.notes         = notes;

    if (tenantId !== undefined) {
      if (tenantId === null || tenantId === '') {
        update.tenantId = null;
      } else {
        await assertTenantLinkable(db, tenantId, req.params.id);
        update.tenantId = tenantId;
        const filled = await fillAffiliateFromTenant(db, tenantId, {
          name: update.name,
          email: update.email,
        });
        if (!update.name && filled.name) update.name = filled.name;
        if (!update.email && filled.email) update.email = filled.email;
      }
    }

    const [affiliate] = await db.update(affiliates).set(update)
      .where(eq(affiliates.id, req.params.id)).returning();
    if (!affiliate) return res.status(404).json({ error: 'Afiliado não encontrado' });
    res.json(affiliate);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
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

/* ─── Público: capturar e validar código de afiliado ──────── */

// GET /api/affiliates/capture/:code — grava cookie httpOnly para travar o código no signup
router.get('/capture/:code', async (req, res) => {
  try {
    const db = getDb();
    const code = String(req.params.code || '').trim().toUpperCase();
    const [affiliate] = await db.select({ code: affiliates.code }).from(affiliates)
      .where(and(eq(affiliates.code, code), eq(affiliates.active, true)));

    if (!affiliate) return res.status(404).json({ error: 'Código de afiliado inválido ou inativo' });

    setAffiliateRefCookie(res, affiliate.code);
    res.json({ ok: true, code: affiliate.code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
