const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../config/queue', () => ({
  sendQueue: {
    process: jest.fn(),
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    client: { get: jest.fn(), del: jest.fn(), set: jest.fn() },
    getJobs: jest.fn().mockResolvedValue([]),
    getJob: jest.fn(),
  },
  requestCancelFlag: jest.fn(),
  isCancelRequested: jest.fn().mockResolvedValue(false),
  clearCancelFlag: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/whatsapp.service', () => ({ initWhatsApp: jest.fn(), getStatus: jest.fn(() => 'connected') }));
jest.mock('../services/queue.service', () => ({ registerProcessor: jest.fn() }));

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const { app } = require('../app');

describe('POST /api/send', () => {
  it('tests single number send', async () => {
    const whatsapp = require('../services/whatsapp.service');
    whatsapp.sendMessage = jest.fn().mockResolvedValue(undefined);

    const res = await request(app).post('/api/send/test-number').send({
      phone: '(31) 99999-9999',
      message: 'teste',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(whatsapp.sendMessage).toHaveBeenCalledWith('5531999999999', 'teste', null);
  });

  it('returns 400 on test-number when whatsapp disconnected', async () => {
    const whatsapp = require('../services/whatsapp.service');
    whatsapp.getStatus.mockReturnValueOnce('disconnected');
    const res = await request(app).post('/api/send/test-number').send({
      phone: '31999999999',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on test-number with invalid phone', async () => {
    const res = await request(app).post('/api/send/test-number').send({
      phone: '---',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when WA not connected', async () => {
    const whatsapp = require('../services/whatsapp.service');
    whatsapp.getStatus.mockReturnValueOnce('disconnected');
    const res = await request(app).post('/api/send').send({
      campaignId: new mongoose.Types.ObjectId().toString(),
      contactIds: [],
    });
    expect(res.status).toBe(400);
  });

  it('enqueues job when connected', async () => {
    const Campaign = require('../models/campaign.model');
    const camp = await new Campaign({ name: 'T', text: 'Olá {nome}!' }).save();
    const Contact = require('../models/contact.model');
    const contact = await new Contact({ name: 'João', phone: '5511000000001' }).save();

    const res = await request(app).post('/api/send').send({
      campaignId: camp._id.toString(),
      contactIds: [contact._id.toString()],
    });
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe('job-1');
  });
});
