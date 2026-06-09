const router = require('express').Router();
const { getDb } = require('../db');
const {
  tenantHasFeature,
  listTenantFeatures,
  requestFeature,
} = require('../services/feature.service');

router.get('/status', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenant.id;
    const { active, feature, subscription } = await tenantHasFeature(db, tenantId, 'vitrine-promocoes');
    res.json({
      slug: 'vitrine-promocoes',
      active,
      feature,
      subscription,
    });
  } catch (err) {
    console.error('features status:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/catalog', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenant.id;
    const rows = await listTenantFeatures(db, tenantId);
    res.json(rows);
  } catch (err) {
    console.error('features catalog:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/vitrine-promocoes/request', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenant.id;
    const { note } = req.body || {};
    const row = await requestFeature(db, tenantId, 'vitrine-promocoes', note);
    res.status(201).json(row);
  } catch (err) {
    console.error('features request:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
