const {
  parseDateKey,
  parseMonthKey,
  parseLocalTime,
  rangesOverlap,
  buildPublicBookingUrl,
  buildPromotionShareUrl,
} = require('./booking-time.util');

describe('booking-time.util', () => {
  it('parseDateKey aceita YYYY-MM-DD', () => {
    expect(parseDateKey('2026-06-12')).toBe('2026-06-12');
    expect(parseDateKey('invalid')).toBeNull();
  });

  it('parseMonthKey aceita YYYY-MM', () => {
    expect(parseMonthKey('2026-06')).toBe('2026-06');
    expect(parseMonthKey('2026-6')).toBeNull();
  });

  it('parseLocalTime converte HH:mm em minutos', () => {
    expect(parseLocalTime('09:30')).toBe(570);
    expect(parseLocalTime('bad')).toBeNull();
  });

  it('rangesOverlap detecta interseção com end exclusivo', () => {
    const a0 = new Date('2026-06-12T12:00:00Z');
    const a1 = new Date('2026-06-12T12:30:00Z');
    const b0 = new Date('2026-06-12T12:29:00Z');
    const b1 = new Date('2026-06-12T13:00:00Z');
    expect(rangesOverlap(a0, a1, b0, b1)).toBe(true);
    expect(rangesOverlap(a0, a1, a1, b1)).toBe(false);
  });

  it('buildPublicBookingUrl monta query params', () => {
    const url = buildPublicBookingUrl('loja', {
      date: '2026-06-12',
      month: '2026-06',
      eventTypeId: 'abc',
      baseOrigin: 'https://loja.gestaozap.digital',
    });
    expect(url).toContain('/agendar?');
    expect(url).toContain('date=2026-06-12');
    expect(url).toContain('month=2026-06');
    expect(url).toContain('tipo=abc');
  });

  it('buildPromotionShareUrl usa hash', () => {
    const url = buildPromotionShareUrl('loja', 'Promocao01', 'https://loja.gestaozap.digital');
    expect(url).toBe('https://loja.gestaozap.digital/promocao-do-dia#Promocao01');
  });
});
