const { eq, desc } = require('drizzle-orm');
const requireAuth = require('./requireAuth');
const { getDb } = require('../db');
const { contracts } = require('../db/schema');
const { tenantAccessState } = require('../utils/access.util');

/**
 * Valida token, confirma que a empresa do usuário pertence ao tenant do subdomínio,
 * e aplica o gate de acesso ao produto (aprovação + contrato vigente).
 */
async function requireTenant(req, res, next) {
  await requireAuth(req, res, async () => {
    if (!req.tenant?.id) {
      return res.status(400).json({ error: 'Conta não identificada' });
    }

    if (req.company?.tenantId !== req.tenant.id) {
      return res.status(403).json({ error: 'Token não pertence a esta conta', code: 'TENANT_MISMATCH' });
    }

    // Gate de acesso: aprovação + contrato vigente. Retorna o código de estado
    // para o frontend escolher a tela (pending_approval / rejected / trial_expired / no_contract).
    try {
      const db = getDb();
      const [contract] = await db.select().from(contracts)
        .where(eq(contracts.tenantId, req.tenant.id))
        .orderBy(desc(contracts.createdAt))
        .limit(1);

      const state = tenantAccessState(req.tenant, contract);
      if (state !== 'active') {
        return res.status(403).json({ error: 'Acesso indisponível', state });
      }
    } catch (err) {
      console.error('[requireTenant] gate error:', err.message);
      return res.status(500).json({ error: 'Erro ao verificar acesso' });
    }

    req.session = req.authSession;
    next();
  });
}

module.exports = requireTenant;
