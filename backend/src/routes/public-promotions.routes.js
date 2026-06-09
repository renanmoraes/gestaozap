const router = require('express').Router();
const { getDb } = require('../db');
const { tenantHasFeature } = require('../services/feature.service');
const {
  getActivePromotions,
  getTenantWhatsAppPhone,
  recordEvent,
  recordLead,
} = require('../services/promotion.service');

const REDIRECT_URL = process.env.MARKETING_URL || 'https://gestaozap.digital';

router.get('/vitrine', async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.id) return res.status(404).json({ error: 'Conta não encontrada' });

    const db = getDb();
    const { active } = await tenantHasFeature(db, tenant.id, 'vitrine-promocoes');

    if (!active) {
      const wantsJson = (req.headers.accept || '').includes('application/json')
        || req.headers['x-requested-with'] === 'XMLHttpRequest';
      if (wantsJson) {
        return res.status(403).json({ inactive: true, redirectUrl: REDIRECT_URL });
      }
      return res.redirect(302, REDIRECT_URL);
    }

    const promos = await getActivePromotions(db, tenant.id);
    const phone = await getTenantWhatsAppPhone(db, tenant.id);

    if (!promos.length) {
      return res.json({
        empty: true,
        tenantName: tenant.name,
        phone,
      });
    }

    res.json({
      empty: false,
      tenantName: tenant.name,
      phone,
      promotions: promos,
    });
  } catch (err) {
    console.error('public vitrine:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/events', async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.id) return res.status(400).json({ error: 'Tenant não identificado' });

    const db = getDb();
    const { active } = await tenantHasFeature(db, tenant.id, 'vitrine-promocoes');
    if (!active) return res.status(403).json({ error: 'Indisponível' });

    const { promotionId, slotId, eventType, sessionId, metadata } = req.body || {};
    if (!eventType) return res.status(400).json({ error: 'eventType obrigatório' });

    const row = await recordEvent(db, tenant.id, {
      promotionId,
      slotId,
      eventType,
      sessionId,
      metadata,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('public events:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/leads', async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.id) return res.status(400).json({ error: 'Tenant não identificado' });

    const db = getDb();
    const { active } = await tenantHasFeature(db, tenant.id, 'vitrine-promocoes');
    if (!active) return res.status(403).json({ error: 'Indisponível' });

    const { promotionId, slotId, message, source, visitorSession } = req.body || {};
    const row = await recordLead(db, tenant.id, {
      promotionId,
      slotId,
      message,
      source,
      visitorSession,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('public leads:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
