const router = require('express').Router();
const { eq, and } = require('drizzle-orm');
const { getDb } = require('../db');
const { features } = require('../db/schema');
const { planIncludesFeature } = require('../services/feature.service');

const PLAN_SLUGS = ['starter', 'pro', 'business'];

// Público (sem auth): features pagas inclusas em cada plano, para a landing.
// Feature sem inclusão em nenhum plano NÃO aparece aqui (não é mencionada na landing).
router.get('/plan-features', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.select().from(features)
      .where(and(eq(features.active, true), eq(features.isFree, false)));

    const plans = {};
    for (const slug of PLAN_SLUGS) {
      plans[slug] = rows
        .filter((f) => f.includedInPlans?.length && planIncludesFeature(slug, f.includedInPlans))
        .map((f) => ({ name: f.name, slug: f.slug }));
    }
    res.json({ plans });
  } catch (err) {
    console.error('[public-landing] plan-features:', err.message);
    res.json({ plans: {} });
  }
});

module.exports = router;
