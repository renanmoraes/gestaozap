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

const sendStatusEnum = pgEnum('send_status', ['pending', 'sent', 'failed', 'dlq', 'skipped']);
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
  logoPath: text('logo_path'),
  profileJson: jsonb('profile_json').notNull().default({}),
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
  tenantId:      uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
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

const features = pgTable('features', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  priceBrl: numeric('price_brl', { precision: 10, scale: 2 }).notNull().default('0'),
  isFree: boolean('is_free').notNull().default(false),
  isSystem: boolean('is_system').notNull().default(false),
  active: boolean('active').notNull().default(true),
  billingDay: integer('billing_day').notNull().default(5),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const tenantFeatures = pgTable('tenant_features', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  priceSnapshot: numeric('price_snapshot', { precision: 10, scale: 2 }),
  isComplimentary: boolean('is_complimentary').notNull().default(false),
  enabledBy: varchar('enabled_by', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const featureRequests = pgTable('feature_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  featureId: uuid('feature_id').notNull().references(() => features.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Intenções Inteligentes (captura de intenção sem IA) ───
// Regras de intenção. Templates globais têm tenant_id NULL e system_default=true;
// cópias do tenant (editáveis) têm tenant_id preenchido.
const intentRules = pgTable('intent_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  intentKey: text('intent_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  keywords: text('keywords').array().notNull().default([]),
  regexPatterns: text('regex_patterns').array().notNull().default([]),
  tags: text('tags').array().notNull().default([]),
  priority: integer('priority').notNull().default(0),
  minScore: numeric('min_score', { precision: 5, scale: 2 }).notNull().default('0.60'),
  systemDefault: boolean('system_default').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Eventos de detecção (append-only) — uma linha por intenção detectada numa mensagem.
const conversationIntents = pgTable('conversation_intents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  contactId: uuid('contact_id'),
  messageId: uuid('message_id'),
  intentKey: text('intent_key').notNull(),
  ruleId: uuid('rule_id'),
  confidence: numeric('confidence', { precision: 5, scale: 2 }).notNull(),
  matchedKeywords: text('matched_keywords').array().notNull().default([]),
  matchedRegex: text('matched_regex').array().notNull().default([]),
  source: text('source').notNull().default('rule_based'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
});

// Tags de intenção agregadas por contato (diferenciadas das tags manuais em contacts.tags).
const contactIntentTags = pgTable('contact_intent_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull(),
  intentKey: text('intent_key').notNull(),
  tag: text('tag').notNull(),
  firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }).defaultNow().notNull(),
  lastDetectedAt: timestamp('last_detected_at', { withTimezone: true }).defaultNow().notNull(),
  occurrenceCount: integer('occurrence_count').notNull().default(1),
});

const promotionLayouts = pgTable('promotion_layouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 20 }).notNull(),
  schemaJson: jsonb('schema_json').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const promotions = pgTable('promotions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  layoutId: uuid('layout_id').notNull().references(() => promotionLayouts.id),
  title: varchar('title', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  shareCode: varchar('share_code', { length: 40 }),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  contentJson: jsonb('content_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const promotionSlots = pgTable('promotion_slots', {
  id: uuid('id').defaultRandom().primaryKey(),
  promotionId: uuid('promotion_id').notNull().references(() => promotions.id, { onDelete: 'cascade' }),
  slotKey: varchar('slot_key', { length: 80 }).notNull(),
  mediaType: varchar('media_type', { length: 20 }),
  mediaPath: text('media_path'),
  ctaText: text('cta_text'),
  label: varchar('label', { length: 255 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const promotionEvents = pgTable('promotion_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  promotionId: uuid('promotion_id').references(() => promotions.id, { onDelete: 'set null' }),
  slotId: uuid('slot_id').references(() => promotionSlots.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 30 }).notNull(),
  sessionId: varchar('session_id', { length: 64 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const promotionLeads = pgTable('promotion_leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  promotionId: uuid('promotion_id').references(() => promotions.id, { onDelete: 'set null' }),
  slotId: uuid('slot_id').references(() => promotionSlots.id, { onDelete: 'set null' }),
  message: text('message'),
  source: varchar('source', { length: 50 }),
  visitorSession: varchar('visitor_session', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const bookingPages = pgTable('booking_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique().references(() => tenants.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 80 }).notNull().default('default'),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  isPublished: boolean('is_published').notNull().default(true),
  timezone: varchar('timezone', { length: 64 }).notNull().default('America/Sao_Paulo'),
  operatorNotifyBeforeMin: integer('operator_notify_before_min').notNull().default(15),
  reminderEmailEnabled: boolean('reminder_email_enabled').notNull().default(true),
  reminderWhatsappEnabled: boolean('reminder_whatsapp_enabled').notNull().default(true),
  reminderHoursBefore: jsonb('reminder_hours_before').notNull().default([24, 1]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const eventTypes = pgTable('event_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingPageId: uuid('booking_page_id').notNull().references(() => bookingPages.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull(),
  durationMin: integer('duration_min').notNull().default(30),
  bufferBeforeMin: integer('buffer_before_min').notNull().default(0),
  bufferAfterMin: integer('buffer_after_min').notNull().default(0),
  minNoticeMin: integer('min_notice_min').notNull().default(120),
  maxAdvanceDays: integer('max_advance_days').notNull().default(60),
  maxDailyBookings: integer('max_daily_bookings'),
  priceBrl: numeric('price_brl', { precision: 10, scale: 2 }),
  locationType: varchar('location_type', { length: 30 }).default('whatsapp'),
  locationValue: text('location_value'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const availabilityRules = pgTable('availability_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),
  startLocalTime: varchar('start_local_time', { length: 5 }).notNull(),
  endLocalTime: varchar('end_local_time', { length: 5 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const availabilityExceptions = pgTable('availability_exceptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  dateLocal: varchar('date_local', { length: 10 }).notNull(),
  mode: varchar('mode', { length: 20 }).notNull().default('closed'),
  startLocalTime: varchar('start_local_time', { length: 5 }),
  endLocalTime: varchar('end_local_time', { length: 5 }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const bookingStaff = pgTable('booking_staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const eventTypeStaff = pgTable('event_type_staff', {
  eventTypeId: uuid('event_type_id').notNull().references(() => eventTypes.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id').notNull().references(() => bookingStaff.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: { columns: [t.eventTypeId, t.staffId] },
}));

const manualBlocks = pgTable('manual_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  staffId: uuid('staff_id').references(() => bookingStaff.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  allDay: boolean('all_day').notNull().default(false),
  reason: text('reason'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  bookingPageId: uuid('booking_page_id').notNull().references(() => bookingPages.id, { onDelete: 'cascade' }),
  eventTypeId: uuid('event_type_id').notNull().references(() => eventTypes.id, { onDelete: 'restrict' }),
  staffId: uuid('staff_id').references(() => bookingStaff.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  inviteeName: varchar('invitee_name', { length: 255 }).notNull(),
  inviteeEmail: varchar('invitee_email', { length: 255 }).notNull(),
  inviteePhone: varchar('invitee_phone', { length: 20 }),
  inviteeTimezone: varchar('invitee_timezone', { length: 64 }).notNull().default('America/Sao_Paulo'),
  consentEmail: boolean('consent_email').notNull().default(true),
  consentWhatsapp: boolean('consent_whatsapp').notNull().default(false),
  whatsappConsentAt: timestamp('whatsapp_consent_at', { withTimezone: true }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('confirmed'),
  publicToken: varchar('public_token', { length: 64 }).notNull().unique(),
  operatorNotifiedAt: timestamp('operator_notified_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const bookingReminderJobs = pgTable('booking_reminder_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 20 }).notNull(),
  kind: varchar('kind', { length: 30 }).notNull().default('reminder'),
  hoursBefore: integer('hours_before'),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const tenantGoogleCalendar = pgTable('tenant_google_calendar', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  googleEmail: varchar('google_email', { length: 255 }),
  calendarId: varchar('calendar_id', { length: 255 }).notNull().default('primary'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  syncEnabled: boolean('sync_enabled').notNull().default(true),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
  features,
  tenantFeatures,
  featureRequests,
  intentRules,
  conversationIntents,
  contactIntentTags,
  promotionLayouts,
  promotions,
  promotionSlots,
  promotionEvents,
  promotionLeads,
  bookingPages,
  eventTypes,
  bookingStaff,
  eventTypeStaff,
  availabilityRules,
  availabilityExceptions,
  manualBlocks,
  bookings,
  bookingReminderJobs,
  tenantGoogleCalendar,
  plans,
  contracts,
  paymentRecords,
  messageUsage,
};
