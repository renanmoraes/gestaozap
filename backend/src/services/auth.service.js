const bcrypt = require('bcryptjs');
const { createHash, randomBytes } = require('crypto');
const { eq, and, gt } = require('drizzle-orm');
const { getDb } = require('../db');
const {
  users,
  companies,
  userCompany,
  userSessions,
  tenants,
} = require('../db/schema');

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let out = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

async function generateUniqueCompanyId(db) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const id = randomBytes(5).toString('hex').toUpperCase();
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.companyId, id))
      .limit(1);
    if (!existing) return id;
  }
  throw new Error('Não foi possível gerar identificador único da empresa');
}

/**
 * @param {string} companyId - identificador textual da empresa (company_id)
 */
async function login(companyId, email, password, context = {}) {
  try {
    const db = getDb();
    const normalizedId = String(companyId ?? '').trim();
    let company;

    if (normalizedId === '0') {
      // Admin: sentinela inalterada
      [company] = await db.select().from(companies).where(eq(companies.companyId, '0'));
    } else if (normalizedId) {
      // companyId explícito (compatibilidade)
      [company] = await db.select().from(companies).where(eq(companies.companyId, normalizedId));
    } else if (context.tenantId) {
      // Cliente via subdomínio: resolve a company pelo tenant (relação 1:1)
      [company] = await db.select().from(companies).where(eq(companies.tenantId, context.tenantId));
    } else {
      return { valid: false, error: 'Acesse pelo subdomínio da sua empresa' };
    }

    if (!company || !company.active) {
      return { valid: false, error: 'Empresa não encontrada ou inativa' };
    }

    // Cliente: company precisa pertencer ao tenant do subdomínio
    if (company.companyId !== '0') {
      if (!context.tenantId || company.tenantId !== context.tenantId) {
        return { valid: false, error: 'Email ou senha incorretos' };
      }
    } else if (!context.isAdminHost && process.env.NODE_ENV === 'production') {
      return { valid: false, error: 'Acesso administrativo apenas em admin.gestaozap.digital' };
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail));

    if (!user || !user.active) {
      return { valid: false, error: 'Email ou senha incorretos' };
    }

    const [userCompanyRecord] = await db
      .select()
      .from(userCompany)
      .where(and(eq(userCompany.userId, user.id), eq(userCompany.companyId, company.id)));

    if (!userCompanyRecord) {
      return { valid: false, error: 'Email ou senha incorretos' };
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return { valid: false, error: 'Email ou senha incorretos' };
    }

    let tenant = null;
    if (company.tenantId) {
      [tenant] = await db.select().from(tenants).where(eq(tenants.id, company.tenantId));
    }

    return {
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        mustChangePwd: user.mustChangePwd,
        role: userCompanyRecord.role,
      },
      company: {
        id: company.id,
        companyId: company.companyId,
        name: company.name,
        tenantId: company.tenantId,
      },
      tenant: tenant ? {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        registeredPhone: tenant.registeredPhone,
        termsAcceptedAt: tenant.termsAcceptedAt,
        termsVersion: tenant.termsVersion,
      } : null,
    };
  } catch (err) {
    console.error('[auth.service] login error:', err.message);
    return { valid: false, error: 'Erro ao processar login' };
  }
}

async function createSession(userId, companyUuid) {
  const db = getDb();
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(userSessions).values({
    userId,
    companyId: companyUuid,
    tokenHash,
    expiresAt,
  });

  return { token: rawToken, expiresAt };
}

async function validateSession(rawToken) {
  if (!rawToken) return null;

  const db = getDb();
  const tokenHash = hashToken(rawToken);

  const [session] = await db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.tokenHash, tokenHash), gt(userSessions.expiresAt, new Date())));

  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || !user.active) return null;

  const [company] = await db.select().from(companies).where(eq(companies.id, session.companyId));
  if (!company || !company.active) return null;

  const [userCompanyRecord] = await db
    .select()
    .from(userCompany)
    .where(and(eq(userCompany.userId, user.id), eq(userCompany.companyId, company.id)));

  if (!userCompanyRecord) return null;

  let tenant = null;
  if (company.tenantId) {
    [tenant] = await db.select().from(tenants).where(eq(tenants.id, company.tenantId));
  }

  return {
    session,
    user: {
      id: user.id,
      email: user.email,
      mustChangePwd: user.mustChangePwd,
      role: userCompanyRecord.role,
    },
    company: {
      id: company.id,
      companyId: company.companyId,
      name: company.name,
      tenantId: company.tenantId,
    },
    tenant,
  };
}

async function logout(rawToken) {
  if (!rawToken) return;
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  await db.delete(userSessions).where(eq(userSessions.tokenHash, tokenHash));
}

async function changePassword(userId, oldPassword, newPassword) {
  try {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      return { valid: false, error: 'Usuário não encontrado' };
    }

    const passwordValid = await verifyPassword(oldPassword, user.passwordHash);
    if (!passwordValid) {
      return { valid: false, error: 'Senha atual incorreta' };
    }

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

/**
 * Provisiona company + user para um tenant recém-criado.
 */
async function provisionClientAccess({ tenantId, tenantName, contactEmail, tempPassword }) {
  const db = getDb();
  const nextCompanyId = await generateUniqueCompanyId(db);
  const normalizedEmail = contactEmail.trim().toLowerCase();
  const password = tempPassword || generateTempPassword();
  const passwordHash = await hashPassword(password);

  const [company] = await db.insert(companies).values({
    companyId: nextCompanyId,
    tenantId,
    name: tenantName,
    active: true,
  }).returning();

  const [user] = await db.insert(users).values({
    email: normalizedEmail,
    passwordHash,
    mustChangePwd: true,
    active: true,
  }).returning();

  await db.insert(userCompany).values({
    userId: user.id,
    companyId: company.id,
    role: 'owner',
  });

  return {
    companyId: nextCompanyId,
    companyUuid: company.id,
    userId: user.id,
    email: normalizedEmail,
    tempPassword: password,
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashToken,
  generateTempPassword,
  getNextClientCompanyId: generateUniqueCompanyId,
  generateUniqueCompanyId,
  login,
  createSession,
  validateSession,
  logout,
  changePassword,
  provisionClientAccess,
};
