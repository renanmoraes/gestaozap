jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    initialize: jest.fn(),
  })),
  LocalAuth: jest.fn(),
  MessageMedia: { fromFilePath: jest.fn() },
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fake') }));

const service = require('../services/whatsapp.service');

describe('whatsapp service interface', () => {
  it('initial status is disconnected', () => {
    expect(service.getStatus()).toBe('disconnected');
  });

  it('tracks consecutive failures', () => {
    service.resetConsecutiveFailures();
    service.incrementFailures();
    service.incrementFailures();
    expect(service.getConsecutiveFailures()).toBe(2);
    service.resetConsecutiveFailures();
    expect(service.getConsecutiveFailures()).toBe(0);
  });
});

describe('isOptOutText', () => {
  const { isOptOutText } = require('../services/whatsapp.service');

  it('detecta "sair do evento" em qualquer posição', () => {
    expect(isOptOutText('sair do evento')).toBe(true);
    expect(isOptOutText('por favor sair do evento obrigado')).toBe(true);
    expect(isOptOutText('SAIR DO EVENTO')).toBe(true);
  });

  it('detecta "sair" exato', () => {
    expect(isOptOutText('sair')).toBe(true);
    expect(isOptOutText('SAIR')).toBe(true);
  });

  it('detecta "stop" exato', () => {
    expect(isOptOutText('stop')).toBe(true);
    expect(isOptOutText('STOP')).toBe(true);
  });

  it('detecta "remover" exato', () => {
    expect(isOptOutText('remover')).toBe(true);
    expect(isOptOutText('REMOVER')).toBe(true);
  });

  it('não detecta "sair" embutido em outras palavras', () => {
    expect(isOptOutText('sairei amanhã')).toBe(false);
    expect(isOptOutText('não quero sair agora')).toBe(false);
  });

  it('não detecta mensagens normais', () => {
    expect(isOptOutText('tudo bem, obrigado!')).toBe(false);
    expect(isOptOutText('confirmo presença')).toBe(false);
    expect(isOptOutText('')).toBe(false);
  });
});
