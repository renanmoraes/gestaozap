const { normalizePhoneForWhatsApp, phonesMatchLoose } = require('../utils/phone.util');

describe('normalizePhoneForWhatsApp', () => {
  it('adiciona 55 em número só com DDD (11 dígitos)', () => {
    expect(normalizePhoneForWhatsApp('31997790510')).toBe('5531997790510');
  });

  it('mantém número já com 55', () => {
    expect(normalizePhoneForWhatsApp('5531997790510')).toBe('5531997790510');
  });

  it('remove +, espaços e pontuação', () => {
    expect(normalizePhoneForWhatsApp('+55 (31) 99779-0510')).toBe('5531997790510');
  });

  it('fixo 10 dígitos recebe 55', () => {
    expect(normalizePhoneForWhatsApp('1133334444')).toBe('551133334444');
  });

  it('retorna vazio para entrada vazia', () => {
    expect(normalizePhoneForWhatsApp('')).toBe('');
    expect(normalizePhoneForWhatsApp('   ')).toBe('');
  });
});

describe('phonesMatchLoose', () => {
  it('reconhece o mesmo número em formatos diferentes', () => {
    expect(phonesMatchLoose('5531997790510', '+55 (31) 99779-0510')).toBe(true);
    expect(phonesMatchLoose('31997790510', '5531997790510')).toBe(true);
  });
});
