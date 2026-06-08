const router = require('express').Router();
const { createHash, randomBytes } = require('crypto');
const { eq, and, gt } = require('drizzle-orm');
const { getDb } = require('../db');
const { tenants, tenantSessions } = require('../db/schema');
const { getConfig } = require('../config/platform');
const tenantResolver = require('../middleware/tenantResolver');

function generateToken() {
  return randomBytes(32).toString('hex');
}

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

// Todas as rotas de auth precisam do tenantResolver
router.use(tenantResolver);

/**
 * POST /api/auth/login
 * Cria uma sessão para o tenant atual (identificado pelo subdomínio).
 * Retorna token + se os termos foram aceitos.
 */
router.post('/login', async (req, res) => {
  try {
    const db = getDb();
    const tenant = req.tenant;

    if (!tenant || !tenant.id) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

    await db.insert(tenantSessions).values({
      tenantId: tenant.id,
      tokenHash,
      expiresAt,
    });

    const termsVersion = getConfig('terms_current_version', '1.0');
    const termsAccepted = Boolean(tenant.termsAcceptedAt) && tenant.termsVersion === termsVersion;

    res.json({
      token: rawToken,
      tenantId: tenant.id,
      tenantName: tenant.name,
      termsAccepted,
      termsVersion,
      expiresAt,
    });
  } catch (err) {
    console.error('auth login:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/terms
 * Registra aceite dos termos para o tenant atual.
 * Pode ser chamado sem token (antes do login) ou com token.
 */
router.post('/terms', async (req, res) => {
  try {
    const db = getDb();
    const tenant = req.tenant;
    if (!tenant || !tenant.id) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    const termsVersion = getConfig('terms_current_version', '1.0');
    await db.update(tenants)
      .set({ termsAcceptedAt: new Date(), termsVersion, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id));

    res.json({ ok: true, termsVersion, acceptedAt: new Date() });
  } catch (err) {
    console.error('auth terms:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/logout
 * Invalida o token atual (deleta da tabela).
 */
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7);
      const tokenHash = hashToken(rawToken);
      const db = getDb();
      await db.delete(tenantSessions).where(eq(tenantSessions.tokenHash, tokenHash));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('auth logout:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me
 * Retorna dados do tenant atual + status da sessão.
 */
router.get('/me', async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant) return res.status(401).json({ error: 'Não autenticado' });

    const termsVersion = getConfig('terms_current_version', '1.0');
    res.json({
      tenantId: tenant.id,
      tenantName: tenant.name,
      slug: tenant.slug,
      registeredPhone: tenant.registeredPhone,
      termsAccepted: Boolean(tenant.termsAcceptedAt) && tenant.termsVersion === termsVersion,
      termsVersion,
    });
  } catch (err) {
    console.error('auth me:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
