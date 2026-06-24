const bcrypt = require('bcryptjs');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

const DEFAULT_CONFIGS = [
  { key: 'batch_size', value: '30', description: 'Mensagens por lote antes da pausa anti-ban' },
  { key: 'batch_pause_ms', value: '600000', description: 'Duração da pausa entre lotes (ms) — padrão 10 min' },
  { key: 'antiban_delay_min_ms', value: '15000', description: 'Delay mínimo entre mensagens (ms)' },
  { key: 'antiban_delay_max_ms', value: '60000', description: 'Delay máximo entre mensagens (ms)' },
  { key: 'hour_start_default', value: '8', description: 'Hora de início padrão para envios (0-23)' },
  { key: 'hour_end_default', value: '20', description: 'Hora de fim padrão para envios (0-23)' },
  { key: 'resend_safe_days', value: '30', description: 'Janela segura (dias): bloqueia reselecionar na tela de Disparo um contato já enviado há menos desse período' },
  { key: 'max_consecutive_failures', value: '3', description: 'Falhas consecutivas antes de pausar envio' },
  { key: 'failure_pause_ms', value: '300000', description: 'Pausa após falhas consecutivas (ms) — padrão 5 min' },
  { key: 'backup_retention', value: '7', description: 'Número de backups automáticos a manter' },
  { key: 'backup_auto_hour', value: '3', description: 'Hora do backup automático diário (0-23, horário SP)' },
  { key: 'terms_current_version', value: '2.0', description: 'Versão atual dos termos de uso' },
  { key: 'trial_days', value: '7', description: 'Dias de trial grátis após aprovação do cadastro' },

  // Storage — fotos/áudios/anexos
  { key: 'storage_provider',  value: 'local', description: 'Provider de storage: "local" ou "r2" (Cloudflare R2)' },
  { key: 'r2_account_id',     value: '',      description: 'Cloudflare R2 — Account ID (encontra no dashboard)' },
  { key: 'r2_access_key',     value: '',      description: 'Cloudflare R2 — Access Key ID' },
  { key: 'r2_secret_key',     value: '',      description: 'Cloudflare R2 — Secret Access Key' },
  { key: 'r2_bucket',         value: '',      description: 'Cloudflare R2 — Nome do bucket' },
  { key: 'r2_public_url',     value: '',      description: 'Cloudflare R2 — URL pública (ex.: https://pub-xxx.r2.dev ou domínio custom)' },
];

const DEFAULT_PLANS = [
  { slug: 'starter', name: 'Starter', price_brl: '97.00', messages_per_month: 500 },
  { slug: 'pro', name: 'Pro', price_brl: '197.00', messages_per_month: 2000 },
  { slug: 'business', name: 'Business', price_brl: '397.00', messages_per_month: null },
];

async function seedPlatformConfig(pool) {
  const client = await pool.connect();
  try {
    for (const cfg of DEFAULT_CONFIGS) {
      await client.query(`
        INSERT INTO platform_config (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING
      `, [cfg.key, cfg.value, cfg.description]);
    }
    for (const plan of DEFAULT_PLANS) {
      await client.query(`
        INSERT INTO plans (slug, name, price_brl, messages_per_month, features)
        VALUES ($1, $2, $3, $4, '{}')
        ON CONFLICT (slug) DO NOTHING
      `, [plan.slug, plan.name, plan.price_brl, plan.messages_per_month]);
    }
    await client.query(`UPDATE plans SET overage_price_brl = 0.10, max_concurrent_sends = 1 WHERE slug = 'starter';`);
    await client.query(`UPDATE plans SET overage_price_brl = 0.08, max_concurrent_sends = 3 WHERE slug = 'pro';`);
    await client.query(`UPDATE plans SET overage_price_brl = NULL, max_concurrent_sends = 10 WHERE slug = 'business';`);
    console.log('[db] seeds aplicados');
  } finally {
    client.release();
  }
}

