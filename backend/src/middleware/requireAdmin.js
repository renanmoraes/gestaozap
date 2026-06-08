const requireAuth = require('./requireAuth');

/**
 * Exige sessão de usuário vinculada à empresa admin (company_id = 0) com role admin.
 */
async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (String(req.company?.companyId) !== '0') {
      return res.status(403).json({ error: 'Acesso administrativo necessário', code: 'ADMIN_UNAUTHORIZED' });
    }
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Permissão administrativa insuficiente', code: 'ADMIN_FORBIDDEN' });
    }
    req.adminSession = req.authSession;
    next();
  });
}

module.exports = requireAdmin;
