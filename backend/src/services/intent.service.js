// Camada de aplicação da feature "Intenções Inteligentes".
// Busca regras, aplica o motor (intent-engine), persiste eventos e tags,
// e emite eventos Socket.IO. Tudo gated por feature + isolado por tenant.

const { eq, and, sql, desc } = require('drizzle-orm');
const { getDb, getPool } = require('../db');
const {
  intentRules,
  conversationIntents,
  contactIntentTags,
  conversations,
  features,
  featureRequests,
} = require('../db/schema');
const { tenantHasFeature } = require('./feature.service');
const { detectIntents } = require('./intent-engine.service');

const FEATURE_SLUG = 'intencoes';

// Cache curto de regras ativas por tenant (reduz query no hot path de mensagens).
const RULES_TTL_MS = 30 * 1000;
const rulesCache = new Map(); // tenantId -> { rules, ts }

function invalidateRulesCache(tenantId) {
  if (tenantId) rulesCache.delete(tenantId);
  else rulesCache.clear();
}

async function getActiveRules(db, tenantId) {
  const cached = rulesCache.get(tenantId);
  if (cached && Date.now() - cached.ts < RULES_TTL_MS) return cached.rules;

  const rules = await db.select().from(intentRules)
    .where(and(eq(intentRules.tenantId, tenantId), eq(intentRules.active, true)));
  rulesCache.set(tenantId, { rules, ts: Date.now() });
  return rules;
}

/**
 * Copia os templates globais (tenant_id NULL, system_default) para o tenant,
 * caso ele ainda não tenha regras. Idempotente. Chamado ao ativar a feature.
 */
