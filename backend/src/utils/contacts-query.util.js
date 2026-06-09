const { eq, and, or, ilike, inArray, notInArray, sql } = require('drizzle-orm');
const { contacts } = require('../db/schema');

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
} = {}) {
  const consentCol = getConsentColumn(category);
  const baseConditions = [
    eq(contacts.tenantId, tenantId),
    eq(contacts.active, true),
    eq(contacts.optedOut, false),
    eq(consentCol, true),
  ];

  if (selectAll) {
    const { conditions } = buildListConditions(tenantId, { ...filter, optedOut: 'hide' });
    const sendConditions = [...conditions, eq(consentCol, true)];
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
  ));
}

module.exports = {
  buildListConditions,
  getConsentColumn,
  fetchEligibleContactsForSend,
};
