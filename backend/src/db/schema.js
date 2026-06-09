const {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  integer,
  numeric,
  jsonb,
  bigint,
} = require('drizzle-orm/pg-core');

const sendStatusEnum = pgEnum('send_status', ['pending', 'sent', 'failed']);
const contractStatusEnum = pgEnum('contract_status', ['active', 'expired', 'cancelled', 'pending']);
const paymentTypeEnum = pgEnum('payment_type', ['subscription', 'per_message', 'credit', 'refund']);
const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'failed', 'cancelled']);
const waSessionStatusEnum = pgEnum('wa_session_status', ['disconnected', 'qr_ready', 'connected']);

const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 63 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  registeredPhone: varchar('registered_phone', { length: 20 }).notNull(),
  active: boolean('active').notNull().default(true),
  asaasCustomerId: varchar('asaas_customer_id', { length: 100 }),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  termsVersion: varchar('terms_version', { length: 20 }),
  // Pré-cadastro: gate de aprovação + documento fiscal (Fase 1)
  approvalStatus: varchar('approval_status', { length: 20 }).notNull().default('pending'),
  document: varchar('document', { length: 20 }),
  documentType: varchar('document_type', { length: 4 }),
  // Colunas de afiliado já existentes no banco (migrate.js) — declaradas aqui p/ o drizzle
  affiliateCode: varchar('affiliate_code', { length: 50 }),
  affiliateId: uuid('affiliate_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const tenantSessions = pgTable('tenant_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionHash: varchar('session_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const platformConfig = pgTable('platform_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const whatsappSessions = pgTable('whatsapp_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique().references(() => tenants.id, { onDelete: 'cascade' }),
  status: waSessionStatusEnum('status').notNull().default('disconnected'),
  connectedPhone: varchar('connected_phone', { length: 30 }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const contacts = pgTable('contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 30 }).notNull(),
  tags: text('tags').array().notNull().default([]),
  active: boolean('active').notNull().default(true),
  optedOut: boolean('opted_out').notNull().default(false),
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
  // Consentimento granular por categoria (LGPD)
  consentMarketing:     boolean('consent_marketing').notNull().default(true),
  consentTransactional: boolean('consent_transactional').notNull().default(true),
  consentSupport:       boolean('consent_support').notNull().default(true),
  consentBilling:       boolean('consent_billing').notNull().default(true),
  consentUpdatedAt:     timestamp('consent_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  text: text('text').notNull(),
  imagePath: text('image_path'),
  appendOptOut: boolean('append_opt_out').notNull().default(false),
  optOutText: text('opt_out_text').notNull().default('Para não receber mais mensagens, responda *SAIR*'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const sendLogs = pgTable('send_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  sendJobId: varchar('send_job_id', { length: 50 }),
  phone: varchar('phone', { length: 30 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  status: sendStatusEnum('status').notNull().default('pending'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  outboundMessageId: text('outbound_message_id'),
  outboundAt: bigint('outbound_at', { mode: 'number' }),
  chatId: text('chat_id'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  dispatchId: uuid('dispatch_id'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const feedbackAnalyses = pgTable('feedback_analyses', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  runId: varchar('run_id', { length: 50 }).notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const affiliates = pgTable('affiliates', {
  id:            uuid('id').defaultRandom().primaryKey(),
  name:          varchar('name', { length: 255 }).notNull(),
  email:         varchar('email', { length: 255 }),
  code:          varchar('code', { length: 50 }).notNull().unique(),
  commissionPct: numeric('commission_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  discountPct:   numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  active:        boolean('active').notNull().default(true),
  notes:         text('notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const affiliateReferrals = pgTable('affiliate_referrals', {
  id:               uuid('id').defaultRandom().primaryKey(),
  affiliateId:      uuid('affiliate_id').notNull().references(() => affiliates.id, { onDelete: 'cascade' }),
  tenantId:         uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contractId:       uuid('contract_id').references(() => contracts.id),
  planSlug:         varchar('plan_slug', { length: 50 }),
  originalPriceBrl: numeric('original_price_brl', { precision: 10, scale: 2 }).notNull().default('0'),
  discountBrl:      numeric('discount_brl', { precision: 10, scale: 2 }).notNull().default('0'),
  finalPriceBrl:    numeric('final_price_brl', { precision: 10, scale: 2 }).notNull().default('0'),
  commissionBrl:    numeric('commission_brl', { precision: 10, scale: 2 }).notNull().default('0'),
  commissionPct:    numeric('commission_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  discountPct:      numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  status:           varchar('status', { length: 20 }).notNull().default('pending'),
  confirmedAt:      timestamp('confirmed_at', { withTimezone: true }),
  paidAt:           timestamp('paid_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  priceBrl: numeric('price_brl', { precision: 10, scale: 2 }).notNull(),
  messagesPerMonth: integer('messages_per_month'),
  overagePriceBrl: numeric('overage_price_brl', { precision: 10, scale: 4 }),
  maxConcurrentSends: integer('max_concurrent_sends').notNull().default(1),
  features: jsonb('features').notNull().default({}),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const contracts = pgTable('contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: contractStatusEnum('status').notNull().default('active'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // NULL = vitalício (sem vencimento)
  isTrial: boolean('is_trial').notNull().default(false),
  autoRenew: boolean('auto_renew').notNull().default(true),
  asaasSubscriptionId: varchar('asaas_subscription_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const paymentRecords = pgTable('payment_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contractId: uuid('contract_id').references(() => contracts.id),
  amountBrl: numeric('amount_brl', { precision: 10, scale: 2 }).notNull(),
  type: paymentTypeEnum('type').notNull(),
  status: paymentStatusEnum('status').notNull().default('pending'),
  asaasPaymentId: varchar('asaas_payment_id', { length: 100 }),
  description: text('description'),
  referenceMonth: varchar('reference_month', { length: 7 }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const messageUsage = pgTable('message_usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contractId: uuid('contract_id').references(() => contracts.id),
  sendLogId: uuid('send_log_id').references(() => sendLogs.id),
  countedAt: timestamp('counted_at', { withTimezone: true }).defaultNow().notNull(),
  month: varchar('month', { length: 7 }).notNull(),
});

/* ─── Chat ao vivo (estilo WhatsApp Web) ─────────────────────── */

const conversations = pgTable('conversations', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  waChatId:            text('wa_chat_id').notNull(),
  phone:               varchar('phone', { length: 30 }).notNull(),
  contactId:           uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  contactName:         varchar('contact_name', { length: 255 }),
  avatarUrl:           text('avatar_url'),
  isGroup:             boolean('is_group').notNull().default(false),
  tags:                text('tags').array().notNull().default([]),
  unreadCount:         integer('unread_count').notNull().default(0),
  lastMessagePreview:  text('last_message_preview'),
  lastMessageAt:       timestamp('last_message_at', { withTimezone: true }),
  lastMessageFromMe:   boolean('last_message_from_me'),
  archived:            boolean('archived').notNull().default(false),
  pinned:              boolean('pinned').notNull().default(false),
  createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const messages = pgTable('messages', {
  id:                uuid('id').defaultRandom().primaryKey(),
  tenantId:          uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  conversationId:    uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  waMessageId:       text('wa_message_id'),
  direction:         varchar('direction', { length: 4 }).notNull(), // 'in' | 'out' | 'note'
  status:            varchar('status', { length: 20 }).notNull().default('sent'),
  body:              text('body'),
  mediaUrl:          text('media_url'),
  mediaMime:         varchar('media_mime', { length: 80 }),
  mediaType:         varchar('media_type', { length: 20 }),
  hasMedia:          boolean('has_media').notNull().default(false),
  quotedMessageId:   uuid('quoted_message_id'),
  isInternalNote:    boolean('is_internal_note').notNull().default(false),
  sendLogId:         uuid('send_log_id').references(() => sendLogs.id, { onDelete: 'set null' }),
  error:             text('error'),
  waTimestamp:       timestamp('wa_timestamp', { withTimezone: true }).notNull(),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const quickReplies = pgTable('quick_replies', {
  id:          uuid('id').defaultRandom().primaryKey(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  shortcut:    varchar('shortcut', { length: 40 }).notNull(),
  title:       varchar('title', { length: 120 }).notNull(),
  body:        text('body').notNull(),
  usageCount:  integer('usage_count').notNull().default(0),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const companies = pgTable('companies', {
  id:        uuid('id').defaultRandom().primaryKey(),
  companyId: varchar('company_id', { length: 50 }).notNull().unique(),
  tenantId:  uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  name:      varchar('name', { length: 255 }).notNull(),
  active:    boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const users = pgTable('users', {
  id:            uuid('id').defaultRandom().primaryKey(),
  email:         varchar('email', { length: 255 }).notNull().unique(),
  passwordHash:  varchar('password_hash', { length: 255 }).notNull(),
  mustChangePwd: boolean('must_change_pwd').notNull().default(false),
  active:        boolean('active').notNull().default(true),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const userCompany = pgTable('user_company', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  role:      varchar('role', { length: 20 }).notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const userSessions = pgTable('user_sessions', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

module.exports = {
  conversations,
  messages,
  quickReplies,
  affiliates,
  affiliateReferrals,
  companies,
  users,
  userCompany,
  userSessions,
  sendStatusEnum,
  contractStatusEnum,
  paymentTypeEnum,
  paymentStatusEnum,
  waSessionStatusEnum,
  tenants,
  tenantSessions,
  adminSessions,
  platformConfig,
  whatsappSessions,
  contacts,
  campaigns,
  sendLogs,
  feedbackAnalyses,
  plans,
  contracts,
  paymentRecords,
  messageUsage,
};
