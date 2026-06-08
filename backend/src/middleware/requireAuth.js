const { validateSession } = require('../services/auth.service');

/**
 * Valida Bearer token em user_sessions.
 * Popula req.user, req.company, req.tenant (se houver), req.authSession.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Autenticação necessária', code: 'UNAUTHORIZED' });
    }

    const rawToken = authHeader.slice(7);
    const auth = await validateSession(rawToken);

    if (!auth) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada', code: 'SESSION_EXPIRED' });
    }

    req.authSession = auth.session;
    req.user = auth.user;
    req.company = auth.company;
    req.authTenant = auth.tenant;
    next();
  } catch (err) {
    console.error('[requireAuth]', err.message);
    res.status(500).json({ error: 'Erro interno de autenticação' });
  }
}

module.exports = requireAuth;
