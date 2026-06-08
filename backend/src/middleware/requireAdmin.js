const { createHash } = require('crypto');
const { and, eq, gt } = require('drizzle-orm');
const { getDb } = require('../db');
const { adminSessions } = require('../db/schema');

/**
 * Valida o token de sessão administrativa.
 * Token gerado em POST /api/admin/login.
 */
async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers['x-admin-token'] || '';
    const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!raw) {
      return res.status(401).json({ error: 'Acesso administrativo necessário', code: 'ADMIN_UNAUTHORIZED' });
    }

    const sessionHash = createHash('sha256').update(raw).digest('hex');
    const db = getDb();
    const [session] = await db.select().from(adminSessions)
      .where(and(
        eq(adminSessions.sessionHash, sessionHash),
        gt(adminSessions.expiresAt, new Date()),
      ));

    if (!session) {
      return res.status(401).json({ error: 'Sessão administrativa inválida ou expirada', code: 'ADMIN_SESSION_EXPIRED' });
    }

    req.adminSession = session;
    next();
  } catch (err) {
    console.error('[requireAdmin]', err.message);
    res.status(500).json({ error: 'Erro interno de autenticação admin' });
  }
}

module.exports = requireAdmin;
