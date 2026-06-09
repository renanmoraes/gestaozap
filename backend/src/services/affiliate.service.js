const { eq, and, ne, sql } = require('drizzle-orm');
const { affiliates, tenants } = require('../db/schema');

async function assertTenantLinkable(db, tenantId, excludeAffiliateId = null) {
  if (!tenantId) return null;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) {
    const err = new Error('Cliente não encontrado');
    err.status = 404;
    throw err;
  }
  if (tenant.approvalStatus !== 'approved' || !tenant.active) {
    const err = new Error('Só é possível vincular clientes aprovados e ativos');
    err.status = 400;
    throw err;
  }

  const conditions = [eq(affiliates.tenantId, tenantId)];
  if (excludeAffiliateId) conditions.push(ne(affiliates.id, excludeAffiliateId));

  const [existing] = await db.select({ id: affiliates.id }).from(affiliates).where(and(...conditions));
  if (existing) {
    const err = new Error('Este cliente já está vinculado a outro afiliado');
    err.status = 409;
    throw err;
  }

  return tenant;
}

async function fillAffiliateFromTenant(db, tenantId, { name, email }) {
  const updates = {};
  if (!name || !email) {
    const owner = await db.execute(sql`
      SELECT u.email, t.name
      FROM users u
      JOIN user_company uc ON uc.user_id = u.id
      JOIN companies c ON c.id = uc.company_id
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.tenant_id = ${tenantId} AND uc.role = 'owner'
      LIMIT 1
    `).then((r) => r.rows[0]);

    if (!name && owner?.name) updates.name = owner.name;
    if (!email && owner?.email) updates.email = owner.email;
  }
  return updates;
}

async function getAffiliateByTenantId(db, tenantId) {
  const [row] = await db.select().from(affiliates)
    .where(and(eq(affiliates.tenantId, tenantId), eq(affiliates.active, true)));
  return row || null;
}

async function getAffiliateDashboard(db, affiliateId) {
  const statsRow = await db.execute(sql`
    SELECT
      COUNT(r.id)::int AS signups,
      COUNT(r.id) FILTER (WHERE t.approval_status = 'approved')::int AS approved,
      COUNT(r.id) FILTER (WHERE r.status = 'pending')::int AS pending_referrals,
      COALESCE(SUM(r.commission_brl), 0) AS earned_brl,
      COALESCE(SUM(r.commission_brl) FILTER (WHERE r.status IN ('pending', 'confirmed')), 0) AS pending_brl,
      COALESCE(SUM(r.commission_brl) FILTER (WHERE r.status = 'paid'), 0) AS paid_brl
    FROM affiliate_referrals r
    JOIN tenants t ON t.id = r.tenant_id
    WHERE r.affiliate_id = ${affiliateId}
  `).then((r) => r.rows[0]);

  const referrals = await db.execute(sql`
    SELECT
      r.id, r.status, r.commission_brl, r.created_at, r.confirmed_at, r.paid_at,
      t.name AS tenant_name, t.slug AS tenant_slug, t.approval_status
    FROM affiliate_referrals r
    JOIN tenants t ON t.id = r.tenant_id
    WHERE r.affiliate_id = ${affiliateId}
    ORDER BY r.created_at DESC
    LIMIT 50
  `).then((r) => r.rows);

  return { stats: statsRow, referrals };
}

module.exports = {
  assertTenantLinkable,
  fillAffiliateFromTenant,
  getAffiliateByTenantId,
  getAffiliateDashboard,
};
