const {
  resolveDayWindows,
  isBlocked,
  hasBookingConflict,
} = require('./booking-availability.service');
const { addMinutes, rangesOverlap } = require('../utils/booking-time.util');

describe('booking-availability.service', () => {
  const rules = [
    { weekday: 1, startLocalTime: '09:00', endLocalTime: '12:00', isActive: true },
  ];
  const exceptions = [{ dateLocal: '2026-06-09', mode: 'closed' }];

  it('resolveDayWindows retorna vazio em exceção closed', () => {
    expect(resolveDayWindows('2026-06-09', rules, exceptions, 'America/Sao_Paulo')).toEqual([]);
  });

  it('resolveDayWindows retorna janela do weekday', () => {
    // 2026-06-08 is Monday
    const windows = resolveDayWindows('2026-06-08', rules, [], 'America/Sao_Paulo');
    expect(windows).toEqual([{ start: '09:00', end: '12:00' }]);
  });

  it('isBlocked detecta bloqueio manual', () => {
    const start = new Date('2026-06-08T12:00:00Z');
    const end = new Date('2026-06-08T12:30:00Z');
    const blocks = [{ startsAt: new Date('2026-06-08T11:00:00Z'), endsAt: new Date('2026-06-08T13:00:00Z') }];
    expect(isBlocked(start, end, blocks)).toBe(true);
  });

  it('hasBookingConflict aplica buffer', () => {
    const start = new Date('2026-06-08T12:00:00Z');
    const end = new Date('2026-06-08T12:30:00Z');
    const existing = [{
      startsAt: new Date('2026-06-08T12:25:00Z'),
      endsAt: new Date('2026-06-08T12:55:00Z'),
    }];
    expect(hasBookingConflict(start, end, existing, 0, 0)).toBe(true);
    expect(hasBookingConflict(start, end, existing, 10, 0)).toBe(true);
  });

  it('rangesOverlap respeita end exclusivo', () => {
    const a0 = new Date('2026-06-08T12:00:00Z');
    const a1 = new Date('2026-06-08T12:30:00Z');
    expect(rangesOverlap(a0, a1, a1, addMinutes(a1, 30))).toBe(false);
  });
});
