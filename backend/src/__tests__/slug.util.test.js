const { slugify } = require('../utils/slug.util');

describe('slugify', () => {
  it('normaliza acentos e espaços', () => {
    expect(slugify('Farmácia Vida Plena')).toBe('farmacia-vida-plena');
  });
  it('remove caracteres inválidos e colapsa hífens', () => {
    expect(slugify('  João & Cia!! ')).toBe('joao-cia');
  });
  it('fallback quando vazio', () => {
    expect(slugify('@@@')).toBe('cliente');
  });
  it('limita a 63 caracteres', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(63);
  });
});
