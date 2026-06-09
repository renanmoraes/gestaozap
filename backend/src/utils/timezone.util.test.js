const { isOutsideSendWindow, msUntilNextHourBr } = require('./timezone.util');

// Brasília = UTC-3 (sem horário de verão desde 2019). Datas em UTC explícito
// tornam os testes determinísticos independentemente do TZ da máquina.
const utc = (iso) => new Date(iso);

describe('isOutsideSendWindow (janela 8h–20h Brasília)', () => {
  test('14:00 BRT está dentro', () => {
    expect(isOutsideSendWindow(8, 20, utc('2026-06-08T17:00:00Z'))).toBe(false);
  });
  test('20:00 BRT está fora (fim exclusivo)', () => {
    expect(isOutsideSendWindow(8, 20, utc('2026-06-08T23:00:00Z'))).toBe(true);
  });
  test('07:00 BRT está fora (antes da abertura)', () => {
    expect(isOutsideSendWindow(8, 20, utc('2026-06-08T10:00:00Z'))).toBe(true);
  });
  test('08:00 BRT está dentro (início inclusivo)', () => {
    expect(isOutsideSendWindow(8, 20, utc('2026-06-08T11:00:00Z'))).toBe(false);
  });
});

describe('msUntilNextHourBr (delay até próxima abertura)', () => {
  test('20:30 BRT → próxima 08h = 11h30 (41.400.000 ms)', () => {
    expect(msUntilNextHourBr(8, utc('2026-06-08T23:30:00Z'))).toBe(41400000);
  });
  test('07:00 BRT → próxima 08h = 1h (3.600.000 ms)', () => {
    expect(msUntilNextHourBr(8, utc('2026-06-08T10:00:00Z'))).toBe(3600000);
  });
});
