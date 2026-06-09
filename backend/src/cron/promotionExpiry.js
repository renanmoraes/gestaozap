const { eq, and, lte, or, isNull, gt } = require('drizzle-orm');
const { getDb } = require('../db');
const { tenantFeatures } = require('../db/schema');
const { expirePromotionsAndActivate } = require('../services/promotion.service');
const { msUntilMidnightBr } = require('../utils/timezone.util');

async function expireTenantFeatures() {
  const now = new Date();
  const db = getDb();

  const expired = await db.update(tenantFeatures)
    .set({ status: 'expired', updatedAt: now })
    .where(and(
      eq(tenantFeatures.status, 'active'),
      lte(tenantFeatures.expiresAt, now),
    ))
    .returning({ id: tenantFeatures.id });

  if (expired.length) {
    console.log(`[cron] ${expired.length} tenant_features expiradas`);
  }

  // Dia 05 = vencimento de pagamento (não revoga acesso). Apenas log de cobrança futura.
  const day = now.getDate();
  if (day === 5) {
    const activePaid = await db.select().from(tenantFeatures)
      .where(and(
        eq(tenantFeatures.status, 'active'),
        eq(tenantFeatures.isComplimentary, false),
        or(isNull(tenantFeatures.expiresAt), gt(tenantFeatures.expiresAt, now)),
      ));
    console.log(`[cron] billing stub (dia 05): ${activePaid.length} addons cobráveis; acesso não é bloqueado por inadimplência`);
  }

  return expired.length;
}

async function runPromotionMaintenance() {
  const db = getDb();
  const promo = await expirePromotionsAndActivate(db);
  const features = await expireTenantFeatures();
  console.log(`[cron] promoções: ${promo.expired} expiradas, ${promo.activated} ativadas; features: ${features} expiradas`);
  return { ...promo, featuresExpired: features };
}

function schedulePromotionExpiryCheck() {
  const tick = async () => {
    try {
      await runPromotionMaintenance();
    } catch (err) {
      console.error('[cron] promotion maintenance:', err.message);
    }
    setTimeout(tick, msUntilMidnightBr());
  };
  setTimeout(tick, msUntilMidnightBr());
  console.log('[cron] promotion expiry agendado (meia-noite BR)');
}

module.exports = { schedulePromotionExpiryCheck, runPromotionMaintenance };
