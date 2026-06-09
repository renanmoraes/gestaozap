const { eq, and } = require('drizzle-orm');
const { contracts } = require('../db/schema');

function resolveExpiresAt({ lifetime, expiryDays, trialDays }, now = new Date()) {
  if (lifetime || expiryDays === 0) return null;
  const days = Number(expiryDays ?? trialDays ?? 30);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function expiresAtKey(date) {
  return date ? new Date(date).getTime() : null;
}

async function getActiveContract(db, tenantId) {
  const [row] = await db.select().from(contracts)
    .where(and(eq(contracts.tenantId, tenantId), eq(contracts.status, 'active')))
    .limit(1);
  return row || null;
}

async function cancelActiveContracts(dbOrTx, tenantId, now = new Date()) {
  await dbOrTx.update(contracts)
    .set({ status: 'cancelled', updatedAt: now })
    .where(and(eq(contracts.tenantId, tenantId), eq(contracts.status, 'active')));
}

function contractMatchesTarget(current, { planId, expiresAt, isTrial }) {
  if (!current) return false;
  if (current.planId !== planId) return false;
  if (expiresAtKey(current.expiresAt) !== expiresAtKey(expiresAt)) return false;
  if (Boolean(current.isTrial) !== Boolean(isTrial)) return false;
  return true;
}

/**
 * Garante um único contrato ativo por tenant. Cancela o anterior só se o alvo mudou.
 */
async function replaceActiveContract(dbOrTx, tenantId, {
  planId,
  lifetime = false,
  expiryDays,
  trialDays,
  isTrial,
  now = new Date(),
}) {
  const expiresAt = resolveExpiresAt({ lifetime, expiryDays, trialDays }, now);
  const trialFlag = isTrial != null ? Boolean(isTrial) : (expiresAt != null);

  const current = await getActiveContract(dbOrTx, tenantId);
  if (contractMatchesTarget(current, { planId, expiresAt, isTrial: trialFlag })) {
    return { created: false, contract: current, expiresAt };
  }

  await cancelActiveContracts(dbOrTx, tenantId, now);
  const [contract] = await dbOrTx.insert(contracts).values({
    tenantId,
    planId,
    status: 'active',
    startedAt: now,
    expiresAt,
    isTrial: trialFlag,
  }).returning();

  return { created: true, contract, expiresAt };
}

module.exports = {
  resolveExpiresAt,
  getActiveContract,
  cancelActiveContracts,
  replaceActiveContract,
};
