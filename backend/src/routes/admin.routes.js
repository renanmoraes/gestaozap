const router = require('express').Router();
const { eq, and, lte, sql, desc } = require('drizzle-orm');
const { getDb } = require('../db');
const { getMonthKeyBr } = require('../utils/timezone.util');
const {
  tenants,
  whatsappSessions,
  platformConfig,
  plans,
  contracts,
  paymentRecords,
  sendLogs,
  affiliates,
} = require('../db/schema');
const { assertTenantLinkable, fillAffiliateFromTenant } = require('../services/affiliate.service');
const { sendAffiliateWelcome } = require('../services/affiliate-email.service');
const { refreshConfig } = require('../config/platform');
const { registerProcessorForTenant } = require('../services/queue.service');
const { getIo } = require('../config/registry');
const { sendSignupApproved, sendSignupRejected } = require('../services/signup-email.service');
const { replaceActiveContract } = require('../services/contract.service');
const {
  listFeatures,
  listTenantFeatures,
  enableFeatureForTenant,
  disableFeatureForTenant,
  createOrUpdateFeature,
  listPendingRequests,
} = require('../services/feature.service');

/* ─── Tenants (Clientes) ─────────────────────────────────── */

router.get('/tenants', async (req, res) => {
  try {
    const db = getDb();
    const { status } = req.query;
    const whereClause = status ? sql`WHERE t.approval_status = ${status}` : sql``;
    const rows = await db.execute(sql`
      SELECT
        t.id, t.slug, t.name, t.registered_phone, t.active,
        t.approval_status, t.document, t.document_type, t.affiliate_code,
        t.terms_accepted_at, t.created_at, t.updated_at,
        ws.status AS wa_status,
        c.status AS contract_status,
        c.expires_at AS contract_expires_at,
        c.is_trial AS contract_is_trial,
        p.name AS plan_name,
        co.company_id AS company_id
      FROM tenants t
      LEFT JOIN whatsapp_sessions ws ON ws.tenant_id = t.id
      LEFT JOIN LATERAL (
        SELECT c2.*
        FROM contracts c2
        WHERE c2.tenant_id = t.id AND c2.status = 'active'
        ORDER BY c2.created_at DESC
        LIMIT 1
      ) c ON true
      LEFT JOIN plans p ON p.id = c.plan_id
      LEFT JOIN companies co ON co.tenant_id = t.id
      ${whereClause}
      ORDER BY t.created_at DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    console.error('admin get tenants:', err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/admin/tenants/search?q= — autocomplete para vincular afiliado */
router.get('/tenants/search', async (req, res) => {
  try {
    const db = getDb();
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    const like = `%${q}%`;
    const rows = await db.execute(sql`
      SELECT
        t.id, t.name, t.slug, t.approval_status, t.active,
        co.company_id,
        EXISTS(SELECT 1 FROM affiliates a WHERE a.tenant_id = t.id) AS has_affiliate
      FROM tenants t
      LEFT JOIN companies co ON co.tenant_id = t.id
      WHERE t.approval_status = 'approved' AND t.active = true
        AND (
          t.name ILIKE ${like}
          OR t.slug ILIKE ${like}
          OR co.company_id::text ILIKE ${like}
        )
      ORDER BY t.name
      LIMIT 20
    `);
    res.json(rows.rows);
  } catch (err) {
    console.error('admin tenants search:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/tenants/:id/make-affiliate — atalho para tornar cliente afiliado */
router.post('/tenants/:id/make-affiliate', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;
    const { commissionPct = 20, discountPct = 10, code } = req.body || {};

    const tenant = await assertTenantLinkable(db, tenantId);

    const [existing] = await db.select().from(affiliates)
      .where(eq(affiliates.tenantId, tenantId));
    if (existing) {
      return res.json({ ok: true, affiliate: existing, created: false });
    }

    const filled = await fillAffiliateFromTenant(db, tenantId, {});
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const finalCode = (code || '').trim().toUpperCase() || Array.from(
      { length: 6 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join('');

    const [affiliate] = await db.insert(affiliates).values({
      tenantId,
      name: filled.name || tenant.name,
      email: filled.email || null,
      code: finalCode,
      commissionPct: String(commissionPct),
      discountPct: String(discountPct),
      active: true,
    }).returning();

    if (affiliate.email) {
      sendAffiliateWelcome({
        to: affiliate.email,
        name: affiliate.name,
        code: affiliate.code,
        commissionPct: affiliate.commissionPct,
        discountPct: affiliate.discountPct,
      }).catch((err) => console.warn('[admin] affiliate welcome email:', err.message));
    }

    res.status(201).json({ ok: true, affiliate, created: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Código já existe' });
    console.error('admin make-affiliate:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Aprovação de pré-cadastros (Fase 1) ───────────────── */

// POST /api/admin/tenants/:id/approve  body: { slug?, planSlug?, lifetime?, trialDays?, expiryDays? }
router.post('/tenants/:id/approve', async (req, res) => {
  try {
    const db = getDb();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    if (tenant.approvalStatus !== 'pending') return res.status(409).json({ error: 'Tenant não está pendente' });

    const lifetime = Boolean(req.body?.lifetime);
    const cfg = await db.execute(sql`SELECT value FROM platform_config WHERE key='trial_days' LIMIT 1`);
    const defaultTrialDays = Number(cfg.rows?.[0]?.value) || 7;
    const trialDays = lifetime ? 0 : (Number(req.body?.trialDays) || Number(req.body?.expiryDays) || defaultTrialDays);

    let plan;
    if (req.body?.planSlug) {
      [plan] = await db.select().from(plans).where(eq(plans.slug, req.body.planSlug));
    }
    if (!plan) {
      [plan] = await db.select().from(plans).where(eq(plans.active, true)).orderBy(plans.priceBrl).limit(1);
    }
    if (!plan) return res.status(400).json({ error: 'Nenhum plano ativo configurado' });

    const now = new Date();
    const newSlug = (req.body?.slug || tenant.slug).toLowerCase();
    let contractResult;

    await db.transaction(async (tx) => {
      await tx.update(tenants).set({
        approvalStatus: 'approved', active: true, slug: newSlug, updatedAt: now,
      }).where(eq(tenants.id, tenant.id));

      contractResult = await replaceActiveContract(tx, tenant.id, {
        planId: plan.id,
        lifetime,
        trialDays,
        isTrial: !lifetime,
        now,
      });
    });

    const expiresAt = contractResult.expiresAt;

    const io = getIo();
    if (io) registerProcessorForTenant(tenant.id, io);

    const ownerEmail = await db.execute(sql`
      SELECT u.email FROM users u
      JOIN user_company uc ON uc.user_id = u.id
      JOIN companies c ON c.id = uc.company_id
      WHERE c.tenant_id = ${tenant.id} LIMIT 1`);
    if (ownerEmail.rows?.[0]?.email) {
      sendSignupApproved(ownerEmail.rows[0].email, tenant.name, newSlug, lifetime ? 0 : trialDays).catch(() => {});
    }

    res.json({ ok: true, slug: newSlug, lifetime, trialDays: lifetime ? null : trialDays, expiresAt });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug já em uso' });
    console.error('[admin approve]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tenants/:id/reject
router.post('/tenants/:id/reject', async (req, res) => {
  try {
    const db = getDb();
    const [tenant] = await db.update(tenants)
      .set({ approvalStatus: 'rejected', active: false, updatedAt: new Date() })
      .where(eq(tenants.id, req.params.id)).returning();
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });

    const ownerEmail = await db.execute(sql`
      SELECT u.email FROM users u
      JOIN user_company uc ON uc.user_id = u.id
      JOIN companies c ON c.id = uc.company_id
      WHERE c.tenant_id = ${tenant.id} LIMIT 1`);
    if (ownerEmail.rows?.[0]?.email) {
      sendSignupRejected(ownerEmail.rows[0].email, tenant.name).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[admin reject]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/tenants', async (req, res) => {
  try {
    const db = getDb();
    const { slug, name, registeredPhone, planSlug, expiryDays = 30, contactEmail } = req.body;

    if (!slug || !name || !registeredPhone || !contactEmail) {
      return res.status(400).json({ error: 'slug, name, registeredPhone e contactEmail são obrigatórios' });
    }

    if (!contactEmail.includes('@')) {
      return res.status(400).json({ error: 'contactEmail inválido' });
    }

    const [tenant] = await db.insert(tenants).values({
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name,
      registeredPhone,
      active: true,
    }).returning();

    await db.insert(whatsappSessions).values({
      tenantId: tenant.id,
      status: 'disconnected',
    });

    const { getIo } = require('../config/registry');
    const io = getIo();
    if (io) registerProcessorForTenant(tenant.id, io);

    if (planSlug) {
      const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug));
      if (plan) {
        const now = new Date();
        const expiresAt = expiryDays > 0
          ? new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000)
          : null;
        await db.insert(contracts).values({
          tenantId: tenant.id,
          planId: plan.id,
          status: 'active',
          startedAt: now,
          expiresAt,
        });
      }
    }

    const { provisionClientAccess } = require('../services/auth.service');
    const { sendWelcomeEmail } = require('../services/welcome-email.service');

    const provision = await provisionClientAccess({
      tenantId: tenant.id,
      tenantName: name,
      contactEmail,
    });

    let emailResult = { sent: false };
    try {
      emailResult = await sendWelcomeEmail({
        to: contactEmail,
        companyId: provision.companyId,
        email: provision.email,
        tempPassword: provision.tempPassword,
        tenantName: name,
        slug: tenant.slug,
      });
    } catch (emailErr) {
      console.error('welcome email failed:', emailErr.message);
      emailResult = { sent: false, error: emailErr.message };
    }

    res.status(201).json({
      ...tenant,
      companyId: provision.companyId,
      contactEmail: provision.email,
      emailSent: emailResult.sent,
      ...(process.env.NODE_ENV !== 'production' && !emailResult.sent
        ? { devCredentials: { companyId: provision.companyId, email: provision.email, password: provision.tempPassword } }
        : {}),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Slug ou email já existe' });
    }
    console.error('admin post tenant:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/tenants/:id', async (req, res) => {
  try {
    const db = getDb();
    const { name, registeredPhone, active, slug, planSlug, expiryDays, lifetime } = req.body;

    const update = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (registeredPhone !== undefined) update.registeredPhone = String(registeredPhone).replace(/\D/g, '');
    if (active !== undefined) update.active = Boolean(active);
    if (slug !== undefined) update.slug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const [tenant] = await db.update(tenants)
      .set(update)
      .where(eq(tenants.id, req.params.id))
      .returning();

    if (!tenant) return res.status(404).json({ error: 'Cliente não encontrado' });

    const contractUpdateRequested = planSlug != null || lifetime != null || expiryDays != null;
    if (contractUpdateRequested) {
      const planSlugResolved = planSlug || 'starter';
      const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlugResolved));
      if (plan) {
        const now = new Date();
        await replaceActiveContract(db, tenant.id, {
          planId: plan.id,
          lifetime: Boolean(lifetime),
          expiryDays,
          isTrial: false,
          now,
        });
      }
    }

    res.json(tenant);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug já está em uso por outra conta' });
    console.error('admin patch tenant:', err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/admin/tenants/:id — detalhes completos do tenant */
router.get('/tenants/:id', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;

    // Tenant + sessão WA + contrato ativo + plano + afiliado
    const detail = await db.execute(sql`
      SELECT
        t.id, t.slug, t.name, t.registered_phone, t.active,
        t.terms_accepted_at, t.terms_version, t.created_at, t.updated_at,
        t.affiliate_code, t.affiliate_id,
        af.name AS affiliate_name,
        ws.status AS wa_status, ws.connected_phone, ws.last_seen_at,
        c.id AS contract_id, c.status AS contract_status,
        c.started_at AS contract_started_at, c.expires_at AS contract_expires_at,
        c.auto_renew AS contract_auto_renew,
        p.id AS plan_id, p.slug AS plan_slug, p.name AS plan_name,
        p.price_brl, p.messages_per_month
      FROM tenants t
      LEFT JOIN whatsapp_sessions ws ON ws.tenant_id = t.id
      LEFT JOIN LATERAL (
        SELECT c2.*
        FROM contracts c2
        WHERE c2.tenant_id = t.id AND c2.status = 'active'
        ORDER BY c2.created_at DESC
        LIMIT 1
      ) c ON true
      LEFT JOIN plans p ON p.id = c.plan_id
      LEFT JOIN affiliates af ON af.id = t.affiliate_id
      WHERE t.id = ${tenantId}
      LIMIT 1
    `).then((r) => r.rows[0]);

    if (!detail) return res.status(404).json({ error: 'Cliente não encontrado' });

    // Métricas: contatos, campanhas, backup count, mensagens (mês corrente e total)
    const currentMonth = getMonthKeyBr();
    const stats = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM contacts WHERE tenant_id = ${tenantId} AND active = true) AS contacts,
        (SELECT COUNT(*)::int FROM contacts WHERE tenant_id = ${tenantId} AND opted_out = true) AS opted_out,
        (SELECT COUNT(*)::int FROM campaigns WHERE tenant_id = ${tenantId}) AS campaigns,
        (SELECT COUNT(*)::int FROM send_logs WHERE tenant_id = ${tenantId} AND status = 'sent') AS messages_total,
        (SELECT COUNT(*)::int FROM send_logs WHERE tenant_id = ${tenantId} AND status = 'failed') AS messages_failed,
        (SELECT COUNT(*)::int FROM send_logs WHERE tenant_id = ${tenantId} AND status = 'sent'
          AND to_char(sent_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = ${currentMonth}) AS messages_this_month,
        (SELECT COUNT(*)::int FROM conversations WHERE tenant_id = ${tenantId}) AS conversations
    `).then((r) => r.rows[0]);

    const messagesIncluded = detail.messages_per_month;
    const messagesThisMonth = stats.messages_this_month || 0;
    const overLimit = messagesIncluded !== null && messagesThisMonth > messagesIncluded;

    // Histórico de pagamentos recentes
    const payments = await db.select().from(paymentRecords)
      .where(eq(paymentRecords.tenantId, tenantId))
      .orderBy(desc(paymentRecords.createdAt))
      .limit(10);

    // Histórico de contratos
    const allContracts = await db.execute(sql`
      SELECT
        c.id, c.status, c.started_at, c.expires_at, c.created_at,
        p.name AS plan_name, p.slug AS plan_slug, p.price_brl
      FROM contracts c
      LEFT JOIN plans p ON p.id = c.plan_id
      WHERE c.tenant_id = ${tenantId}
      ORDER BY c.created_at DESC
    `).then((r) => r.rows);

    // Status da instância wwebjs em memória (computador conectado)
    let runtime = { inMemory: false, browserConnected: false, info: null };
    try {
      const whatsapp = require('../services/whatsapp.service');
      const state = whatsapp.getTenantState
        ? whatsapp.getTenantState(tenantId)
        : null;
      if (state?.client) {
        runtime.inMemory = true;
        runtime.status = state.status;
        try {
          const info = state.client.info;
          if (info) {
            runtime.info = {
              wid: info.wid?._serialized || null,
              pushname: info.pushname || null,
              platform: info.platform || null,
            };
            runtime.browserConnected = true;
          }
        } catch (_) {}
      }
    } catch (_) {}

    res.json({
      tenant: detail,
      stats: {
        contacts: stats.contacts || 0,
        optedOut: stats.opted_out || 0,
        campaigns: stats.campaigns || 0,
        conversations: stats.conversations || 0,
        messagesTotal: stats.messages_total || 0,
        messagesFailed: stats.messages_failed || 0,
        messagesThisMonth,
        messagesIncluded,
        overLimit,
        messagesExtra: overLimit ? messagesThisMonth - messagesIncluded : 0,
      },
      payments,
      contracts: allContracts,
      runtime,
    });
  } catch (err) {
    console.error('admin get tenant detail:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/tenants/:id/disconnect-wa — força desconexão da sessão WhatsApp */
router.post('/tenants/:id/disconnect-wa', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;

    let destroyed = false;
    try {
      const whatsapp = require('../services/whatsapp.service');
      const state = whatsapp.getTenantState ? whatsapp.getTenantState(tenantId) : null;
      if (state?.client) {
        await state.client.destroy().catch(() => {});
        destroyed = true;
      }
    } catch (_) {}

    await db.update(whatsappSessions)
      .set({ status: 'disconnected', connectedPhone: null, updatedAt: new Date() })
      .where(eq(whatsappSessions.tenantId, tenantId));

    res.json({ ok: true, destroyed });
  } catch (err) {
    console.error('admin disconnect-wa:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/admin/tenants/:id/extend — adiciona dias ao contrato ativo */
router.post('/tenants/:id/extend', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;
    const days = Math.max(1, parseInt(req.body?.days) || 30);

    const [contract] = await db.select().from(contracts)
      .where(and(eq(contracts.tenantId, tenantId), eq(contracts.status, 'active')));

    if (!contract) return res.status(404).json({ error: 'Nenhum contrato ativo encontrado' });
    if (!contract.expiresAt) return res.status(400).json({ error: 'Esse contrato é vitalício — não precisa estender' });

    const base = new Date(Math.max(Date.now(), new Date(contract.expiresAt).getTime()));
    const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    await db.update(contracts)
      .set({ expiresAt: newExpiry, updatedAt: new Date() })
      .where(eq(contracts.id, contract.id));

    // Reativa tenant se estava inativo
    await db.update(tenants)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

    res.json({ ok: true, newExpiry, daysAdded: days });
  } catch (err) {
    console.error('admin extend:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Kill switch (anti-bloqueio) ─────────────────────────── */

/**
 * POST /api/admin/tenants/:id/kill-switch
 * Body: { reason?: string, ttlSec?: number, action: 'on'|'off' }
 * Pausa imediatamente todos os envios desse tenant via Redis.
 */
router.post('/tenants/:id/kill-switch', async (req, res) => {
  try {
    const guard = require('../services/whatsapp.guard');
    const { reason = 'manual', ttlSec = 86400, action = 'on' } = req.body || {};

    if (action === 'off') {
      const ok = await guard.clearKillSwitch(req.params.id);
      guard.resetQualityGate(req.params.id);
      return res.json({ ok, killSwitch: null });
    }

    const ok = await guard.setKillSwitch(req.params.id, reason, ttlSec);
    res.json({ ok, killSwitch: { reason, ttlSec, since: new Date() } });
  } catch (err) {
    console.error('admin kill-switch:', err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/admin/tenants/:id/anti-block — estado de qualidade + kill switch */
router.get('/tenants/:id/anti-block', async (req, res) => {
  try {
    const guard = require('../services/whatsapp.guard');
    const ks = await guard.getKillSwitch(req.params.id);
    const errorRate = guard.getErrorRate(req.params.id);
    res.json({
      killSwitch: ks ? { reason: ks } : null,
      errorRate,
      qualityGateThreshold: guard.QUALITY_GATE_THRESHOLD,
      qualityGateBreached: guard.isQualityGateBreached(req.params.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tenants/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.update(tenants)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(tenants.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('admin delete tenant:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Platform Config ────────────────────────────────────── */

router.get('/config', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.select().from(platformConfig).orderBy(platformConfig.key);
    res.json(rows);
  } catch (err) {
    console.error('admin get config:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/config/:key', async (req, res) => {
  try {
    const db = getDb();
    const { value } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value é obrigatório' });
    }

    const [row] = await db.update(platformConfig)
      .set({ value: String(value), updatedAt: new Date() })
      .where(eq(platformConfig.key, req.params.key))
      .returning();

    if (!row) return res.status(404).json({ error: 'Chave de configuração não encontrada' });

    // Força reload imediato do cache
    await refreshConfig();

    res.json(row);
  } catch (err) {
    console.error('admin patch config:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Planos ─────────────────────────────────────────────── */

router.get('/plans', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.select().from(plans).orderBy(plans.priceBrl);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Dashboard Financeiro ───────────────────────────────── */

router.get('/financial', async (req, res) => {
  try {
    const db = getDb();

    const summary = await db.execute(sql`
      SELECT
        COUNT(DISTINCT t.id) FILTER (WHERE t.active = true) AS active_tenants,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') AS active_contracts,
        COUNT(DISTINCT c.id) FILTER (
          WHERE c.status = 'active'
            AND c.expires_at <= now() + INTERVAL '7 days'
        ) AS expiring_soon,
        COALESCE(SUM(p.price_brl) FILTER (WHERE c.status = 'active'), 0) AS mrr_brl
      FROM tenants t
      LEFT JOIN contracts c ON c.tenant_id = t.id
      LEFT JOIN plans p ON p.id = c.plan_id
    `);

    const recentPayments = await db.select().from(paymentRecords)
      .orderBy(desc(paymentRecords.createdAt))
      .limit(20);

    res.json({
      summary: summary.rows[0],
      recentPayments,
    });
  } catch (err) {
    console.error('admin financial:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Storage (Cloudflare R2) ─────────────────────────────── */

/**
 * GET /api/admin/storage — info atual do storage (provider, ativo?, bucket)
 */
/* ─── DLQ (mensagens descartadas pelo guard) ─────────────── */

/**
 * GET /api/admin/tenants/:id/dlq — lista mensagens em DLQ + agregação por reason
 */
router.get('/tenants/:id/dlq', async (req, res) => {
  try {
    const { getPool } = require('../db');
    const tenantId = req.params.id;
    const limit = Math.min(200, parseInt(req.query.limit) || 50);

    const [{ rows: items }, { rows: agg }] = await Promise.all([
      getPool().query(
        `SELECT id, campaign_id, name, phone, error, dispatched_at, updated_at
         FROM send_logs WHERE tenant_id = $1 AND status = 'dlq'
         ORDER BY updated_at DESC LIMIT $2`,
        [tenantId, limit],
      ),
      getPool().query(
        `SELECT split_part(error, ':', 1) AS reason, COUNT(*)::int AS n
         FROM send_logs WHERE tenant_id = $1 AND status = 'dlq'
         GROUP BY reason ORDER BY n DESC LIMIT 20`,
        [tenantId],
      ),
    ]);

    res.json({ items, byReason: agg, total: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/tenants/:id/dlq/redrive
 * Body: { ids?: [logId,...] }  — se vazio, redrive todos os 'dlq' do tenant
 * Marca como 'pending' e re-enfileira no Bull (campaign reaproveitada).
 */
router.post('/tenants/:id/dlq/redrive', async (req, res) => {
  try {
    const { getPool } = require('../db');
    const { getQueueForTenant } = require('../config/queue');
    const tenantId = req.params.id;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;

    const pool = getPool();
    const whereIds = ids ? `AND id = ANY($2::uuid[])` : '';
    const params = ids ? [tenantId, ids] : [tenantId];

    // Pega logs DLQ + dados da campanha
    const { rows: items } = await pool.query(`
      SELECT sl.id, sl.campaign_id, sl.phone, sl.name,
             c.text, c.image_path, c.append_opt_out, c.opt_out_text
      FROM send_logs sl
      JOIN campaigns c ON c.id = sl.campaign_id
      WHERE sl.tenant_id = $1 AND sl.status = 'dlq' ${whereIds}
      LIMIT 1000
    `, params);

    if (!items.length) return res.json({ redriven: 0 });

    // Agrupa por campanha → 1 job Bull por campanha
    const byCampaign = new Map();
    for (const it of items) {
      const k = it.campaign_id;
      if (!byCampaign.has(k)) byCampaign.set(k, { campaign: it, contacts: [] });
      byCampaign.get(k).contacts.push({ phone: it.phone, name: it.name });
    }

    // Marca como 'pending' antes de enfileirar — assim o processor faz upsert idempotente
    const itemIds = items.map((i) => i.id);
    await pool.query(
      `UPDATE send_logs SET status = 'pending', error = NULL, updated_at = now() WHERE id = ANY($1::uuid[])`,
      [itemIds],
    );

    const queue = getQueueForTenant(tenantId);
    let queued = 0;
    for (const [campaignId, grp] of byCampaign) {
      await queue.add({
        campaignId,
        tenantId,
        contacts: grp.contacts,
        text: grp.campaign.text,
        imagePath: grp.campaign.image_path || null,
        appendOptOut: grp.campaign.append_opt_out || false,
        optOutText: grp.campaign.opt_out_text || '',
        variables: {},
        hourStart: 8, hourEnd: 20, ignoreHours: false,
        dispatchedAt: new Date().toISOString(),
        redrive: true,
      });
      queued += grp.contacts.length;
    }

    res.json({ redriven: queued, campaigns: byCampaign.size });
  } catch (err) {
    console.error('admin dlq redrive:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Incidentes (eventos críticos) ──────────────────────── */

router.get('/incidents', async (req, res) => {
  try {
    const incidents = require('../services/incidents.service');
    const rows = await incidents.list(null, {
      limit: parseInt(req.query.limit) || 50,
      severity: req.query.severity || null,
      unresolvedOnly: req.query.unresolved === '1',
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tenants/:id/incidents', async (req, res) => {
  try {
    const incidents = require('../services/incidents.service');
    const rows = await incidents.list(req.params.id, {
      limit: parseInt(req.query.limit) || 20,
      unresolvedOnly: req.query.unresolved === '1',
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/incidents/:id/resolve', async (req, res) => {
  try {
    const incidents = require('../services/incidents.service');
    const updated = await incidents.resolve(req.params.id);
    if (!updated) return res.status(404).json({ error: 'Incidente não encontrado' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Observability: métricas Prometheus ─────────────────── */

/**
 * GET /api/admin/metrics — formato Prometheus exposition.
 * Configure no Prometheus:
 *   scrape_configs:
 *     - job_name: 'gestaozap'
 *       authorization: { credentials: 'TOKEN_ADMIN' }
 *       metrics_path: /api/admin/metrics
 *       static_configs: [{ targets: ['api.gestaozap.digital:443'] }]
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = require('../services/metrics.service');
    await metrics.collectDynamic();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics.render());
  } catch (err) {
    console.error('admin metrics:', err);
    res.status(500).send(`# error ${err.message}\n`);
  }
});

router.get('/storage', async (req, res) => {
  try {
    const storage = require('../services/storage.service');
    const cfg = storage.getR2Config();
    res.json({
      provider: cfg.provider,
      active: storage.isR2Active(),
      bucket: cfg.bucket,
      publicUrl: cfg.publicUrl,
      hasCredentials: Boolean(cfg.accountId && cfg.accessKey && cfg.secretKey && cfg.bucket),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/storage/test — testa conexão com R2 usando config atual
 */
router.post('/storage/test', async (req, res) => {
  try {
    const storage = require('../services/storage.service');
    // Garante config mais recente
    const { refreshConfig } = require('../config/platform');
    await refreshConfig();
    const result = await storage.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/storage/backfill — migra arquivos /uploads/... locais para R2.
 * Atualiza media_url em messages e image_path em campaigns.
 * Roda em background, emite progresso via Socket.IO (sala 'admin').
 */
router.post('/storage/backfill', async (req, res) => {
  try {
    const storage = require('../services/storage.service');
    if (!storage.isR2Active()) {
      return res.status(400).json({ error: 'R2 não está configurado ou ativo' });
    }

    // Dispara em background — responde imediatamente
    runBackfillInBackground().catch((e) => console.error('[backfill]', e.message));
    res.json({ ok: true, started: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function runBackfillInBackground() {
  const fs = require('fs');
  const path = require('path');
  const storage = require('../services/storage.service');
  const db = getDb();
  const uploadsDir = path.join(__dirname, '../../uploads');

  // Coleta tudo: messages.media_url começando com /uploads/  +  campaigns.image_path
  const msgs = await db.execute(sql`
    SELECT id, tenant_id, media_url
    FROM messages
    WHERE media_url LIKE '/uploads/%'
  `).then((r) => r.rows);

  const camps = await db.execute(sql`
    SELECT id, tenant_id, image_path
    FROM campaigns
    WHERE image_path LIKE 'uploads/%' OR image_path LIKE '/uploads/%'
  `).then((r) => r.rows);

  console.log(`[backfill] ${msgs.length} mensagem(ns) + ${camps.length} campanha(s) para migrar`);

  let ok = 0, fail = 0;

  // Mensagens
  for (const m of msgs) {
    const rel = m.media_url.replace(/^\/+uploads\/+/, '');
    const localPath = path.join(uploadsDir, rel);
    if (!fs.existsSync(localPath)) { fail++; continue; }

    try {
      const keyHint = path.dirname(rel); // mantém estrutura
      const up = await storage.uploadFromPath(localPath, keyHint);
      if (up.provider === 'r2') {
        await db.execute(sql`UPDATE messages SET media_url = ${up.url} WHERE id = ${m.id}::uuid`);
        try { fs.unlinkSync(localPath); } catch (_) {}
        ok++;
      }
    } catch (e) {
      console.warn('[backfill] msg', m.id, ':', e.message);
      fail++;
    }
  }

  // Campanhas
  for (const c of camps) {
    const rel = c.image_path.replace(/^\/?uploads\/+/, '');
    const localPath = path.join(uploadsDir, rel);
    if (!fs.existsSync(localPath)) { fail++; continue; }

    try {
      const keyHint = `campaigns/${c.tenant_id}`;
      const up = await storage.uploadFromPath(localPath, keyHint);
      if (up.provider === 'r2') {
        await db.execute(sql`UPDATE campaigns SET image_path = ${up.url} WHERE id = ${c.id}::uuid`);
        try { fs.unlinkSync(localPath); } catch (_) {}
        ok++;
      }
    } catch (e) {
      console.warn('[backfill] campaign', c.id, ':', e.message);
      fail++;
    }
  }

  console.log(`[backfill] concluído: ${ok} migrado(s), ${fail} falha(s)`);
}

/* ─── Features (addons) ──────────────────────────────────── */

router.get('/features', async (req, res) => {
  try {
    const db = getDb();
    const rows = await listFeatures(db);
    res.json(rows);
  } catch (err) {
    console.error('admin features list:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/features', async (req, res) => {
  try {
    const db = getDb();
    const row = await createOrUpdateFeature(db, req.body);
    res.status(201).json(row);
  } catch (err) {
    console.error('admin features create:', err);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/features/:id', async (req, res) => {
  try {
    const db = getDb();
    const row = await createOrUpdateFeature(db, req.body, req.params.id);
    res.json(row);
  } catch (err) {
    console.error('admin features patch:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/feature-requests', async (req, res) => {
  try {
    const db = getDb();
    const rows = await listPendingRequests(db);
    res.json(rows);
  } catch (err) {
    console.error('admin feature requests:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/tenants/:id/features', async (req, res) => {
  try {
    const db = getDb();
    const rows = await listTenantFeatures(db, req.params.id);
    res.json(rows);
  } catch (err) {
    console.error('admin tenant features:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/tenants/:id/features/:slug', async (req, res) => {
  try {
    const db = getDb();
    const { action = 'enable' } = req.body || {};
    if (action === 'disable') {
      await disableFeatureForTenant(db, req.params.id, req.params.slug);
      return res.json({ ok: true, action: 'disabled' });
    }
    const { expiresAt, isComplimentary } = req.body || {};
    const row = await enableFeatureForTenant(db, req.params.id, req.params.slug, {
      enabledBy: 'admin',
      expiresAt,
      isComplimentary: !!isComplimentary,
    });
    res.json({ ok: true, subscription: row });
  } catch (err) {
    console.error('admin tenant feature toggle:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
