const { eq } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { tenants } = require('../db/schema');

/**
 * Resolve o tenant a partir do header X-Tenant-Slug (injetado pelo Nginx).
 * Em dev (sem Nginx), cai no tenant padrão quando não há header.
 * Seta req.tenant com os dados do tenant.
 */
async function tenantResolver(req, res, next) {
  try {
    const slug = req.headers['x-tenant-slug'];

    // Modo dev: sem header → usa o tenant padrão
    if (!slug) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(400).json({ error: 'Subdomínio não identificado' });
      }
      const db = getDb();
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, DEFAULT_TENANT_ID));
      req.tenant = tenant || { id: DEFAULT_TENANT_ID };
      return next();
    }

    const db = getDb();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));

    if (!tenant) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }
    if (!tenant.active) {
      return res.status(403).json({ error: 'Conta inativa ou plano expirado', code: 'TENANT_INACTIVE' });
    }

    req.tenant = tenant;
    next();
  } catch (err) {
    console.error('[tenantResolver]', err.message);
    res.status(500).json({ error: 'Erro interno ao resolver conta' });
  }
}

module.exports = tenantResolver;
