const { isValidCPF, isValidCNPJ, validateDocument } = require('../utils/document.util');

describe('document.util', () => {
  it('CPF válido', () => { expect(isValidCPF('529.982.247-25')).toBe(true); });
  it('CPF inválido (DV)', () => { expect(isValidCPF('529.982.247-20')).toBe(false); });
  it('CPF repetido inválido', () => { expect(isValidCPF('111.111.111-11')).toBe(false); });
  it('CNPJ válido', () => { expect(isValidCNPJ('11.222.333/0001-81')).toBe(true); });
  it('CNPJ inválido', () => { expect(isValidCNPJ('11.222.333/0001-80')).toBe(false); });
  it('validateDocument despacha por tipo', () => {
    expect(validateDocument('cpf', '529.982.247-25')).toBe(true);
    expect(validateDocument('cnpj', '11.222.333/0001-81')).toBe(true);
    expect(validateDocument('xx', '123')).toBe(false);
  });
});
