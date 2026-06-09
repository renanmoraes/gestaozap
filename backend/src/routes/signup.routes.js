const router = require('express').Router();
const { eq, and } = require('drizzle-orm');
const { getDb } = require('../db');
const {
  tenants, companies, users, userCompany, whatsappSessions, affiliates, affiliateReferrals,
} = require('../db/schema');
const { hashPassword, generateUniqueCompanyId } = require('../services/auth.service');
const { generateUniqueSlug } = require('../utils/slug.util');
const { validateDocument, onlyDigits } = require('../utils/document.util');
const { sendSignupReceived } = require('../services/signup-email.service');
const { parseCookies } = require('../utils/cookie.util');

// POST /api/signup — pré-cadastro self-service (cria conta 'pending', sem contrato)
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const {
      documentType, document, name, whatsapp, email, password, affiliateCode,
    } = req.body || {};

    // Validações
    if (!['cpf', 'cnpj'].includes(documentType)) return res.status(400).json({ error: 'Tipo de documento inválido' });
    if (!validateDocument(documentType, document)) return res.status(400).json({ error: 'Documento inválido' });
    if (!name || !whatsapp) return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios' });
    const normEmail = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normEmail)) return res.status(400).json({ error: 'Email inválido' });
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'Senha deve ter ao menos 8 caracteres' });

    // Email único
    const [emailHit] = await db.select({ id: users.id }).from(users).where(eq(users.email, normEmail));
    if (emailHit) return res.status(409).json({ error: 'Email já cadastrado' });

    // Afiliado (opcional) — cookie httpOnly prevalece sobre o body (código travado)
    const cookies = parseCookies(req);
    const lockedRef = cookies.gz_aff_ref ? String(cookies.gz_aff_ref).trim().toUpperCase() : null;
    const resolvedAffiliateCode = lockedRef || (affiliateCode ? String(affiliateCode).trim().toUpperCase() : null);

    let affiliate = null;
    if (resolvedAffiliateCode) {
      [affiliate] = await db.select().from(affiliates)
        .where(and(eq(affiliates.code, resolvedAffiliateCode), eq(affiliates.active, true)));
      if (!affiliate) return res.status(400).json({ error: 'Código de afiliado inválido' });
    }

    const slug = await generateUniqueSlug(db, name);
    const companyId = await generateUniqueCompanyId(db);
    const passwordHash = await hashPassword(password);

    // Transação: tenant(pending) + company + user + user_company + wa_session + referral
    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({
        slug,
        name,
        registeredPhone: onlyDigits(whatsapp),
        active: false,
        approvalStatus: 'pending',
        document: onlyDigits(document),
        documentType,
        affiliateCode: affiliate?.code || null,
        affiliateId: affiliate?.id || null,
      }).returning();

      const [company] = await tx.insert(companies).values({
        companyId, tenantId: tenant.id, name, active: true,
      }).returning();

      const [user] = await tx.insert(users).values({
        email: normEmail, passwordHash, mustChangePwd: false, active: true,
      }).returning();

      await tx.insert(userCompany).values({ userId: user.id, companyId: company.id, role: 'owner' });
      await tx.insert(whatsappSessions).values({ tenantId: tenant.id, status: 'disconnected' });

      if (affiliate) {
        await tx.insert(affiliateReferrals).values({
          affiliateId: affiliate.id,
          tenantId: tenant.id,
          commissionPct: String(affiliate.commissionPct),
          discountPct: String(affiliate.discountPct),
          status: 'pending',
        });
      }
      return { tenant };
    });

    sendSignupReceived(normEmail, name).catch(() => {});

    res.status(201).json({ tenantId: result.tenant.id, slug: result.tenant.slug, status: 'pending' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Dados já cadastrados (slug ou email)' });
    console.error('[signup] erro:', err);
    res.status(500).json({ error: 'Erro ao processar cadastro' });
  }
});

module.exports = router;
