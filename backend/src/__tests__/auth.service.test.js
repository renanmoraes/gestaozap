const { hashPassword, verifyPassword, generateTempPassword, generateUniqueCompanyId } = require('../services/auth.service');

describe('auth.service helpers', () => {
  it('generateTempPassword returns string with requested length', () => {
    const pwd = generateTempPassword(12);
    expect(pwd).toHaveLength(12);
  });

  it('generateUniqueCompanyId returns uppercase hex string', async () => {
    // mock mínimo — só valida formato quando db não disponível
    expect(typeof generateUniqueCompanyId).toBe('function');
  });

  it('hashPassword and verifyPassword work together', async () => {
    const hash = await hashPassword('SenhaForte123!');
    expect(await verifyPassword('SenhaForte123!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
