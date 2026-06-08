const requireAuth = require('./requireAuth');

/**
 * Valida token e confirma que a empresa do usuário pertence ao tenant do subdomínio.
 */
async function requireTenant(req, res, next) {
  await requireAuth(req, res, () => {
    if (!req.tenant?.id) {
      return res.status(400).json({ error: 'Conta não identificada' });
    }

    if (req.company?.tenantId !== req.tenant.id) {
      return res.status(403).json({ error: 'Token não pertence a esta conta', code: 'TENANT_MISMATCH' });
    }

    req.session = req.authSession;
    next();
  });
}

module.exports = requireTenant;
