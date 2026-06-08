const router = require('express').Router();
const { eq } = require('drizzle-orm');
const { getDb } = require('../db');
const { users, companies, userCompany } = require('../db/schema');
const { login, createSession, changePassword } = require('../services/auth.service');

/**
 * POST /api/auth-new/login
 * Body: { companyId: number, email: string, password: string }
 */
router.post('/login', async (req, res) => {
  try {
    const { companyId, email, password } = req.body;

    if (!companyId || !email || !password) {
      return res.status(400).json({ error: 'Dados de login incompletos' });
    }

    // Valida o login
    const result = await login(companyId, email, password);
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    // Cria a sessão
    const session = await createSession(result.user.id, companyId);

    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: result.user,
      company: result.company,
    });
  } catch (err) {
    console.error('auth-new login:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth-new/change-password
 * Body: { oldPassword: string, newPassword: string }
 * Header: Authorization: Bearer <token>
 */
router.post('/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Autenticação necessária' });
    }

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Senhas não fornecidas' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 8 caracteres' });
    }

    // TODO: Validar token e extrair userId
    // Por enquanto, retorna erro
    return res.status(501).json({ error: 'Endpoint em desenvolvimento' });
  } catch (err) {
    console.error('auth-new change-password:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/auth-new/me
 * Retorna dados do usuário autenticado
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Autenticação necessária' });
    }

    // TODO: Validar token e retornar usuário
    return res.status(501).json({ error: 'Endpoint em desenvolvimento' });
  } catch (err) {
    console.error('auth-new me:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
