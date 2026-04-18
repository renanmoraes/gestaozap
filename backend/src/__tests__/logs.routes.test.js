const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../config/queue', () => ({ sendQueue: { process: jest.fn(), add: jest.fn().mockResolvedValue({ id: 'job-1' }) } }));
jest.mock('../services/whatsapp.service', () => ({ initWhatsApp: jest.fn(), getStatus: jest.fn(() => 'connected') }));
jest.mock('../services/queue.service', () => ({ registerProcessor: jest.fn() }));

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const { app } = require('../app');

describe('GET /api/logs/:campaignId', () => {
  it('returns logs for campaign', async () => {
    const Log = require('../models/log.model');
    const campaignId = new mongoose.Types.ObjectId();
    await new Log({ campaignId, phone: '5511000000001', name: 'João', status: 'sent' }).save();
    const res = await request(app).get(`/api/logs/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('POST /api/logs/:campaignId/retry-failed', () => {
  it('requeues failed logs', async () => {
    const Log = require('../models/log.model');
    const Campaign = require('../models/campaign.model');
    const camp = await new Campaign({ name: 'T', text: 'Olá {nome}!' }).save();
    await new Log({ campaignId: camp._id, phone: '5511000000002', name: 'Maria', status: 'failed' }).save();
    const res = await request(app).post(`/api/logs/${camp._id}/retry-failed`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeDefined();
  });
});
