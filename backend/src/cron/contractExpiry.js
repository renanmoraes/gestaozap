const { eq, and, lte, isNotNull } = require('drizzle-orm');
const { getDb } = require('../db');
const { contracts, tenants, whatsappSessions } = require('../db/schema');

/**
 * Desativa tenants cujos contratos venceram.
 * Roda diariamente às 00:00 (horário do container: America/Sao_Paulo).
 */
async function deactivateExpiredContracts() {
  const now = new Date();
  const db = getDb();

  // Contratos vitalícios (expires_at = NULL) nunca expiram — ignorados pelo cron
  const expired = await db.select({
    contractId: contracts.id,
    tenantId: contracts.tenantId,
  }).from(contracts)
    .where(and(
      eq(contracts.status, 'active'),
      isNotNull(contracts.expiresAt),
      lte(contracts.expiresAt, now),
    ));

  if (!expired.length) {
    console.log('[cron] nenhum contrato expirado');
    return { deactivated: 0 };
  }

  let deactivated = 0;
  for (const { contractId, tenantId } of expired) {
    try {
      // Marca o contrato como expirado
      await db.update(contracts)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(contracts.id, contractId));

      // Desativa o tenant
      await db.update(tenants)
        .set({ active: false, updatedAt: now })
        .where(eq(tenants.id, tenantId));

      // Persiste status WA como desconectado
      await db.update(whatsappSessions)
        .set({ status: 'disconnected', connectedPhone: null, updatedAt: now })
        .where(eq(whatsappSessions.tenantId, tenantId));

      // Encerra a sessão WhatsApp em memória se houver
      try {
        const whatsapp = require('../services/whatsapp.service');
        const client = whatsapp.getClientFor(tenantId);
        if (client) await client.destroy().catch(() => {});
      } catch (_) {}

      deactivated++;
      console.log(`[cron] tenant ${tenantId} desativado — contrato ${contractId} expirou`);
    } catch (err) {
      console.error(`[cron] erro ao desativar tenant ${tenantId}:`, err.message);
    }
  }

  console.log(`[cron] ${deactivated} tenant(s) desativado(s)`);
  return { deactivated };
}

function msUntilMidnight() {
  // TZ=America/Sao_Paulo no container — new Date() opera no fuso correto
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // próxima meia-noite local
  return midnight - now;
}

function scheduleContractExpiryCheck() {
  const run = async () => {
    try {
      await deactivateExpiredContracts();
    } catch (err) {
      console.error('[cron] falha na verificação de contratos:', err.message);
    } finally {
      // Re-agenda para a próxima meia-noite
      setTimeout(run, msUntilMidnight());
    }
  };

  const ms = msUntilMidnight();
  const hMin = Math.round(ms / 60_000);
  setTimeout(run, ms);
  console.log(`[cron] expiração de contratos agendada (próxima verificação em ~${hMin} min)`);
}

module.exports = { scheduleContractExpiryCheck, deactivateExpiredContracts };
