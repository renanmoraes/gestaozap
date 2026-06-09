const { eq, and, lte, gte, or, isNull, desc, sql, count } = require('drizzle-orm');
const {
  promotionLayouts,
  promotions,
  promotionSlots,
  promotionEvents,
  promotionLeads,
  whatsappSessions,
  tenants,
} = require('../db/schema');

function computeDiscountPct(original, discount) {
  const o = parseFloat(String(original || '').replace(',', '.'));
  const d = parseFloat(String(discount || '').replace(',', '.'));
  if (!o || !d || d >= o) return null;
  return Math.round(((o - d) / o) * 100);
}

function enrichContent(contentJson, schemaJson) {
  const content = { ...(contentJson || {}) };
  if (Array.isArray(content.items)) {
    content.items = content.items.map((item) => {
      if (!item.priceOriginal && !item.priceDiscount) return item;
      const pct = computeDiscountPct(item.priceOriginal, item.priceDiscount);
      return pct != null ? { ...item, discountPct: pct } : item;
    });
  }
  // legacy computed slots
  const slots = schemaJson?.slots || [];
  for (const slot of slots) {
    if (slot.computed && slot.key === 'discount_pct') {
      const orig = content.price_original?.value ?? content.price_original;
      const disc = content.price_discount?.value ?? content.price_discount;
      const pct = computeDiscountPct(orig, disc);
      if (pct != null) content.discount_pct = { value: String(pct) };
    }
  }
  return content;
}

