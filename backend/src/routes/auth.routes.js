const router = require('express').Router();
const { createHash, randomBytes } = require('crypto');
const { eq, and, gt } = require('drizzle-orm');
const { getDb } = require('../db');
const { tenants, tenantSessions } = require('../db/schema');
const { getConfig } = require('../config/platform');
const tenantResolver = require('../middleware/tenantResolver');
const { generateMagicLink, verifyMagicLink } = require('../services/magic-link.service');

function generateToken() {
  return randomBytes(32).toString('hex');
}

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

// Todas as rotas de auth precisam do tenantResolver
router.use(tenantResolver);

/**
 * POST /api/auth/send-magic-link
 * Envia um magic link por email para o usuário fazer login.
 * Body: { email }
 */
router.post('/send-magic-link', async (req, res) => {
  try {
    const { email } = req.body;
    const tenant = req.tenant;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    if (!tenant || !tenant.id) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    await generateMagicLink(tenant.id, email, tenant.name, tenant.slug);

    res.json({
      ok: true,
      message: `Link de acesso enviado para ${email}. Verifique seu email (e spam) nos próximos minutos.`,
    });
  } catch (err) {
    console.error('auth send-magic-link:', err);
    res.status(500).json({ error: 'Erro ao enviar email. Tente novamente em alguns instantes.' });
  }
});

/**
 * POST /api/auth/verify-magic-link
 * Valida o token do magic link e cria uma sessão.
 * Body: { token }
 */
router.post('/verify-magic-link', async (req, res) => {
  try {
    const { token } = req.body;
    const tenant = req.tenant;

    if (!token) {
      return res.status(400).json({ error: 'Token não fornecido' });
    }

    if (!tenant || !tenant.id) {
      return res.status(404).json({ error: 'Conta não encontrada' });
    }

    // Verifica o magic link
    const validation = await verifyMagicLink(tenant.id, token);
    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    // Cria sessão tenant
    const db = getDb();
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
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
      email: validation.email,
      termsAccepted,
      termsVersion,
      expiresAt,
    });
  } catch (err) {
    console.error('auth verify-magic-link:', err);
    res.status(500).json({ error: err.message });
  }
});

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
