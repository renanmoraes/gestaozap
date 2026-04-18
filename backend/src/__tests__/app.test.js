const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../config/queue', () => ({ sendQueue: { process: jest.fn(), add: jest.fn() } }));

const { app } = require('../app');

describe('App bootstrap', () => {
  it('GET /api/session returns 200', async () => {
    const res = await request(app).get('/api/session');
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });
});