async function seedAdminCompanyAndUser(pool) {
  const client = await pool.connect();
  try {
    // Empresa admin (ID 0) — é SEMPRE só admin, NUNCA vinculada a um tenant de negócio.
    // (O login trava company '0' fora do host admin; se um tenant de negócio apontar
    // para ela, o cliente desse tenant fica preso na trava de admin.)
    const companyResult = await client.query(`
      INSERT INTO companies (company_id, name, active)
      VALUES ('0', 'GestãoZap - Administração', true)
      ON CONFLICT (company_id) DO NOTHING
      RETURNING id
    `);

    let companyId = null;
    if (companyResult.rows.length > 0) {
      companyId = companyResult.rows[0].id;
      console.log('[db] empresa admin criada: ID 0');
    } else {
      // Garante que a empresa admin esteja desvinculada de qualquer tenant
      const decoupled = await client.query(`
        UPDATE companies SET tenant_id = NULL
        WHERE company_id = '0' AND tenant_id IS NOT NULL
        RETURNING id
      `);
      if (decoupled.rows.length > 0) {
        console.log('[db] empresa admin desvinculada de tenant de negócio');
      }
      const row = await client.query(`SELECT id FROM companies WHERE company_id = '0'`);
      companyId = row.rows[0]?.id;
    }

    // Senha do admin vem de ADMIN_PASSWORD (env). Nunca hardcoded no repositório.
    const existingAdmin = await client.query(
      `SELECT id FROM users WHERE email = 'admin@gestaozap.digital'`,
    );

    let userId;
    if (ADMIN_PASSWORD) {
      // Env definida: cria/garante o admin com essa senha
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const userResult = await client.query(`
        INSERT INTO users (email, password_hash, must_change_pwd, active)
        VALUES ('admin@gestaozap.digital', $1, false, true)
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
        RETURNING id
      `, [passwordHash]);
      userId = userResult.rows[0].id;
      console.log('[db] usuário admin garantido (senha via ADMIN_PASSWORD): admin@gestaozap.digital');
    } else if (existingAdmin.rows.length) {
      // Sem env e admin já existe: mantém a senha atual intacta (não sobrescreve)
      userId = existingAdmin.rows[0].id;
      console.warn('[db] ADMIN_PASSWORD não definido — senha do admin mantida como está');
    } else {
      // Primeiro setup sem env: gera senha aleatória e loga uma única vez
      const generated = require('crypto').randomBytes(18).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
      const passwordHash = await bcrypt.hash(generated, 10);
      const userResult = await client.query(`
        INSERT INTO users (email, password_hash, must_change_pwd, active)
        VALUES ('admin@gestaozap.digital', $1, true, true)
        RETURNING id
      `, [passwordHash]);
      userId = userResult.rows[0].id;
      console.warn(`[db] ADMIN_PASSWORD não definido — senha inicial gerada para admin@gestaozap.digital: ${generated}`);
    }

    // Vincular usuário à empresa
    if (companyId) {
      await client.query(`
        INSERT INTO user_company (user_id, company_id, role)
        VALUES ($1, $2, 'admin')
        ON CONFLICT (user_id, company_id) DO NOTHING
      `, [userId, companyId]);
      console.log('[db] usuário admin vinculado à empresa');
    }
  } catch (err) {
    console.error('[db] erro ao seedar admin:', err.message);
  } finally {
    client.release();
  }
}

const { seedPromotionLayouts } = require('./promotion-layouts');

const DEFAULT_FEATURES = [
  {
    slug: 'vitrine-promocoes',
    name: 'Vitrine de Promoções',
    description: 'Panfleto online em /promocao-do-dia com layouts, agendamento, CTAs WhatsApp e leads.',
    price_brl: '49.99',
    is_free: false,
    is_system: true,
    active: true,
    billing_day: 5,
  },
  {
    slug: 'agendamentos',
    name: 'Agendamentos',
    description: 'Página pública /agendar, reservas 1:1 e atalhos no WhatsApp.',
    price_brl: '0',
    is_free: true,
    is_system: true,
    active: true,
    billing_day: 5,
  },
  {
    slug: 'intencoes',
    name: 'Intenções Inteligentes',
    description: 'Identifique automaticamente interesse em preço, pedidos de teste, reclamações, cancelamentos e oportunidades dentro das conversas.',
    price_brl: '49.99',
    is_free: false,
    is_system: false,
    active: true,
    billing_day: 5,
  },
];

async function seedFeatures(pool) {
  const client = await pool.connect();
  try {
    for (const feat of DEFAULT_FEATURES) {
      await client.query(`
        INSERT INTO features (slug, name, description, price_brl, is_free, is_system, active, billing_day)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (slug) DO NOTHING
      `, [
        feat.slug, feat.name, feat.description, feat.price_brl,
        feat.is_free, feat.is_system, feat.active, feat.billing_day,
      ]);
    }
    console.log('[db] features seed aplicado');
  } finally {
    client.release();
  }
}

module.exports = {
  seedPlatformConfig,
  seedAdminCompanyAndUser,
  seedFeatures,
  seedPromotionLayouts,
};
