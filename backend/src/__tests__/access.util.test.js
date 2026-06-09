const { tenantAccessState, tenantHasActiveAccess } = require('../utils/access.util');
const now = new Date('2026-06-08T12:00:00Z');
const future = new Date('2026-06-20T12:00:00Z');
const past = new Date('2026-06-01T12:00:00Z');

describe('tenantAccessState', () => {
  it('pending', () => {
    expect(tenantAccessState({ approvalStatus: 'pending' }, null, now)).toBe('pending_approval');
  });
  it('rejected', () => {
    expect(tenantAccessState({ approvalStatus: 'rejected' }, null, now)).toBe('rejected');
  });
  it('approved sem contrato', () => {
    expect(tenantAccessState({ approvalStatus: 'approved' }, null, now)).toBe('no_contract');
  });
  it('trial vigente => active', () => {
    expect(tenantAccessState({ approvalStatus: 'approved' }, { status: 'active', isTrial: true, expiresAt: future }, now)).toBe('active');
  });
  it('trial expirado', () => {
    expect(tenantAccessState({ approvalStatus: 'approved' }, { status: 'expired', isTrial: true, expiresAt: past }, now)).toBe('trial_expired');
  });
  it('pago vencido', () => {
    expect(tenantAccessState({ approvalStatus: 'approved' }, { status: 'expired', isTrial: false, expiresAt: past }, now)).toBe('contract_expired');
  });
  it('vitalício (expiresAt null) ativo', () => {
    expect(tenantHasActiveAccess({ approvalStatus: 'approved' }, { status: 'active', isTrial: false, expiresAt: null }, now)).toBe(true);
  });
});
