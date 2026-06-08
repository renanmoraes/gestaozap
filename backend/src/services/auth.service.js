const bcrypt = require('bcryptjs');
const { createHash, randomBytes } = require('crypto');
const { eq, and } = require('drizzle-orm');
const { getDb } = require('../db');
const { users, companies, userCompany, tenantSessions } = require('../db/schema');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function login(companyId, email, password) {
  try {
    const db = getDb();

    // Busca a empresa
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.companyId, companyId));

    if (!company || !company.active) {
      return { valid: false, error: 'Empresa não encontrada ou inativa' };
    }

    // Busca o usuário
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (!user || !user.active) {
      return { valid: false, error: 'Email ou senha incorretos' };
    }

    // Verifica se o usuário tem acesso a essa empresa
    const [userCompanyRecord] = await db
      .select()
      .from(userCompany)
      .where(
        and(
          eq(userCompany.userId, user.id),
          eq(userCompany.companyId, company.id),
        ),
      );

    if (!userCompanyRecord) {
      return { valid: false, error: 'Email ou senha incorretos' };
    }

    // Verifica a senha
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return { valid: false, error: 'Email ou senha incorretos' };
    }

    return {
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        mustChangePwd: user.mustChangePwd,
      },
      company: {
        id: company.id,
        companyId: company.companyId,
        name: company.name,
      },
    };
  } catch (err) {
    console.error('[auth.service] login error:', err.message);
    return { valid: false, error: 'Erro ao processar login' };
  }
}

async function createSession(userId, companyId) {
  try {
    const db = getDb();
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

    // Usa a tabela tenantSessions mas com um ID fictício para armazenar o token
    // (já que tenantSessions precisa de tenantId, vamos usar o companyId como fallback)
    const companyUuid = (await db.select().from(companies).where(eq(companies.companyId, companyId)))[0]?.id;

    await db.insert(tenantSessions).values({
      tenantId: companyUuid || '00000000-0000-0000-0000-000000000001',
      tokenHash,
      expiresAt,
    });

    return { token: rawToken, expiresAt };
  } catch (err) {
    console.error('[auth.service] createSession error:', err.message);
    throw err;
  }
}

async function changePassword(userId, oldPassword, newPassword) {
  try {
    const db = getDb();

    // Busca o usuário
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      return { valid: false, error: 'Usuário não encontrado' };
    }

    // Verifica a senha antiga
    const passwordValid = await verifyPassword(oldPassword, user.passwordHash);
    if (!passwordValid) {
      return { valid: false, error: 'Senha atual incorreta' };
    }

    // Atualiza com a nova senha
    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        mustChangePwd: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { valid: true };
  } catch (err) {
    console.error('[auth.service] changePassword error:', err.message);
    return { valid: false, error: 'Erro ao alterar senha' };
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  login,
  createSession,
  changePassword,
};
