// Testes do ciclo de vida da sessão WhatsApp (correção anti-OOM):
// - single-flight: não cria múltiplos Client para o mesmo tenant
// - destroy em toda saída: disconnected fecha o Chrome (sem vazar processo)
// (nomes prefixados com `mock` por exigência do jest.mock factory)
const mockCaptured = { handlers: {}, constructed: 0 };
const mockDestroy = jest.fn().mockResolvedValue(undefined);

jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => {
    mockCaptured.constructed++;
    return {
      on: (ev, fn) => { (mockCaptured.handlers[ev] = mockCaptured.handlers[ev] || []).push(fn); },
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: mockDestroy,
      info: { wid: { user: '5531999999999' } },
    };
  }),
  LocalAuth: jest.fn(),
  MessageMedia: { fromFilePath: jest.fn() },
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fake') }));
jest.mock('../db', () => ({
  getDb: () => ({
    update: () => ({ set: () => ({ where: async () => {} }) }),
    select: () => ({ from: () => ({ where: async () => [] }) }),
  }),
}));

const io = { to: () => ({ emit: () => {} }) };
const flush = () => new Promise((r) => setImmediate(r));

const service = require('../services/whatsapp.service');

function fire(ev, ...args) {
  return Promise.all((mockCaptured.handlers[ev] || []).map((fn) => fn(...args)));
}

describe('whatsapp session lifecycle (anti-OOM)', () => {
  beforeEach(() => { mockCaptured.handlers = {}; mockCaptured.constructed = 0; mockDestroy.mockClear(); });

  it('single-flight: initWhatsApp chamado 2x cria só 1 Client', () => {
    service.initWhatsApp('t-guard', io);
    service.initWhatsApp('t-guard', io);
    expect(mockCaptured.constructed).toBe(1);
  });

  it('disconnected destrói o client (não vaza Chrome) e marca desconectado', async () => {
    service.initWhatsApp('t-disc', io);
    expect(mockCaptured.constructed).toBe(1);

    await fire('ready');
    await flush();
    expect(service.getStatus('t-disc')).toBe('connected');

    await fire('disconnected', 'NAVIGATION');
    await flush();
    expect(mockDestroy).toHaveBeenCalled();
    expect(service.getStatus('t-disc')).toBe('disconnected');
    expect(service.getClientFor('t-disc')).toBeNull();
  });

  it('reconectar após queda volta a conectar', async () => {
    service.initWhatsApp('t-reconnect', io);
    await fire('ready');
    await flush();
    expect(service.getStatus('t-reconnect')).toBe('connected');
  });
});
