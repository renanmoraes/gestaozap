const router = require('express').Router();
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { getSuggestions, registerInterest } = require('../services/upsell.service');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

// Sugestões de produtos para os banners (não bloqueia se vazio).
router.get('/suggestions', async (req, res) => {
  try {
    const db = getDb();
    const suggestions = await getSuggestions(db, getTenantId(req));
    res.json({ suggestions });
  } catch (err) {
    console.error('[upsell] suggestions:', err.message);
    res.json({ suggestions: [] });
  }
});

// Cliente clicou "Tenho interesse" num addon → registra para o time comercial.
router.post('/interest', async (req, res) => {
  try {
    const db = getDb();
    const slug = String(req.body?.featureSlug || '').trim();
    if (!slug) return res.status(400).json({ error: 'featureSlug obrigatório' });
    await registerInterest(db, getTenantId(req), slug);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
