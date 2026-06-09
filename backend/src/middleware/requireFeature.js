const { getDb } = require('../db');
const { tenantHasFeature } = require('../services/feature.service');

function requireFeature(featureSlug) {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenant?.id;
      if (!tenantId) return res.status(400).json({ error: 'Tenant não identificado' });

      const db = getDb();
      const { active, feature } = await tenantHasFeature(db, tenantId, featureSlug);

      if (!active) {
        return res.status(403).json({
          error: 'feature_required',
          feature: featureSlug,
          featureName: feature?.name || featureSlug,
          priceBrl: feature?.priceBrl,
        });
      }

      req.featureAccess = { slug: featureSlug, feature };
      next();
    } catch (err) {
      console.error('[requireFeature]', err.message);
      res.status(500).json({ error: 'Erro ao verificar feature' });
    }
  };
}

module.exports = requireFeature;