async function ensureTenantRules(tenantId) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO intent_rules
       (tenant_id, intent_key, name, description, keywords, regex_patterns, tags, priority, min_score, system_default, active)
     SELECT $1, intent_key, name, description, keywords, regex_patterns, tags, priority, min_score, true, true
       FROM intent_rules
      WHERE tenant_id IS NULL AND system_default
     ON CONFLICT (tenant_id, intent_key) WHERE tenant_id IS NOT NULL DO NOTHING`,
    [tenantId],
  );
  invalidateRulesCache(tenantId);
}

/**
 * Processa uma mensagem inbound: detecta intenção, persiste evento e tags,
 * emite Socket.IO. No-op silencioso se a feature estiver inativa.
 * Idempotente por (message_id, intent_key).
 */
async function processInboundMessage(db, io, { tenantId, conversationId, messageId, body }) {
  const text = (body || '').toString().trim();
  if (!text) return null;

  const feat = await tenantHasFeature(db, tenantId, FEATURE_SLUG);
  if (!feat.active) return null;

  let rules = await getActiveRules(db, tenantId);
  if (!rules.length) {
    // Rede de segurança: tenant ativou feature mas ainda sem regras → copia templates.
    await ensureTenantRules(tenantId);
    rules = await getActiveRules(db, tenantId);
    if (!rules.length) return null;
  }

  // Detecta TODAS as intenções acima do score — uma mensagem pode conter várias
  // (ex.: "qual o preço e vocês entregam? é urgente").
  const hits = detectIntents(text, rules, { multi: true });
  if (!hits.length) return null;

  // Resolve contactId da conversa (necessário p/ tags agregadas).
  let contactId = null;
  try {
    const [conv] = await db.select({ contactId: conversations.contactId })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)))
      .limit(1);
    contactId = conv?.contactId || null;
  } catch (_) {}

  const detected = [];
  const appliedTags = [];

  for (const hit of hits) {
    // 1) Evento de detecção (idempotente por message_id+intent_key)
    await db.insert(conversationIntents).values({
      tenantId,
      conversationId,
      contactId,
      messageId: messageId || null,
      intentKey: hit.intentKey,
      ruleId: hit.rule.id || null,
      confidence: String(hit.confidence),
      matchedKeywords: hit.matchedKeywords,
      matchedRegex: hit.matchedRegex,
      source: 'rule_based',
    }).onConflictDoNothing();

    // 2) Tags agregadas por contato (upsert com contador)
    const tags = Array.isArray(hit.rule.tags) ? hit.rule.tags : [];
    if (contactId && tags.length) {
      for (const tag of tags) {
        await db.insert(contactIntentTags).values({
          tenantId,
          contactId,
          intentKey: hit.intentKey,
          tag,
        }).onConflictDoUpdate({
          target: [
            contactIntentTags.tenantId,
            contactIntentTags.contactId,
            contactIntentTags.intentKey,
            contactIntentTags.tag,
          ],
          set: {
            lastDetectedAt: new Date(),
            occurrenceCount: sql`${contactIntentTags.occurrenceCount} + 1`,
          },
        });
        if (!appliedTags.includes(tag)) appliedTags.push(tag);
      }
    }

    detected.push({ intentKey: hit.intentKey, confidence: hit.confidence, tags });
  }

  // Emite eventos consolidados (uma mensagem → várias intenções).
  if (io) {
    io.to(tenantId).emit('intent:detected', {
      tenantId,
      conversationId,
      contactId,
      intents: detected.map((d) => ({ intentKey: d.intentKey, confidence: d.confidence })),
      // compat: intenção principal (maior prioridade) no topo
      intentKey: detected[0].intentKey,
      confidence: detected[0].confidence,
    });
    if (contactId && appliedTags.length) {
      io.to(tenantId).emit('intent:tag_applied', {
        tenantId,
        conversationId,
        contactId,
        tags: appliedTags,
      });
    }
  }

  return { contactId, intents: detected, tags: appliedTags };
}

// ─────────────────────── CRUD de regras (painel do tenant) ───────────────────────

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

/** Lista as regras do tenant (ordenadas por prioridade desc, nome). */
async function listTenantRules(db, tenantId) {
  return db.select().from(intentRules)
    .where(eq(intentRules.tenantId, tenantId))
    .orderBy(desc(intentRules.priority), intentRules.name);
}

/** Cria regra personalizada do tenant (system_default=false). */
async function createRule(db, tenantId, data = {}) {
  const intentKey = String(data.intentKey || '').trim();
  const name = String(data.name || '').trim();
  if (!intentKey || !name) {
    const err = new Error('intentKey e name são obrigatórios');
    err.status = 400;
    throw err;
  }
  const [row] = await db.insert(intentRules).values({
    tenantId,
    intentKey,
    name,
    description: data.description ? String(data.description) : null,
    keywords: sanitizeStringArray(data.keywords),
    regexPatterns: sanitizeStringArray(data.regexPatterns),
    tags: sanitizeStringArray(data.tags),
    priority: Number.isFinite(+data.priority) ? +data.priority : 0,
    minScore: data.minScore != null ? String(data.minScore) : '0.60',
    systemDefault: false,
    active: data.active !== false,
  }).returning();
  invalidateRulesCache(tenantId);
  return row;
}

/**
 * Atualiza uma regra do tenant. Como na ativação os templates padrão são
 * copiados para linhas do próprio tenant, editar é um UPDATE na linha do tenant
 * (nunca toca em templates globais tenant_id NULL). Retorna null se não encontrada.
 */
async function updateRule(db, tenantId, id, data = {}) {
  const patch = { updatedAt: new Date() };
  if (data.name != null) patch.name = String(data.name).trim();
  if (data.description !== undefined) patch.description = data.description ? String(data.description) : null;
  if (data.keywords !== undefined) patch.keywords = sanitizeStringArray(data.keywords);
  if (data.regexPatterns !== undefined) patch.regexPatterns = sanitizeStringArray(data.regexPatterns);
  if (data.tags !== undefined) patch.tags = sanitizeStringArray(data.tags);
  if (data.priority !== undefined && Number.isFinite(+data.priority)) patch.priority = +data.priority;
  if (data.minScore !== undefined && data.minScore != null) patch.minScore = String(data.minScore);
  if (data.active !== undefined) patch.active = !!data.active;

  const [row] = await db.update(intentRules)
    .set(patch)
    .where(and(eq(intentRules.id, id), eq(intentRules.tenantId, tenantId)))
    .returning();
  invalidateRulesCache(tenantId);
  return row || null;
}

/** Remove uma regra do tenant. Retorna true se removeu. */
async function deleteRule(db, tenantId, id) {
  const rows = await db.delete(intentRules)
    .where(and(eq(intentRules.id, id), eq(intentRules.tenantId, tenantId)))
    .returning({ id: intentRules.id });
  invalidateRulesCache(tenantId);
  return rows.length > 0;
}

/** Intenções/tags de um contato (para exibição na UI). */
async function getContactIntents(db, tenantId, contactId) {
  const events = await db.select().from(conversationIntents)
    .where(and(eq(conversationIntents.tenantId, tenantId), eq(conversationIntents.contactId, contactId)))
    .orderBy(desc(conversationIntents.detectedAt))
    .limit(50);
  const tags = await db.select().from(contactIntentTags)
    .where(and(eq(contactIntentTags.tenantId, tenantId), eq(contactIntentTags.contactId, contactId)))
    .orderBy(desc(contactIntentTags.lastDetectedAt));
  return { events, tags };
}

/** Registra pedido de ajuda do tenant para criação de regras (suporte Wamio). */
async function createSupportRequest(db, tenantId, note) {
  const [feat] = await db.select({ id: features.id }).from(features)
    .where(eq(features.slug, FEATURE_SLUG)).limit(1);
  if (!feat) return null;
  const [row] = await db.insert(featureRequests).values({
    tenantId,
    featureId: feat.id,
    status: 'pending',
    note: note ? String(note).slice(0, 2000) : 'Pedido de apoio para criação de regras de intenção.',
  }).returning();
  return row;
}

module.exports = {
  FEATURE_SLUG,
  invalidateRulesCache,
  getActiveRules,
  ensureTenantRules,
  processInboundMessage,
  listTenantRules,
  createRule,
  updateRule,
  deleteRule,
  getContactIntents,
  createSupportRequest,
};
