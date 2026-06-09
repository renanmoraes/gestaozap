const { eq, and, or } = require('drizzle-orm');
const { promotions, tenants } = require('../db/schema');
const { buildPromotionShareUrl } = require('../utils/booking-time.util');
const { tenantHasFeature } = require('../services/feature.service');
const { isPromotionLive } = require('./promotion.service');

async function listPromotionShareLinks(db, tenantId, baseOrigin) {
  const { active } = await tenantHasFeature(db, tenantId, 'vitrine-promocoes');
  if (!active) return [];

  const now = new Date();
  const rows = await db.select({
    id: promotions.id,
    title: promotions.title,
    shareCode: promotions.shareCode,
    status: promotions.status,
    startsAt: promotions.startsAt,
    expiresAt: promotions.expiresAt,
  }).from(promotions)
    .where(and(
      eq(promotions.tenantId, tenantId),
      or(eq(promotions.status, 'active'), eq(promotions.status, 'scheduled')),
    ));

  const [tenantRow] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId));
  const slug = tenantRow?.slug;

  return rows
    .filter((r) => r.shareCode && isPromotionLive(r, now))
    .map((r) => ({
      id: r.id,
      title: r.title,
      shareCode: r.shareCode,
      hashtag: `#${r.shareCode}`,
      url: buildPromotionShareUrl(slug, r.shareCode, baseOrigin),
      message: `Confira: ${buildPromotionShareUrl(slug, r.shareCode, baseOrigin)}`,
    }));
}

function suggestShareCode(title, index = 1) {
  const base = String(title || 'Promocao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 20) || 'Promocao';
  return index <= 1 ? `${base}${String(index).padStart(2, '0')}` : `${base}${index}`;
}

module.exports = {
  listPromotionShareLinks,
  suggestShareCode,
};
