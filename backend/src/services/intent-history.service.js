// Reprocessamento de histórico de intenções via Bull (spec §9.1 / §21).
// Só processa mensagens já salvas no banco do Wamio (spec §9.2): nunca tenta
// puxar histórico antigo do WhatsApp.

const { and, eq, gte, asc } = require('drizzle-orm');
const { getDb } = require('../db');
const { messages, tenants } = require('../db/schema');
const { getIntentHistoryQueue } = require('../config/queue');
const { tenantHasFeature } = require('./feature.service');
const { processInboundMessage } = require('./intent.service');

const WINDOW_DAYS = { '7d': 7, '30d': 30, '90d': 90, all: null };

function windowToSince(window) {
  const days = WINDOW_DAYS[window];
  if (days == null) return null; // todo histórico
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

let registered = false;

/**
 * Registra o processador da fila de reprocessamento para todos os tenants ativos.
 * Chamado no boot (app.js).
 */
async function registerIntentHistoryProcessor(io) {
  if (registered) return;
  registered = true;
  const db = getDb();
  const activeTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.active, true));
  for (const t of activeTenants) {
    registerForTenant(db, io, t.id);
  }
}

function registerForTenant(db, io, tenantId) {
  const queue = getIntentHistoryQueue(tenantId);
  queue.process(async (job) => runReprocess(db, io, tenantId, job));
}

async function runReprocess(db, io, tenantId, job) {
  const { window = '30d' } = job.data || {};

  const feat = await tenantHasFeature(db, tenantId, 'intencoes');
  if (!feat.active) return { skipped: true, reason: 'feature_inactive' };

  if (io) io.to(tenantId).emit('intent:history_reprocess_started', { tenantId, window });

  const since = windowToSince(window);
  const conds = [eq(messages.tenantId, tenantId), eq(messages.direction, 'in')];
  if (since) conds.push(gte(messages.waTimestamp, since));
  const where = and(...conds);

  const BATCH = 500;
  let processed = 0;
  let detected = 0;
  let offset = 0;

  // Paginação por offset, ordenada de forma estável (created_at, id).
  // A detecção é idempotente (uniq message_id+intent_key), então reprocessar não duplica.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await db.select({
      id: messages.id,
      conversationId: messages.conversationId,
      body: messages.body,
    })
      .from(messages)
      .where(where)
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(BATCH)
      .offset(offset);

    if (!rows.length) break;

    for (const m of rows) {
      if (m.body) {
        try {
          const r = await processInboundMessage(db, io, {
            tenantId,
            conversationId: m.conversationId,
            messageId: m.id,
            body: m.body,
          });
          if (r?.intents?.length) detected += r.intents.length;
        } catch (_) { /* ignora falha pontual */ }
      }
      processed += 1;
    }

    if (job.progress) await job.progress(processed);
    offset += rows.length;
    if (rows.length < BATCH) break;
  }

  if (io) io.to(tenantId).emit('intent:history_reprocess_finished', { tenantId, window, processed, detected });
  return { processed, detected, window };
}

/**
 * Enfileira um job de reprocessamento. Retorna o job criado.
 */
async function enqueueReprocess(io, tenantId, window = '30d') {
  // Garante processador registrado para este tenant (caso criado após o boot).
  registerForTenant(getDb(), io, tenantId);
  const queue = getIntentHistoryQueue(tenantId);
  const job = await queue.add({ window }, { removeOnComplete: true, removeOnFail: 50 });
  return job;
}

module.exports = {
  registerIntentHistoryProcessor,
  enqueueReprocess,
  WINDOW_DAYS,
};
