const { resolveExpiresAt } = require('../services/contract.service');

describe('resolveExpiresAt', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('retorna null para vitalício', () => {
    expect(resolveExpiresAt({ lifetime: true }, now)).toBeNull();
    expect(resolveExpiresAt({ expiryDays: 0 }, now)).toBeNull();
  });

  it('calcula data com trialDays', () => {
    const exp = resolveExpiresAt({ trialDays: 7 }, now);
    expect(exp.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });
});
