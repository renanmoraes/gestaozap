const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));

const mockGetJobs = jest.fn().mockResolvedValue([]);
const mockGetJob = jest.fn();
const mockRemove = jest.fn().mockResolvedValue(undefined);

jest.mock('../config/queue', () => ({
  sendQueue: {
    process: jest.fn(),
    add: jest.fn(),
    getJobs: (...args) => mockGetJobs(...args),
    getJob: (...args) => mockGetJob(...args),
    client: { set: jest.fn().mockResolvedValue('OK') },
  },
  requestCancelFlag: jest.fn().mockResolvedValue(undefined),
  isCancelRequested: jest.fn().mockResolvedValue(false),
  clearCancelFlag: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/whatsapp.service', () => ({ initWhatsApp: jest.fn(), getStatus: jest.fn() }));
jest.mock('../services/queue.service', () => ({ registerProcessor: jest.fn() }));

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const { app } = require('../app');

describe('GET /api/queue/jobs', () => {
  it('returns a list', async () => {
    mockGetJobs.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/queue/jobs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/queue/job-recipients', () => {
  it('merge job contacts with logs', async () => {
    const Campaign = require('../models/campaign.model');
    const Log = require('../models/log.model');
    const camp = await new Campaign({ name: 'Tpl', text: 'Oi {nome}' }).save();
    mockGetJob.mockResolvedValueOnce({
      id: '77',
      data: {
        campaignId: camp._id,
        contacts: [
          { phone: '5511987654321', name: 'Ana' },
          { phone: '5531999990000', name: 'Bob' },
        ],
      },
    });
    await new Log({
      campaignId: camp._id,
      sendJobId: '77',
      phone: '5511987654321',
      name: 'Ana',
      status: 'sent',
      sentAt: new Date(),
    }).save();

    const res = await request(app).get('/api/queue/job-recipients').query({ jobId: '77' });
    expect(res.status).toBe(200);
    expect(res.body.recipients.length).toBe(2);
    const ana = res.body.recipients.find((r) => r.name === 'Ana');
    expect(ana.status).toBe('sent');
    expect(ana.source).toBe('merged');
    const bob = res.body.recipients.find((r) => r.name === 'Bob');
    expect(bob.status).toBe('unknown');
    expect(bob.source).toBe('queue_only');
  });

  it('returns 404 when job missing', async () => {
    mockGetJob.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/queue/job-recipients').query({ jobId: 'nope' });
    expect(res.status).toBe(404);
  });

  it('returns 400 without jobId', async () => {
    const res = await request(app).get('/api/queue/job-recipients');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/queue/jobs/:jobId/recipients (legado)', () => {
  it('same as query route', async () => {
    const Campaign = require('../models/campaign.model');
    const camp = await new Campaign({ name: 'L', text: 'x' }).save();
    mockGetJob.mockResolvedValueOnce({
      id: '88',
      data: { campaignId: camp._id, contacts: [{ phone: '5511888888888', name: 'Z' }] },
    });
    const res = await request(app).get('/api/queue/jobs/88/recipients');
    expect(res.status).toBe(200);
    expect(res.body.recipients.length).toBe(1);
  });
});

describe('POST /api/queue/jobs/:id/cancel', () => {
  it('removes a waiting job', async () => {
    mockGetJob.mockResolvedValueOnce({
      id: '99',
      getState: jest.fn().mockResolvedValue('waiting'),
      remove: mockRemove,
    });
    const res = await request(app).post('/api/queue/jobs/99/cancel');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('removed');
    expect(mockRemove).toHaveBeenCalled();
  });

  it('requests cancel for an active job', async () => {
    const q = require('../config/queue');
    mockGetJob.mockResolvedValueOnce({
      id: '100',
      getState: jest.fn().mockResolvedValue('active'),
    });
    const res = await request(app).post('/api/queue/jobs/100/cancel');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('cancelling');
    expect(q.requestCancelFlag).toHaveBeenCalledWith('100');
  });

  it('returns 404 when job missing', async () => {
    mockGetJob.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/queue/jobs/nope/cancel');
    expect(res.status).toBe(404);
  });
});
