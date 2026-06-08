const { createHash } = require('crypto');
const { and, eq, gt } = require('drizzle-orm');
const { getDb } = require('../db');
const { tenantSessions } = require('../db/schema');

/**
 * Valida o token Bearer e confirma que pertence ao tenant de req.tenant.
 * Requer que tenantResolver já tenha rodado antes.
 */
async function requireTenant(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Autenticação necessária', code: 'UNAUTHORIZED' });
    }

    const rawToken = authHeader.slice(7);
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const db = getDb();
    const [session] = await db.select().from(tenantSessions)
      .where(and(
        eq(tenantSessions.tokenHash, tokenHash),
        gt(tenantSessions.expiresAt, new Date()),
      ));

    if (!session) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada', code: 'SESSION_EXPIRED' });
    }

    if (req.tenant && session.tenantId !== req.tenant.id) {
      return res.status(403).json({ error: 'Token não pertence a esta conta', code: 'TENANT_MISMATCH' });
    }

    req.session = session;
    next();
  } catch (err) {
    console.error('[requireTenant]', err.message);
    res.status(500).json({ error: 'Erro interno de autenticação' });
  }
}

module.exports = requireTenant;
