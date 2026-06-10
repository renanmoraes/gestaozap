const { eq, and, or, ilike, inArray, notInArray, sql } = require('drizzle-orm');
const { contacts } = require('../db/schema');

// Janelas de temperatura em dias [min, max] (spec §11)
const TEMPERATURE_WINDOWS = {
  hot: [0, 7],
  warm: [8, 30],
  cool: [31, 90],
  cold: [91, 365],
  expired: [366, 100000],
};

// Expressão SQL do peso temporal (spec §12) relativa a uma data de referência.
function temporalWeightSql(refSql) {
  return sql`CASE
    WHEN ci.detected_at >= ${refSql}::timestamptz - interval '7 days'   THEN 1.00
    WHEN ci.detected_at >= ${refSql}::timestamptz - interval '30 days'  THEN 0.70
    WHEN ci.detected_at >= ${refSql}::timestamptz - interval '90 days'  THEN 0.40
    WHEN ci.detected_at >= ${refSql}::timestamptz - interval '365 days' THEN 0.15
    ELSE 0.03 END`;
}

/**
 * Constrói condições SQL (drizzle) de filtro por intenção para o disparo.
 * A data de referência é sempre a data da busca/campanha (spec §14).
 * @returns {Array} lista de condições para entrar no AND principal
 */
function buildIntentConditions(tenantId, intentFilter = {}, referenceDate = new Date()) {
  const conds = [];
  if (!intentFilter || typeof intentFilter !== 'object') return conds;

  const include = Array.isArray(intentFilter.include_intents) ? intentFilter.include_intents.filter(Boolean) : [];
  const exclude = Array.isArray(intentFilter.exclude_intents) ? intentFilter.exclude_intents.filter(Boolean) : [];
  const temps = Array.isArray(intentFilter.temperatures) ? intentFilter.temperatures.filter((t) => TEMPERATURE_WINDOWS[t]) : [];
  const minFinal = Number(intentFilter.min_final_score);
  const dateFrom = intentFilter.date_from ? new Date(intentFilter.date_from) : null;
  const dateTo = intentFilter.date_to ? new Date(intentFilter.date_to) : null;
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const refSql = sql`${ref}`;

  // Janela de dias derivada das temperaturas (união aproximada: min..max)
  let dayLo = null;
  let dayHi = null;
  if (temps.length) {
    dayLo = Math.min(...temps.map((t) => TEMPERATURE_WINDOWS[t][0]));
    dayHi = Math.max(...temps.map((t) => TEMPERATURE_WINDOWS[t][1]));
  }

  function windowAndScoreSql(applyScore) {
    const parts = [sql`ci.tenant_id = ${tenantId}`, sql`ci.contact_id = ${contacts.id}`];
    if (dayHi != null) {
      // detected_at entre (ref - dayHi) e (ref - dayLo)
      parts.push(sql`ci.detected_at >= ${refSql}::timestamptz - (${dayHi} * interval '1 day')`);
      parts.push(sql`ci.detected_at <= ${refSql}::timestamptz - (${dayLo} * interval '1 day')`);
    }
    if (dateFrom) parts.push(sql`ci.detected_at >= ${dateFrom}::timestamptz`);
    if (dateTo) parts.push(sql`ci.detected_at <= ${dateTo}::timestamptz`);
    if (applyScore && Number.isFinite(minFinal) && minFinal > 0) {
      parts.push(sql`(ci.confidence * (${temporalWeightSql(refSql)})) >= ${minFinal}`);
    }
    return sql.join(parts, sql` AND `);
  }

  if (include.length) {
    const inList = sql.join(include.map((k) => sql`${k}`), sql`, `);
    conds.push(sql`EXISTS (SELECT 1 FROM conversation_intents ci WHERE ${windowAndScoreSql(true)} AND ci.intent_key IN (${inList}))`);
  }

  if (exclude.length) {
    const exList = sql.join(exclude.map((k) => sql`${k}`), sql`, `);
    // Exclusão independe de score; respeita date range se informado (senão, todo histórico).
    const exParts = [sql`ci.tenant_id = ${tenantId}`, sql`ci.contact_id = ${contacts.id}`, sql`ci.intent_key IN (${exList})`];
    if (dateFrom) exParts.push(sql`ci.detected_at >= ${dateFrom}::timestamptz`);
    if (dateTo) exParts.push(sql`ci.detected_at <= ${dateTo}::timestamptz`);
    conds.push(sql`NOT EXISTS (SELECT 1 FROM conversation_intents ci WHERE ${sql.join(exParts, sql` AND `)})`);
  }

  return conds;
}

function buildListConditions(tenantId, query = {}) {
  const q = String(query.q ?? query.search ?? '').trim();
  const conditions = [
    eq(contacts.tenantId, tenantId),
    eq(contacts.active, true),
  ];

  if (query.tag) {
    conditions.push(sql`${contacts.tags} @> ARRAY[${query.tag}]::text[]`);
  }

  if (q) {
    const digitsQ = q.replace(/\D/g, '');
    const orConditions = [ilike(contacts.name, `%${q}%`)];
    if (digitsQ.length >= 2) {
      orConditions.push(ilike(contacts.phone, `%${digitsQ}%`));
    }
    conditions.push(or(...orConditions));
  }

  const optedOutMode = String(query.optedOut || 'hide');
  if (optedOutMode === 'only') {
    conditions.push(eq(contacts.optedOut, true));
  } else if (optedOutMode !== 'all') {
    conditions.push(eq(contacts.optedOut, false));
  }

  return { conditions, q };
}

function getConsentColumn(category = 'marketing') {
  const map = {
    marketing: contacts.consentMarketing,
    transactional: contacts.consentTransactional,
    support: contacts.consentSupport,
    billing: contacts.consentBilling,
  };
  return map[category] || contacts.consentMarketing;
}

/**
 * Resolve contatos elegíveis para disparo (opt-out, consent, filtros).
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db
 */
async function fetchEligibleContactsForSend(db, tenantId, {
  contactIds,
  selectAll = false,
  filter = {},
  excludeContactIds = [],
  category = 'marketing',
  intentFilter = null,
  referenceDate = new Date(),
} = {}) {
  const consentCol = getConsentColumn(category);
  const intentConds = intentFilter ? buildIntentConditions(tenantId, intentFilter, referenceDate) : [];
  const baseConditions = [
    eq(contacts.tenantId, tenantId),
    eq(contacts.active, true),
    eq(contacts.optedOut, false),
    eq(consentCol, true),
  ];

  if (selectAll) {
    const { conditions } = buildListConditions(tenantId, { ...filter, optedOut: 'hide' });
    const sendConditions = [...conditions, eq(consentCol, true), ...intentConds];
    if (excludeContactIds?.length) {
      sendConditions.push(notInArray(contacts.id, excludeContactIds));
    }
    return db.select().from(contacts).where(and(...sendConditions));
  }

  if (!Array.isArray(contactIds) || !contactIds.length) {
    return [];
  }

  return db.select().from(contacts).where(and(
    ...baseConditions,
    inArray(contacts.id, contactIds),
    ...intentConds,
  ));
}

module.exports = {
  buildListConditions,
  getConsentColumn,
  fetchEligibleContactsForSend,
  buildIntentConditions,
  TEMPERATURE_WINDOWS,
};
