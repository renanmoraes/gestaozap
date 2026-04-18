const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const path = require('path');
const fs = require('fs');

jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../config/queue', () => ({ sendQueue: { process: jest.fn() } }));
jest.mock('../services/whatsapp.service', () => ({ initWhatsApp: jest.fn(), getStatus: jest.fn(() => 'disconnected') }));
jest.mock('../services/queue.service', () => ({ registerProcessor: jest.fn() }));

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  fs.mkdirSync(path.join(__dirname, '../../uploads'), { recursive: true });
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await mongoose.model('Campaign').deleteMany({}); });

const { app } = require('../app');

describe('Campaigns routes', () => {
  it('POST /api/campaigns creates a campaign', async () => {
    const res = await request(app).post('/api/campaigns').send({ name: 'Abril', text: 'Olá {nome}!' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Abril');
  });

  it('GET /api/campaigns returns list', async () => {
    await request(app).post('/api/campaigns').send({ name: 'Abril', text: 'Olá {nome}!' });
    const res = await request(app).get('/api/campaigns');
    expect(res.body.length).toBe(1);
  });

  it('DELETE /api/campaigns/:id removes campaign', async () => {
    const c = await request(app).post('/api/campaigns').send({ name: 'Del', text: 'X {nome}' });
    const res = await request(app).delete(`/api/campaigns/${c.body._id}`);
    expect(res.status).toBe(200);
  });
});
