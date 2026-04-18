const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../config/queue', () => ({ sendQueue: { process: jest.fn() } }));
jest.mock('../services/whatsapp.service', () => ({ initWhatsApp: jest.fn(), getStatus: jest.fn(() => 'disconnected') }));
jest.mock('../services/queue.service', () => ({ registerProcessor: jest.fn() }));

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await mongoose.model('Contact').deleteMany({}); });

const { app } = require('../app');

describe('Contacts CRUD', () => {
  it('POST /api/contacts creates a contact', async () => {
    const res = await request(app).post('/api/contacts').send({ name: 'Ana', phone: '5511999990000' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Ana');
  });

  it('GET /api/contacts returns all contacts', async () => {
    await request(app).post('/api/contacts').send({ name: 'Ana', phone: '5511999990000' });
    const res = await request(app).get('/api/contacts');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('GET /api/contacts?tag=vip filters by tag', async () => {
    await request(app).post('/api/contacts').send({ name: 'VIP', phone: '5511111111111', tags: ['vip'] });
    await request(app).post('/api/contacts').send({ name: 'Regular', phone: '5511222222222', tags: [] });
    const res = await request(app).get('/api/contacts?tag=vip');
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('VIP');
  });

  it('DELETE /api/contacts/:id deactivates contact', async () => {
    const created = await request(app).post('/api/contacts').send({ name: 'Del', phone: '5511333333333' });
    const res = await request(app).delete(`/api/contacts/${created.body._id}`);
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it('POST /api/contacts/import imports array of contacts', async () => {
    const contacts = [
      { name: 'João', phone: '5511000000001' },
      { name: 'Maria', phone: '5511000000002' },
    ];
    const res = await request(app).post('/api/contacts/import').send({ contacts });
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
  });
});
