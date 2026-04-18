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
