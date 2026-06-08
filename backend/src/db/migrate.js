require('dotenv').config();
const { Pool } = require('pg');
const { seedPlatformConfig } = require('./seeds');

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enums (CREATE TYPE ... IF NOT EXISTS requires PG 9.1+ trick)
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE send_status AS ENUM ('pending', 'sent', 'failed', 'dlq');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    // Idempotente: adiciona 'dlq' se o enum já existia sem ele
    await client.query(`ALTER TYPE send_status ADD VALUE IF NOT EXISTS 'dlq';`).catch(() => {});
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE contract_status AS ENUM ('active', 'expired', 'cancelled', 'pending');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE payment_type AS ENUM ('subscription', 'per_message', 'credit', 'refund');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE wa_session_status AS ENUM ('disconnected', 'qr_ready', 'connected');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Core tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(63) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        registered_phone VARCHAR(20) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        asaas_customer_id VARCHAR(100),
        terms_accepted_at TIMESTAMPTZ,
        terms_version VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(100) NOT NULL UNIQUE,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
        status wa_session_status NOT NULL DEFAULT 'disconnected',
        connected_phone VARCHAR(30),
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Business tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT true,
        opted_out BOOLEAN NOT NULL DEFAULT false,
        opted_out_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, phone)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        text TEXT NOT NULL,
        image_path TEXT,
        append_opt_out BOOLEAN NOT NULL DEFAULT false,
        opt_out_text TEXT NOT NULL DEFAULT 'Para não receber mais mensagens, responda *SAIR*',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS send_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        send_job_id VARCHAR(50),
        phone VARCHAR(30) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status send_status NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        outbound_message_id TEXT,
        outbound_at BIGINT,
        chat_id TEXT,
        dispatched_at TIMESTAMPTZ,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (campaign_id, send_job_id, phone)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback_analyses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        run_id VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, campaign_id, run_id)
      );
    `);

    // Billing tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(50) NOT NULL UNIQUE,
        price_brl NUMERIC(10,2) NOT NULL,
        messages_per_month INTEGER,
        features JSONB NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plan_id UUID NOT NULL REFERENCES plans(id),
        status contract_status NOT NULL DEFAULT 'active',
        started_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        auto_renew BOOLEAN NOT NULL DEFAULT true,
        asaas_subscription_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        contract_id UUID REFERENCES contracts(id),
        amount_brl NUMERIC(10,2) NOT NULL,
        type payment_type NOT NULL,
        status payment_status NOT NULL DEFAULT 'pending',
        asaas_payment_id VARCHAR(100),
        description TEXT,
        reference_month VARCHAR(7),
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        contract_id UUID REFERENCES contracts(id),
        send_log_id UUID REFERENCES send_logs(id),
        counted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        month VARCHAR(7) NOT NULL
      );
    `);

    // Tabela de afiliados (sistema de indicação)
    await client.query(`
      CREATE TABLE IF NOT EXISTS affiliates (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        email           VARCHAR(255),
        code            VARCHAR(50) UNIQUE NOT NULL,
        commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
        discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
        active          BOOLEAN NOT NULL DEFAULT true,
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS affiliate_referrals (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        affiliate_id        UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        contract_id         UUID REFERENCES contracts(id),
        plan_slug           VARCHAR(50),
        original_price_brl  NUMERIC(10,2) NOT NULL DEFAULT 0,
        discount_brl        NUMERIC(10,2) NOT NULL DEFAULT 0,
        final_price_brl     NUMERIC(10,2) NOT NULL DEFAULT 0,
        commission_brl      NUMERIC(10,2) NOT NULL DEFAULT 0,
        commission_pct      NUMERIC(5,2)  NOT NULL DEFAULT 0,
        discount_pct        NUMERIC(5,2)  NOT NULL DEFAULT 0,
        status              VARCHAR(20)   NOT NULL DEFAULT 'pending',
        confirmed_at        TIMESTAMPTZ,
        paid_at             TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Código de afiliado vinculado ao tenant
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS affiliate_code VARCHAR(50);`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id);`);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone ON contacts(tenant_id, phone);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_tenant_active ON contacts(tenant_id, active);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_send_logs_tenant_campaign ON send_logs(tenant_id, campaign_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_send_logs_tenant_job ON send_logs(tenant_id, send_job_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_send_logs_status ON send_logs(campaign_id, status);`);
    // expires_at é nullable: contratos vitalícios têm expires_at = NULL
    await client.query(`ALTER TABLE contracts ALTER COLUMN expires_at DROP NOT NULL;`).catch(() => {});
    await client.query(`DROP INDEX IF EXISTS idx_contracts_expires;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contracts_expires ON contracts(expires_at) WHERE status = 'active' AND expires_at IS NOT NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_message_usage_tenant_month ON message_usage(tenant_id, month);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate ON affiliate_referrals(affiliate_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_tenant ON affiliate_referrals(tenant_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tenants_affiliate_code ON tenants(affiliate_code);`);

    // Sistema de eventos / incidentes operacionais
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_events (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
        kind        VARCHAR(80) NOT NULL,
        severity    VARCHAR(20) NOT NULL DEFAULT 'info',
        payload     JSONB NOT NULL DEFAULT '{}',
        resolved    BOOLEAN NOT NULL DEFAULT false,
        resolved_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_system_events_tenant_created ON system_events(tenant_id, created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_system_events_unresolved ON system_events(tenant_id, severity) WHERE resolved = false;`);

    // ─── Tenant Users & Magic Link Authentication ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email         VARCHAR(255) NOT NULL,
        role          VARCHAR(20) NOT NULL DEFAULT 'member',
        active        BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, email)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email         VARCHAR(255) NOT NULL,
        token_hash    VARCHAR(64) NOT NULL UNIQUE,
        expires_at    TIMESTAMPTZ NOT NULL,
        used_at       TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, email, token_hash)
      );
    `);

    // Consentimento por categoria (LGPD-friendly)
    await client.query(`
      ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS consent_marketing     BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS consent_transactional BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS consent_support       BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS consent_billing       BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS consent_updated_at    TIMESTAMPTZ;
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_consent_marketing ON contacts(tenant_id) WHERE consent_marketing = false;`);

    // ─── Chat ao vivo: conversations, messages, quick_replies ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        wa_chat_id            TEXT NOT NULL,
        phone                 VARCHAR(30) NOT NULL,
        contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
        contact_name          VARCHAR(255),
        avatar_url            TEXT,
        is_group              BOOLEAN NOT NULL DEFAULT false,
        tags                  TEXT[] NOT NULL DEFAULT '{}',
        unread_count          INTEGER NOT NULL DEFAULT 0,
        last_message_preview  TEXT,
        last_message_at       TIMESTAMPTZ,
        last_message_from_me  BOOLEAN,
        archived              BOOLEAN NOT NULL DEFAULT false,
        pinned                BOOLEAN NOT NULL DEFAULT false,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, wa_chat_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        wa_message_id       TEXT,
        direction           VARCHAR(4) NOT NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'sent',
        body                TEXT,
        media_url           TEXT,
        media_mime          VARCHAR(80),
        media_type          VARCHAR(20),
        has_media           BOOLEAN NOT NULL DEFAULT false,
        quoted_message_id   UUID,
        is_internal_note    BOOLEAN NOT NULL DEFAULT false,
        send_log_id         UUID REFERENCES send_logs(id) ON DELETE SET NULL,
        error               TEXT,
        wa_timestamp        TIMESTAMPTZ NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS quick_replies (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        shortcut     VARCHAR(40) NOT NULL,
        title        VARCHAR(120) NOT NULL,
        body         TEXT NOT NULL,
        usage_count  INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, shortcut)
      );
    `);

    // Índices de performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_tenant_recent
        ON conversations(tenant_id, archived, last_message_at DESC NULLS LAST);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_tenant_phone
        ON conversations(tenant_id, phone);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_tags
        ON conversations USING GIN (tags);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_unread
        ON conversations(tenant_id, unread_count) WHERE unread_count > 0;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conv_time
        ON messages(conversation_id, wa_timestamp DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_tenant_time
        ON messages(tenant_id, wa_timestamp DESC);
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_tenant_waid
        ON messages(tenant_id, wa_message_id) WHERE wa_message_id IS NOT NULL;
    `);

    await client.query('COMMIT');
    console.log('[db] migrations completed');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ensureDefaultTenant(pool) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id FROM tenants WHERE id = $1',
      [DEFAULT_TENANT_ID],
    );
    if (!rows.length) {
      await client.query(`
        INSERT INTO tenants (id, slug, name, registered_phone, active)
        VALUES ($1, 'default', 'Desenvolvimento Local', '5511999999999', true)
        ON CONFLICT (id) DO NOTHING
      `, [DEFAULT_TENANT_ID]);
      await client.query(`
        INSERT INTO whatsapp_sessions (tenant_id, status)
        VALUES ($1, 'disconnected')
        ON CONFLICT (tenant_id) DO NOTHING
      `, [DEFAULT_TENANT_ID]);
      console.log('[db] default tenant criado:', DEFAULT_TENANT_ID);
    }
  } finally {
    client.release();
  }
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://wa_invites:wa_invites@localhost:5432/wa_invites',
  });
  try {
    await runMigrations(pool);
    await ensureDefaultTenant(pool);
    await seedPlatformConfig(pool);
    console.log('[db] setup completo');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { runMigrations, ensureDefaultTenant };
