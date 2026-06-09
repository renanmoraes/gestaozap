const router = require('express').Router();
const { eq } = require('drizzle-orm');
const { getDb } = require('../db');
const { tenants } = require('../db/schema');
const { getConfig } = require('../config/platform');
const tenantResolver = require('../middleware/tenantResolver');
const requireAuth = require('../middleware/requireAuth');
const {
  login,
  createSession,
  validateSession,
  logout,
  changePassword,
} = require('../services/auth.service');

function isAdminHost(req) {
  const slug = req.headers['x-tenant-slug'];
  if (slug === 'admin') return true;
  const host = String(req.headers.host || '').split(':')[0];
  return host.split('.')[0] === 'admin';
}

function buildAuthResponse(auth, session) {
  const termsVersion = getConfig('terms_current_version', '2.0');
  const tenant = auth.tenant;
  const termsAccepted = tenant
    ? Boolean(tenant.termsAcceptedAt) && tenant.termsVersion === termsVersion
    : true;

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: auth.user,
    company: auth.company,
    tenantId: tenant?.id || null,
    tenantName: tenant?.name || auth.company.name,
    slug: tenant?.slug || null,
    registeredPhone: tenant?.registeredPhone || null,
    termsAccepted,
    termsVersion,
  };
}

/**
 * POST /api/auth/login
 * Body: { companyId, email, password }
 */
router.post('/login', tenantResolver, async (req, res) => {
  try {
    const { companyId, email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await login(companyId ?? '', email, password, {
      tenantId: req.tenant?.id || null,
      isAdminHost: isAdminHost(req) || Boolean(req.isAdminHost),
    });

    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    const session = await createSession(result.user.id, result.company.id);
    res.json(buildAuthResponse(result, session));
  } catch (err) {
    console.error('auth login:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const termsVersion = getConfig('terms_current_version', '2.0');
    const tenant = req.authTenant;

    if (tenant && req.headers['x-tenant-slug'] && req.headers['x-tenant-slug'] !== 'admin') {
      const db = getDb();
      const [resolved] = await db.select().from(tenants).where(eq(tenants.slug, req.headers['x-tenant-slug']));
      if (resolved && tenant.id !== resolved.id) {
        return res.status(403).json({ error: 'Sessão não pertence a esta conta', code: 'TENANT_MISMATCH' });
      }
    }

    res.json({
      user: req.user,
      company: req.company,
      tenantId: tenant?.id || null,
      tenantName: tenant?.name || req.company.name,
      slug: tenant?.slug || null,
      registeredPhone: tenant?.registeredPhone || null,
      termsAccepted: tenant
        ? Boolean(tenant.termsAcceptedAt) && tenant.termsVersion === termsVersion
        : true,
      termsVersion,
    });
  } catch (err) {
    console.error('auth me:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Senhas não fornecidas' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 8 caracteres' });
    }

    const result = await changePassword(req.user.id, oldPassword, newPassword);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('auth change-password:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/terms
 */
router.post('/terms', tenantResolver, requireAuth, async (req, res) => {
  try {
    const tenant = req.authTenant || req.tenant;
    if (!tenant?.id) {
      return res.status(400).json({ error: 'Termos aplicáveis apenas a contas de cliente' });
    }

    const db = getDb();
    const termsVersion = getConfig('terms_current_version', '2.0');
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
 */
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      await logout(authHeader.slice(7));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('auth logout:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
