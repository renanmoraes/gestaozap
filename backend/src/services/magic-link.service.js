const { createHash, randomBytes } = require('crypto');
const { Resend } = require('resend');
const { eq, and } = require('drizzle-orm');
const { getDb } = require('../db');
const { magicLinkTokens, tenantUsers } = require('../db/schema');

const resend = new Resend(process.env.RESEND_API_KEY);

async function generateMagicLink(tenantId, email, tenantName, tenantSlug) {
  try {
    // Cria token único
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    const db = getDb();

    // Salva token no banco
    await db.insert(magicLinkTokens).values({
      tenantId,
      email,
      tokenHash,
      expiresAt,
    });

    // Monta a URL do magic link
    const baseUrl = process.env.VITE_API_URL || 'https://gestaozap.digital';
    const protocol = baseUrl.startsWith('https') ? 'https' : 'http';
    const domainPart = baseUrl.replace(/^https?:\/\//, '').split(':')[0];

    // Se tiver subdomínio no tenantSlug, usa; senão, usa domínio raiz
    const magicLinkUrl = tenantSlug && tenantSlug !== 'default'
      ? `${protocol}://${tenantSlug}.${domainPart}/auth/magic-link?token=${rawToken}`
      : `${protocol}://${domainPart}/auth/magic-link?token=${rawToken}`;

    // Envia email via Resend
    const emailResponse = await resend.emails.send({
      from: `noreply@${domainPart.replace(/gestaozap\./, '')}gestaozap.digital`,
      to: email,
      subject: `Seu link de acesso - ${tenantName || 'GestãoZap'}`,
      html: `
        <h2>Bem-vindo ao ${tenantName || 'GestãoZap'}!</h2>
        <p>Clique no link abaixo para acessar sua conta:</p>
        <p><a href="${magicLinkUrl}" style="background-color: #10b981; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; display: inline-block;">Acessar Conta</a></p>
        <p>Este link expira em 15 minutos.</p>
        <p>Se você não solicitou este email, pode ignorá-lo com segurança.</p>
      `,
    });

    if (emailResponse.error) {
      throw new Error(`Erro ao enviar email: ${emailResponse.error.message}`);
    }

    return { success: true, messageId: emailResponse.data.id };
  } catch (err) {
    console.error('[magic-link] erro ao gerar magic link:', err.message);
    throw err;
  }
}

async function verifyMagicLink(tenantId, rawToken) {
  try {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const db = getDb();

    // Busca o token
    const [tokenRecord] = await db
      .select()
      .from(magicLinkTokens)
      .where(
        and(
          eq(magicLinkTokens.tenantId, tenantId),
          eq(magicLinkTokens.tokenHash, tokenHash),
        ),
      );

    if (!tokenRecord) {
      return { valid: false, error: 'Token inválido' };
    }

    // Verifica expiração
    if (new Date() > tokenRecord.expiresAt) {
      return { valid: false, error: 'Token expirado' };
    }

    // Verifica se já foi usado
    if (tokenRecord.usedAt) {
      return { valid: false, error: 'Token já foi utilizado' };
    }

    // Marca como usado
    await db
      .update(magicLinkTokens)
      .set({ usedAt: new Date() })
      .where(eq(magicLinkTokens.id, tokenRecord.id));

    // Verifica se o usuário existe, senão cria
    const [existingUser] = await db
      .select()
      .from(tenantUsers)
      .where(
        and(
          eq(tenantUsers.tenantId, tenantId),
          eq(tenantUsers.email, tokenRecord.email),
        ),
      );

    if (!existingUser) {
      // Primeiro acesso = cria o usuário
      await db.insert(tenantUsers).values({
        tenantId,
        email: tokenRecord.email,
        role: 'owner',
        active: true,
      });
    }

    return { valid: true, email: tokenRecord.email };
  } catch (err) {
    console.error('[magic-link] erro ao verificar token:', err.message);
    return { valid: false, error: 'Erro interno' };
  }
}

module.exports = { generateMagicLink, verifyMagicLink };
