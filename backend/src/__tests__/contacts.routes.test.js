const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../config/queue', () => ({
  sendQueue: {
    process: jest.fn(),
    client: { get: jest.fn(), del: jest.fn(), set: jest.fn() },
    getJobs: jest.fn().mockResolvedValue([]),
    getJob: jest.fn(),
  },
  requestCancelFlag: jest.fn(),
  isCancelRequested: jest.fn().mockResolvedValue(false),
  clearCancelFlag: jest.fn().mockResolvedValue(undefined),
}));
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

  it('GET /api/contacts?q=... pesquisa por nome (e telefone com 2+ dígitos)', async () => {
    await request(app).post('/api/contacts').send({ name: 'Maria Clara', phone: '5511999990001' });
    await request(app).post('/api/contacts').send({ name: 'João', phone: '5511888880002' });
    const byName = await request(app).get('/api/contacts').query({ q: 'clara' });
    expect(byName.status).toBe(200);
    expect(byName.body.length).toBe(1);
    expect(byName.body[0].name).toBe('Maria Clara');
    const byPhone = await request(app).get('/api/contacts').query({ q: '99990' });
    expect(byPhone.body.length).toBe(1);
    expect(byPhone.body[0].name).toBe('Maria Clara');
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

  it('PUT /api/contacts/:id updates name, phone and tags', async () => {
    const created = await request(app).post('/api/contacts').send({ name: 'Antes', phone: '5511999990000' });
    const res = await request(app)
      .put(`/api/contacts/${created.body._id}`)
      .send({ name: 'Depois', phone: '31988887777', tags: ['a', 'b'] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Depois');
    expect(res.body.phone).toBe('5531988887777');
    expect(res.body.tags).toEqual(['a', 'b']);
  });

  it('POST /api/contacts normaliza telefone sem código do país', async () => {
    const res = await request(app).post('/api/contacts').send({ name: 'BR', phone: '11988887777' });
    expect(res.status).toBe(201);
    expect(res.body.phone).toBe('5511988887777');
  });
});
