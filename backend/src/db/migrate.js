require('dotenv').config();
const { Pool } = require('pg');
const { seedPlatformConfig, seedAdminCompanyAndUser, seedFeatures, seedPromotionLayouts } = require('./seeds');

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
    await client.query(`ALTER TYPE send_status ADD VALUE IF NOT EXISTS 'skipped';`).catch(() => {});
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

    // ─── Pré-cadastro: aprovação + documento (Fase 1) ───
    // Cria approval_status e aprova retroativamente os tenants pré-existentes
    // (default 'pending' valeria só para novos cadastros). Idempotente: o backfill
    // roda apenas quando a coluna é criada pela primeira vez.
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tenants' AND column_name='approval_status'
        ) THEN
          ALTER TABLE tenants ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'pending';
          UPDATE tenants SET approval_status='approved';
        END IF;
      END $$;
    `);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS document VARCHAR(20);`);
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS document_type VARCHAR(4);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tenants_approval_status ON tenants(approval_status);`);
    await client.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;`);

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

    // Busca rápida na agenda: trigram p/ ILIKE '%q%' + composto p/ filtro+ordenação + tags.
    // OBS: em produção (tabela grande) criar com CREATE INDEX CONCURRENTLY ANTES do deploy;
    // estes IF NOT EXISTS viram no-op depois. Ver docs/superpowers/plans/2026-06-08-scheduler-cota-agenda.md (Part 4).
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm  ON contacts USING gin (name  gin_trgm_ops);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm ON contacts USING gin (phone gin_trgm_ops);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_tenant_active_created ON contacts(tenant_id, active, created_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin (tags);`);

    // Integridade: no máximo 1 contrato ativo por tenant
    await client.query(`
      UPDATE contracts c
      SET status = 'cancelled', updated_at = now()
      FROM (
        SELECT id
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at DESC) AS rn
          FROM contracts
          WHERE status = 'active'
        ) ranked
        WHERE rn > 1
      ) dup
      WHERE c.id = dup.id;
    `).catch(() => {});
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_active_contract_per_tenant ON contracts(tenant_id) WHERE status = 'active';`);

    // Cota / excedente / concorrência por plano
    await client.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS overage_price_brl NUMERIC(10,4);`);
    await client.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_concurrent_sends INTEGER NOT NULL DEFAULT 1;`);
    await client.query(`UPDATE plans SET overage_price_brl = 0.10, max_concurrent_sends = 1 WHERE slug = 'starter';`);
    await client.query(`UPDATE plans SET overage_price_brl = 0.08, max_concurrent_sends = 3 WHERE slug = 'pro';`);
    await client.query(`UPDATE plans SET overage_price_brl = NULL, max_concurrent_sends = 10 WHERE slug = 'business';`);

    // Afiliado vinculado a cliente da plataforma (portal self-service)
    await client.query(`ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_affiliate_tenant ON affiliates(tenant_id) WHERE tenant_id IS NOT NULL;`);

    // Rastreio de dispatch (envios simultâneos + continuações)
    await client.query(`ALTER TABLE send_logs ADD COLUMN IF NOT EXISTS dispatch_id UUID;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_send_logs_tenant_dispatch ON send_logs(tenant_id, dispatch_id) WHERE dispatch_id IS NOT NULL;`);

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

    // ─── Companies & Users Authentication ───
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id    VARCHAR(50) NOT NULL UNIQUE,
        name          VARCHAR(255) NOT NULL,
        active        BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Migra company_id numérico → identificador textual
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'companies'
            AND column_name = 'company_id' AND data_type = 'integer'
        ) THEN
          ALTER TABLE companies
            ALTER COLUMN company_id TYPE VARCHAR(50) USING company_id::text;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           VARCHAR(255) NOT NULL UNIQUE,
        password_hash   VARCHAR(255) NOT NULL,
        must_change_pwd BOOLEAN NOT NULL DEFAULT false,
        active          BOOLEAN NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_company (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        role        VARCHAR(20) NOT NULL DEFAULT 'member',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, company_id)
      );
    `);

    await client.query(`
      ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_companies_tenant_id ON companies(tenant_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        token_hash  VARCHAR(64) NOT NULL UNIQUE,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
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

    // Features / addons
    await client.query(`
      CREATE TABLE IF NOT EXISTS features (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price_brl NUMERIC(10,2) NOT NULL DEFAULT 0,
        is_free BOOLEAN NOT NULL DEFAULT false,
        is_system BOOLEAN NOT NULL DEFAULT false,
        active BOOLEAN NOT NULL DEFAULT true,
        billing_day INTEGER NOT NULL DEFAULT 5,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_features (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        starts_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ,
        price_snapshot NUMERIC(10,2),
        enabled_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tenant_features_lookup
        ON tenant_features(tenant_id, feature_id, status);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS feature_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        feature_id UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Vitrine de promoções
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_layouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(20) NOT NULL,
        schema_json JSONB NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        layout_id UUID NOT NULL REFERENCES promotion_layouts(id),
        title VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        starts_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        content_json JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promotions_tenant_status
        ON promotions(tenant_id, status, starts_at);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        slot_key VARCHAR(80) NOT NULL,
        media_type VARCHAR(20),
        media_path TEXT,
        cta_text TEXT,
        label VARCHAR(255),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
        slot_id UUID REFERENCES promotion_slots(id) ON DELETE SET NULL,
        event_type VARCHAR(30) NOT NULL,
        session_id VARCHAR(64),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promotion_events_tenant_time
        ON promotion_events(tenant_id, created_at DESC);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL,
        slot_id UUID REFERENCES promotion_slots(id) ON DELETE SET NULL,
        message TEXT,
        source VARCHAR(50),
        visitor_session VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_promotion_leads_tenant_time
        ON promotion_leads(tenant_id, created_at DESC);
    `);

    await client.query(`
      ALTER TABLE tenant_features
        ADD COLUMN IF NOT EXISTS is_complimentary BOOLEAN NOT NULL DEFAULT false;
    `);

    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_path TEXT;
    `);
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS profile_json JSONB NOT NULL DEFAULT '{}';
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
    await seedFeatures(pool);
    await seedPromotionLayouts(pool);
    await seedAdminCompanyAndUser(pool);
    console.log('[db] setup completo');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { runMigrations, ensureDefaultTenant };
