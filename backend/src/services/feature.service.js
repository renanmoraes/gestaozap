const { eq, and, or, isNull, gt, desc } = require('drizzle-orm');
const {
  features,
  tenantFeatures,
  featureRequests,
  contracts,
  tenants,
} = require('../db/schema');
const { tenantHasActiveAccess } = require('../utils/access.util');

async function getActiveContract(db, tenantId) {
  const [contract] = await db.select().from(contracts)
    .where(and(eq(contracts.tenantId, tenantId), eq(contracts.status, 'active')))
    .orderBy(desc(contracts.createdAt))
    .limit(1);
  return contract || null;
}

async function getFeatureBySlug(db, slug) {
  const [row] = await db.select().from(features).where(eq(features.slug, slug));
  return row || null;
}

async function tenantHasFeature(db, tenantId, featureSlug, now = new Date()) {
  const feature = await getFeatureBySlug(db, featureSlug);
  if (!feature || !feature.active) return { active: false, feature: null };

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return { active: false, feature };

  const contract = await getActiveContract(db, tenantId);
  if (!tenantHasActiveAccess(tenant, contract, now)) {
    return { active: false, feature, reason: 'no_access' };
  }

  if (feature.isFree) {
    return { active: true, feature, subscription: null };
  }

  const [sub] = await db.select().from(tenantFeatures)
    .where(and(
      eq(tenantFeatures.tenantId, tenantId),
      eq(tenantFeatures.featureId, feature.id),
      eq(tenantFeatures.status, 'active'),
      or(isNull(tenantFeatures.expiresAt), gt(tenantFeatures.expiresAt, now)),
    ))
    .orderBy(desc(tenantFeatures.startsAt))
    .limit(1);

  return { active: !!sub, feature, subscription: sub || null };
}

async function listFeatures(db) {
  return db.select().from(features).orderBy(features.name);
}

async function listTenantFeatures(db, tenantId) {
  const catalog = await listFeatures(db);
  const subs = await db.select({
    id: tenantFeatures.id,
    featureId: tenantFeatures.featureId,
    status: tenantFeatures.status,
    startsAt: tenantFeatures.startsAt,
    expiresAt: tenantFeatures.expiresAt,
    priceSnapshot: tenantFeatures.priceSnapshot,
    enabledBy: tenantFeatures.enabledBy,
  }).from(tenantFeatures)
    .where(eq(tenantFeatures.tenantId, tenantId))
    .orderBy(desc(tenantFeatures.createdAt));

  const subByFeature = new Map(subs.map((s) => [s.featureId, s]));
  const now = new Date();

  return catalog.map((f) => {
    const sub = subByFeature.get(f.id);
    const active = f.isFree || (
      sub
      && sub.status === 'active'
      && (!sub.expiresAt || new Date(sub.expiresAt) > now)
    );
    return { ...f, subscription: sub || null, tenantActive: active };
  });
}

async function enableFeatureForTenant(db, tenantId, featureSlug, enabledBy = 'admin') {
  const feature = await getFeatureBySlug(db, featureSlug);
  if (!feature) throw new Error('Feature não encontrada');

  const startsAt = new Date();
  const expiresAt = feature.isFree ? null : new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db.update(tenantFeatures)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(
      eq(tenantFeatures.tenantId, tenantId),
      eq(tenantFeatures.featureId, feature.id),
      eq(tenantFeatures.status, 'active'),
    ));

  const [row] = await db.insert(tenantFeatures).values({
    tenantId,
    featureId: feature.id,
    status: 'active',
    startsAt,
    expiresAt,
    priceSnapshot: feature.priceBrl,
    enabledBy,
  }).returning();

  return row;
}

async function disableFeatureForTenant(db, tenantId, featureSlug) {
  const feature = await getFeatureBySlug(db, featureSlug);
  if (!feature) throw new Error('Feature não encontrada');

  await db.update(tenantFeatures)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(
      eq(tenantFeatures.tenantId, tenantId),
      eq(tenantFeatures.featureId, feature.id),
      eq(tenantFeatures.status, 'active'),
    ));

  return { ok: true };
}

async function requestFeature(db, tenantId, featureSlug, note = null) {
  const feature = await getFeatureBySlug(db, featureSlug);
  if (!feature) throw new Error('Feature não encontrada');

  const [existing] = await db.select().from(featureRequests)
    .where(and(
      eq(featureRequests.tenantId, tenantId),
      eq(featureRequests.featureId, feature.id),
      eq(featureRequests.status, 'pending'),
    ))
    .limit(1);

  if (existing) return existing;

  const [row] = await db.insert(featureRequests).values({
    tenantId,
    featureId: feature.id,
    status: 'pending',
    note,
  }).returning();

  return row;
}

async function listPendingRequests(db, tenantId = null) {
  const conditions = [eq(featureRequests.status, 'pending')];
  if (tenantId) conditions.push(eq(featureRequests.tenantId, tenantId));

  return db.select({
    id: featureRequests.id,
    tenantId: featureRequests.tenantId,
    featureId: featureRequests.featureId,
    status: featureRequests.status,
    note: featureRequests.note,
    createdAt: featureRequests.createdAt,
    featureSlug: features.slug,
    featureName: features.name,
    tenantName: tenants.name,
    tenantSlug: tenants.slug,
  })
    .from(featureRequests)
    .innerJoin(features, eq(features.id, featureRequests.featureId))
    .innerJoin(tenants, eq(tenants.id, featureRequests.tenantId))
    .where(and(...conditions))
    .orderBy(desc(featureRequests.createdAt));
}

async function createOrUpdateFeature(db, data, id = null) {
  const payload = {
    slug: data.slug,
    name: data.name,
    description: data.description || null,
    priceBrl: String(data.priceBrl ?? '0'),
    isFree: !!data.isFree,
    active: data.active !== false,
    billingDay: Number(data.billingDay) || 5,
    updatedAt: new Date(),
  };

  if (id) {
    const [row] = await db.update(features).set(payload).where(eq(features.id, id)).returning();
    return row;
  }

  const [row] = await db.insert(features).values({
    ...payload,
    isSystem: !!data.isSystem,
  }).returning();
  return row;
}

module.exports = {
  getFeatureBySlug,
  tenantHasFeature,
  listFeatures,
  listTenantFeatures,
  enableFeatureForTenant,
  disableFeatureForTenant,
  requestFeature,
  listPendingRequests,
  createOrUpdateFeature,
  getActiveContract,
};
