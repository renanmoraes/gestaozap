const router = require('express').Router();
const { eq, and, inArray } = require('drizzle-orm');
const { getQueueForTenant } = require('../config/queue');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { campaigns, contacts, sendLogs } = require('../db/schema');
const whatsapp = require('../services/whatsapp.service');
const { requireWAConnected } = require('../middleware/featureGate');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

router.post('/test-number', requireWAConnected, async (req, res) => {

  const { phone, message } = req.body || {};
  const normalizedPhone = normalizePhoneForWhatsApp(phone);

  if (!normalizedPhone) {
    return res.status(400).json({ error: 'Número inválido' });
  }

  const testMessage =
    typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Teste de envio - gestaozap';

  await whatsapp.sendMessage(normalizedPhone, testMessage, null);
  return res.json({ ok: true, phone: normalizedPhone, message: 'Mensagem de teste enviada' });
});

router.post('/', requireWAConnected, async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);

    const {
      campaignId,
      contactIds,
      hourStart = 8,
      hourEnd = 20,
      ignoreHours = false,
      preventDuplicate = true,
      variables = {},
      // Categoria de mensagem: 'marketing' (default), 'transactional', 'support', 'billing'
      category = 'marketing',
    } = req.body;

    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)));
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    // Mapeia categoria → coluna consent_*
    const consentCol = {
      marketing: contacts.consentMarketing,
      transactional: contacts.consentTransactional,
      support: contacts.consentSupport,
      billing: contacts.consentBilling,
    }[category] || contacts.consentMarketing;

    let eligibleContacts = await db.select().from(contacts)
      .where(and(
        eq(contacts.tenantId, tenantId),
        inArray(contacts.id, contactIds),
        eq(contacts.active, true),
        eq(contacts.optedOut, false),
        eq(consentCol, true), // só quem deu consentimento para esta categoria
      ));

    const blockedCount = contactIds.length - eligibleContacts.length;
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

    const job = await getQueueForTenant(tenantId).add({
      campaignId,
      tenantId,
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
