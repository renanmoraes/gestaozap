const router = require('express').Router();
const { eq, and, inArray, sql } = require('drizzle-orm');
const { randomUUID } = require('crypto');
const { getQueueForTenant } = require('../config/queue');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { campaigns, sendLogs } = require('../db/schema');
const whatsapp = require('../services/whatsapp.service');
const { requireWAConnected } = require('../middleware/featureGate');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');
const { fetchEligibleContactsForSend } = require('../utils/contacts-query.util');
const { tenantHasFeature } = require('../services/feature.service');
const { getConfigInt } = require('../config/platform');
const { countActiveDispatches } = require('../services/dispatch.service');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

// Prévia da audiência (conta destinatários elegíveis, inclusive filtro de intenção).
router.post('/preview', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const { selectAll = false, filter = {}, excludeContactIds = [], category = 'marketing', intentFilter = null } = req.body || {};

    let effectiveIntentFilter = null;
    if (intentFilter && typeof intentFilter === 'object') {
      const { active } = await tenantHasFeature(db, tenantId, 'intencoes');
      if (active) effectiveIntentFilter = intentFilter;
    }

    const rows = await fetchEligibleContactsForSend(db, tenantId, {
      selectAll: Boolean(selectAll),
      filter,
      excludeContactIds,
      category,
      intentFilter: effectiveIntentFilter,
      referenceDate: new Date(),
    });
    res.json({ eligible: rows.length, intentApplied: !!effectiveIntentFilter });
  } catch (err) {
    console.error('send preview:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/test-number', requireWAConnected, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { phone, message, countryCode } = req.body || {};

    const localDigits = String(phone || '').replace(/\D/g, '');
    const cc = String(countryCode || '').replace(/\D/g, '');
    const rawPhone = cc && localDigits ? `${cc}${localDigits}` : phone;
    const normalizedPhone = normalizePhoneForWhatsApp(rawPhone);

    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Número inválido' });
    }

    const testMessage =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : 'Teste de envio - gestaozap';

    await whatsapp.sendMessage(tenantId, normalizedPhone, testMessage, null);

    return res.json({ ok: true, phone: normalizedPhone, message: 'Mensagem de teste enviada' });
  } catch (err) {
    console.error('send test-number:', err);
    return res.status(500).json({ error: err.message || 'Erro ao enviar teste' });
  }
});

router.post('/', requireWAConnected, async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);

    const {
      campaignId,
      contactIds,
      selectAll = false,
      filter = {},
      excludeContactIds = [],
      hourStart = getConfigInt('hour_start_default', 8),
      hourEnd = getConfigInt('hour_end_default', 20),
      ignoreHours = false,
      preventDuplicate = true,
      variables = {},
      category = 'marketing',
      intentFilter = null,
    } = req.body;

    // Filtro de intenção só vale com a feature paga ativa (gate no backend, spec §18).
    let effectiveIntentFilter = null;
    if (intentFilter && typeof intentFilter === 'object') {
      const { active } = await tenantHasFeature(db, tenantId, 'intencoes');
      if (active) effectiveIntentFilter = intentFilter;
    }

    const useSelectAll = Boolean(selectAll);
    const hasExplicitIds = Array.isArray(contactIds) && contactIds.length > 0;
    if (!useSelectAll && !hasExplicitIds) {
      return res.status(400).json({ error: 'Informe contactIds ou selectAll: true com filtros.' });
    }

    const [planRow] = await db.execute(sql`
      SELECT p.max_concurrent_sends
      FROM contracts c
      JOIN plans p ON p.id = c.plan_id
      WHERE c.tenant_id = ${tenantId} AND c.status = 'active'
      ORDER BY c.expires_at DESC NULLS FIRST
      LIMIT 1
    `).then((r) => r.rows);

    const maxConcurrent = Number(planRow?.max_concurrent_sends) || 1;
    const inUse = await countActiveDispatches(tenantId);
    if (inUse >= maxConcurrent) {
      return res.status(409).json({
        error: 'concurrency_limit',
        message: `Limite de ${maxConcurrent} envio(s) simultâneo(s) do seu plano atingido.`,
        concurrency: { inUse, allowed: maxConcurrent },
      });
    }

    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)));
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    let eligibleContacts = await fetchEligibleContactsForSend(db, tenantId, {
      contactIds: hasExplicitIds ? contactIds : undefined,
      selectAll: useSelectAll,
      filter,
      excludeContactIds,
      category,
      intentFilter: effectiveIntentFilter,
      referenceDate: new Date(),
    });

    const requestedCount = useSelectAll
      ? eligibleContacts.length + (excludeContactIds?.length || 0)
      : contactIds.length;
    const blockedCount = Math.max(0, requestedCount - eligibleContacts.length);
    const optedOutCount = blockedCount; // alias para retrocompatibilidade

    let skippedDuplicate = 0;
    if (preventDuplicate && eligibleContacts.length > 0) {
      const phones = eligibleContacts.map((c) => normalizePhoneForWhatsApp(c.phone) || c.phone);
      const alreadySentRows = await db.select({ phone: sendLogs.phone }).from(sendLogs)
        .where(and(
          eq(sendLogs.campaignId, campaignId),
          eq(sendLogs.tenantId, tenantId),
          inArray(sendLogs.phone, phones),
          eq(sendLogs.status, 'sent'),
        ));
      const sentSet = new Set(alreadySentRows.map((r) => r.phone));
      const before = eligibleContacts.length;
      eligibleContacts = eligibleContacts.filter((c) => {
        const norm = normalizePhoneForWhatsApp(c.phone) || c.phone;
        return !sentSet.has(norm);
      });
      skippedDuplicate = before - eligibleContacts.length;
    }

    if (!eligibleContacts.length) {
      return res.json({
        jobId: null,
        queued: 0,
        skippedDuplicate,
        optedOutCount,
        message: 'Nenhum contato elegível para envio.',
      });
    }

    const dispatchId = randomUUID();
    const job = await getQueueForTenant(tenantId).add({
      campaignId,
      tenantId,
      dispatchId,
      contacts: eligibleContacts.map((c) => ({ phone: c.phone, name: c.name })),
      text: campaign.text,
      imagePath: campaign.imagePath || null,
      appendOptOut: campaign.appendOptOut || false,
      optOutText: campaign.optOutText || '',
      variables,
      hourStart,
      hourEnd,
      ignoreHours: Boolean(ignoreHours),
      dispatchedAt: new Date().toISOString(),
    });

    res.json({ jobId: job.id, queued: eligibleContacts.length, skippedDuplicate, optedOutCount });
  } catch (err) {
    console.error('send post:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