async function syncPromotionSlots(db, promotionId, contentJson, schemaJson) {
  await db.delete(promotionSlots).where(eq(promotionSlots.promotionId, promotionId));

  let order = 0;
  const inserted = [];
  const content = contentJson || {};

  const pushSlot = async (slotKey, data, label) => {
    const mediaPath = data.mediaPath || data.media_path || data.url || null;
    if (!mediaPath && !data.ctaText && !data.cta_text) return;
    const [row] = await db.insert(promotionSlots).values({
      promotionId,
      slotKey,
      mediaType: data.mediaType || data.media_type || (mediaPath?.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image'),
      mediaPath,
      ctaText: data.ctaText || data.cta_text || null,
      label: label || data.title || data.label || slotKey,
      sortOrder: order++,
    }).returning();
    inserted.push(row);
  };

  if (content.banner?.mediaPath || content.banner?.url) {
    await pushSlot('banner', content.banner, 'Banner');
  }

  if (Array.isArray(content.items) && content.items.length) {
    for (const item of content.items) {
      await pushSlot(item.id || `item-${order}`, item, item.title);
    }
    return inserted;
  }

  // Legacy: slots fixos do schema antigo
  const slots = schemaJson?.slots || [];
  for (const slot of slots) {
    if (slot.type !== 'media') continue;
    const data = content[slot.key];
    if (!data) continue;
    await pushSlot(slot.key, data, slot.label);
  }

  return inserted;
}

async function listLayouts(db) {
  return db.select().from(promotionLayouts)
    .where(eq(promotionLayouts.active, true))
    .orderBy(promotionLayouts.sortOrder);
}

async function getPromotionWithLayout(db, promotionId, tenantId) {
  const [row] = await db.select({
    promotion: promotions,
    layout: promotionLayouts,
  })
    .from(promotions)
    .innerJoin(promotionLayouts, eq(promotionLayouts.id, promotions.layoutId))
    .where(and(eq(promotions.id, promotionId), eq(promotions.tenantId, tenantId)));

  if (!row) return null;

  const slots = await db.select().from(promotionSlots)
    .where(eq(promotionSlots.promotionId, promotionId))
    .orderBy(promotionSlots.sortOrder);

  return {
    ...row.promotion,
    layout: row.layout,
    slots,
    contentJson: enrichContent(row.promotion.contentJson, row.layout.schemaJson),
  };
}

async function listPromotions(db, tenantId) {
  const rows = await db.select({
    promotion: promotions,
    layout: promotionLayouts,
  })
    .from(promotions)
    .innerJoin(promotionLayouts, eq(promotionLayouts.id, promotions.layoutId))
    .where(eq(promotions.tenantId, tenantId))
    .orderBy(desc(promotions.createdAt));

  return rows.map((r) => ({
    ...r.promotion,
    layoutSlug: r.layout.slug,
    layoutName: r.layout.name,
    layoutCategory: r.layout.category,
  }));
}

async function createPromotion(db, tenantId, data) {
  const [layout] = await db.select().from(promotionLayouts).where(eq(promotionLayouts.id, data.layoutId));
  if (!layout) throw new Error('Layout não encontrado');

  const contentJson = enrichContent(data.contentJson || {}, layout.schemaJson);

  const [promo] = await db.insert(promotions).values({
    tenantId,
    layoutId: data.layoutId,
    title: data.title || 'Nova promoção',
    status: data.status || 'draft',
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    contentJson,
  }).returning();

  const slots = await syncPromotionSlots(db, promo.id, contentJson, layout.schemaJson);
  return { ...promo, contentJson, slots };
}

async function updatePromotion(db, tenantId, promotionId, data) {
  const existing = await getPromotionWithLayout(db, promotionId, tenantId);
  if (!existing) throw new Error('Promoção não encontrada');

  const layout = existing.layout;
  const contentJson = data.contentJson !== undefined
    ? enrichContent(data.contentJson, layout.schemaJson)
    : existing.contentJson;

  const patch = {
    updatedAt: new Date(),
  };
  if (data.title !== undefined) patch.title = data.title;
  if (data.status !== undefined) patch.status = data.status;
  if (data.startsAt !== undefined) patch.startsAt = data.startsAt ? new Date(data.startsAt) : null;
  if (data.expiresAt !== undefined) patch.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (data.contentJson !== undefined) patch.contentJson = contentJson;
  if (data.layoutId !== undefined) patch.layoutId = data.layoutId;

  const [promo] = await db.update(promotions)
    .set(patch)
    .where(and(eq(promotions.id, promotionId), eq(promotions.tenantId, tenantId)))
    .returning();

  const slots = await syncPromotionSlots(db, promotionId, contentJson, layout.schemaJson);
  return { ...promo, contentJson, slots, layout };
}

async function deletePromotion(db, tenantId, promotionId) {
  await db.delete(promotions)
    .where(and(eq(promotions.id, promotionId), eq(promotions.tenantId, tenantId)));
  return { ok: true };
}

function isPromotionLive(promo, now = new Date()) {
  if (promo.status !== 'active' && promo.status !== 'scheduled') return false;
  if (promo.startsAt && new Date(promo.startsAt) > now) return false;
  if (promo.expiresAt && new Date(promo.expiresAt) <= now) return false;
  if (promo.status === 'scheduled' && promo.startsAt && new Date(promo.startsAt) <= now) return true;
  return promo.status === 'active';
}

async function getActivePromotions(db, tenantId, now = new Date()) {
  const rows = await db.select({
    promotion: promotions,
    layout: promotionLayouts,
  })
    .from(promotions)
    .innerJoin(promotionLayouts, eq(promotionLayouts.id, promotions.layoutId))
    .where(and(
      eq(promotions.tenantId, tenantId),
      or(eq(promotions.status, 'active'), eq(promotions.status, 'scheduled')),
    ))
    .orderBy(promotions.startsAt);

  const result = [];
  for (const row of rows) {
    if (!isPromotionLive(row.promotion, now)) continue;
    const slots = await db.select().from(promotionSlots)
      .where(eq(promotionSlots.promotionId, row.promotion.id))
      .orderBy(promotionSlots.sortOrder);

    result.push({
      ...row.promotion,
      contentJson: enrichContent(row.promotion.contentJson, row.layout.schemaJson),
      layout: row.layout,
      slots,
    });
  }
  return result;
}

async function getTenantWhatsAppPhone(db, tenantId) {
  const [wa] = await db.select().from(whatsappSessions).where(eq(whatsappSessions.tenantId, tenantId));
  if (wa?.connectedPhone) return wa.connectedPhone;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return tenant?.registeredPhone || null;
}

async function recordEvent(db, tenantId, { promotionId, slotId, eventType, sessionId, metadata }) {
  const [row] = await db.insert(promotionEvents).values({
    tenantId,
    promotionId: promotionId || null,
    slotId: slotId || null,
    eventType,
    sessionId: sessionId || null,
    metadata: metadata || null,
  }).returning();
  return row;
}

async function recordLead(db, tenantId, { promotionId, slotId, message, source, visitorSession }) {
  const [row] = await db.insert(promotionLeads).values({
    tenantId,
    promotionId: promotionId || null,
    slotId: slotId || null,
    message: message || null,
    source: source || 'whatsapp_cta',
    visitorSession: visitorSession || null,
  }).returning();
  return row;
}

async function getAnalytics(db, tenantId, { days = 30 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - Number(days));

  const [views] = await db.select({ total: count() }).from(promotionEvents)
    .where(and(
      eq(promotionEvents.tenantId, tenantId),
      eq(promotionEvents.eventType, 'page_view'),
      gte(promotionEvents.createdAt, since),
    ));

  const [clicks] = await db.select({ total: count() }).from(promotionEvents)
    .where(and(
      eq(promotionEvents.tenantId, tenantId),
      eq(promotionEvents.eventType, 'cta_click'),
      gte(promotionEvents.createdAt, since),
    ));

  const [leads] = await db.select({ total: count() }).from(promotionLeads)
    .where(and(
      eq(promotionLeads.tenantId, tenantId),
      gte(promotionLeads.createdAt, since),
    ));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [viewsToday] = await db.select({ total: count() }).from(promotionEvents)
    .where(and(
      eq(promotionEvents.tenantId, tenantId),
      eq(promotionEvents.eventType, 'page_view'),
      gte(promotionEvents.createdAt, todayStart),
    ));

  const recentLeads = await db.select({
    id: promotionLeads.id,
    message: promotionLeads.message,
    source: promotionLeads.source,
    createdAt: promotionLeads.createdAt,
    promotionTitle: promotions.title,
    slotLabel: promotionSlots.label,
  })
    .from(promotionLeads)
    .leftJoin(promotions, eq(promotions.id, promotionLeads.promotionId))
    .leftJoin(promotionSlots, eq(promotionSlots.id, promotionLeads.slotId))
    .where(eq(promotionLeads.tenantId, tenantId))
    .orderBy(desc(promotionLeads.createdAt))
    .limit(50);

  return {
    views: Number(views?.total || 0),
    clicks: Number(clicks?.total || 0),
    leads: Number(leads?.total || 0),
    viewsToday: Number(viewsToday?.total || 0),
    recentLeads,
  };
}

async function expirePromotionsAndActivate(db, now = new Date()) {
  const toExpire = await db.select().from(promotions)
    .where(and(
      or(eq(promotions.status, 'active'), eq(promotions.status, 'scheduled')),
      lte(promotions.expiresAt, now),
    ));

  for (const p of toExpire) {
    await db.update(promotions)
      .set({ status: 'expired', updatedAt: now })
      .where(eq(promotions.id, p.id));
  }

  const toActivate = await db.select().from(promotions)
    .where(and(
      eq(promotions.status, 'scheduled'),
      lte(promotions.startsAt, now),
      or(isNull(promotions.expiresAt), gte(promotions.expiresAt, now)),
    ));

  for (const p of toActivate) {
    await db.update(promotions)
      .set({ status: 'active', updatedAt: now })
      .where(eq(promotions.id, p.id));
  }

  return { expired: toExpire.length, activated: toActivate.length };
}

module.exports = {
  listLayouts,
  listPromotions,
  getPromotionWithLayout,
  createPromotion,
  updatePromotion,
  deletePromotion,
  getActivePromotions,
  getTenantWhatsAppPhone,
  recordEvent,
  recordLead,
  getAnalytics,
  expirePromotionsAndActivate,
  syncPromotionSlots,
  enrichContent,
  isPromotionLive,
};
