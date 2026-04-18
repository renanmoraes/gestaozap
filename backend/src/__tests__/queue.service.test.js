const { buildAntibanDelay, shouldPauseBatch, buildMessage } = require('../services/queue.service');

describe('buildAntibanDelay', () => {
  it('returns value between 15000 and 60000', () => {
    for (let i = 0; i < 20; i++) {
      const d = buildAntibanDelay();
      expect(d).toBeGreaterThanOrEqual(15000);
      expect(d).toBeLessThanOrEqual(60000);
    }
  });
  it('is never the same twice in a row (randomness check)', () => {
    const delays = new Set(Array.from({ length: 10 }, () => buildAntibanDelay()));
    expect(delays.size).toBeGreaterThan(1);
  });
});

describe('shouldPauseBatch', () => {
  it('returns true every 30 messages (but not at 0)', () => {
    expect(shouldPauseBatch(30)).toBe(true);
    expect(shouldPauseBatch(60)).toBe(true);
    expect(shouldPauseBatch(0)).toBe(false);
    expect(shouldPauseBatch(29)).toBe(false);
    expect(shouldPauseBatch(31)).toBe(false);
  });
});

describe('buildMessage', () => {
  it('replaces {nome} with contact name', () => {
    expect(buildMessage('Olá {nome}!', 'Maria')).toBe('Olá Maria!');
  });
});
