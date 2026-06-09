// Fonte de verdade do gate: contract.status (o cron vira 'expired' no fim do trial).
// expiresAt > now é rede de segurança caso o cron atrase.
function tenantAccessState(tenant, contract, now = new Date()) {
  if (!tenant) return 'no_tenant';
  if (tenant.approvalStatus === 'pending') return 'pending_approval';
  if (tenant.approvalStatus === 'rejected') return 'rejected';
  if (!contract) return 'no_contract';
  const vigente = contract.status === 'active'
    && (!contract.expiresAt || new Date(contract.expiresAt) > now);
  if (vigente) return 'active';
  return contract.isTrial ? 'trial_expired' : 'contract_expired';
}

function tenantHasActiveAccess(tenant, contract, now) {
  return tenantAccessState(tenant, contract, now) === 'active';
}

module.exports = { tenantAccessState, tenantHasActiveAccess };
