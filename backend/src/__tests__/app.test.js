jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../config/queue', () => ({ sendQueue: { process: jest.fn(), add: jest.fn() } }));
jest.mock('../services/whatsapp.service', () => ({
  initWhatsApp: jest.fn(),
  getStatus: jest.fn(() => 'disconnected'),
}));
jest.mock('../services/queue.service', () => ({ registerProcessor: jest.fn() }));

const request = require('supertest');
const { app } = require('../app');
const whatsapp = require('../services/whatsapp.service');

describe('GET /api/session', () => {
  it('returns status disconnected', async () => {
    const res = await request(app).get('/api/session');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disconnected');
  });
});

describe('POST /api/session/start', () => {
  it('calls initWhatsApp and returns 200', async () => {
    const res = await request(app).post('/api/session/start');
    expect(res.status).toBe(200);
    expect(whatsapp.initWhatsApp).toHaveBeenCalled();
  });
});
