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
jest.mock('../services/whatsapp.service', () => ({
  initWhatsApp: jest.fn(),
  getStatus: jest.fn(() => 'connected'),
  listIncomingMessagesSince: jest.fn().mockResolvedValue([]),
}));
jest.mock('../services/queue.service', () => ({ registerProcessor: jest.fn() }));

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const { app } = require('../app');
const { sendQueue } = require('../config/queue');

describe('POST /api/logs/:campaignId/analyze-replies', () => {
  it('usa o mesmo merge que job-recipients quando sendJobId no log não casa com o job', async () => {
    const Log = require('../models/log.model');
    const Campaign = require('../models/campaign.model');
    const camp = await new Campaign({ name: 'C', text: 'Oi {nome}' }).save();
    await new Log({
      campaignId: camp._id,
      sendJobId: 'outro-job',
      phone: '5511999999999',
      name: 'Zé',
      status: 'sent',
      sentAt: new Date(),
    }).save();

    sendQueue.getJob.mockResolvedValueOnce({
      id: '12',
      data: {
        campaignId: camp._id,
        contacts: [{ phone: '5511999999999', name: 'Zé' }],
      },
    });

    const res = await request(app)
      .post(`/api/logs/${camp._id}/analyze-replies`)
      .send({ runId: '12' });

    expect(res.status).toBe(200);
    expect(res.body.totals.sentContacts).toBe(1);
    expect(res.body.contacts.length).toBe(1);
  });
});

describe('GET /api/logs/:campaignId/inspect-run', () => {
  it('returns Mongo counts for campaign + sendJobId (runId)', async () => {
    const Log = require('../models/log.model');
    const campaignId = new mongoose.Types.ObjectId();
    await new Log({
      campaignId,
      phone: '5511000000001',
      name: 'João',
      status: 'sent',
      sendJobId: '12',
      sentAt: new Date(),
    }).save();

    const res = await request(app)
      .get(`/api/logs/${campaignId}/inspect-run`)
      .query({ runId: '12' });

    expect(res.status).toBe(200);
    expect(res.body.totalLogsEsteJob).toBe(1);
    expect(res.body.sentStatusCount).toBe(1);
    expect(res.body.runId).toBe('12');
  });
});

describe('GET /api/logs/:campaignId', () => {
  it('returns logs for campaign', async () => {
    const Log = require('../models/log.model');
    const campaignId = new mongoose.Types.ObjectId();
    await new Log({ campaignId, phone: '5511000000001', name: 'João', status: 'sent' }).save();
    const res = await request(app).get(`/api/logs/${campaignId}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('supports filtering logs by runId', async () => {
    const Log = require('../models/log.model');
    const campaignId = new mongoose.Types.ObjectId();
    await new Log({
      campaignId,
      phone: '31999990000',
      name: 'Maria',
      status: 'failed',
      sendJobId: 'run-a',
    }).save();
    await new Log({
      campaignId,
      phone: '5531999990000',
      name: 'Maria',
      status: 'sent',
      sendJobId: 'run-b',
    }).save();

    const res = await request(app).get(`/api/logs/${campaignId}`).query({ runId: 'run-b' });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].status).toBe('sent');
  });
});

describe('GET /api/logs/reply-analysis', () => {
  it('returns null when no snapshot exists', async () => {
    const campaignId = new mongoose.Types.ObjectId();
    const res = await request(app).get('/api/logs/reply-analysis').query({ campaignId: String(campaignId), runId: '12' });
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns saved snapshot', async () => {
    const FeedbackAnalysis = require('../models/feedbackAnalysis.model');
    const campaignId = new mongoose.Types.ObjectId();
    const payload = {
      campaignId: String(campaignId),
      campaignName: 'X',
      runId: '12',
      totals: { sentContacts: 1, respondedContacts: 0, positive: 0, negative: 0, neutral: 0, noReply: 1 },
      contacts: [],
      generatedAt: new Date(),
    };
    await FeedbackAnalysis.create({ campaignId, runId: '12', payload });
    const res = await request(app).get('/api/logs/reply-analysis').query({ campaignId: String(campaignId), runId: '12' });
    expect(res.status).toBe(200);
    expect(res.body.campaignName).toBe('X');
    expect(res.body.totals.sentContacts).toBe(1);
    expect(res.body.snapshotAt).toBeDefined();
  });
});

describe('GET /api/logs/:campaignId/analysis (legado)', () => {
  it('mesmo comportamento via path aninhado', async () => {
    const FeedbackAnalysis = require('../models/feedbackAnalysis.model');
    const campaignId = new mongoose.Types.ObjectId();
    const payload = {
      campaignId: String(campaignId),
      campaignName: 'Y',
      runId: '7',
      totals: { sentContacts: 0, respondedContacts: 0, positive: 0, negative: 0, neutral: 0, noReply: 0 },
      contacts: [],
      generatedAt: new Date(),
    };
    await FeedbackAnalysis.create({ campaignId, runId: '7', payload });
    const res = await request(app).get(`/api/logs/${campaignId}/analysis`).query({ runId: '7' });
    expect(res.status).toBe(200);
    expect(res.body.campaignName).toBe('Y');
  });
});

describe('GET /api/logs/:campaignId/runs', () => {
  it('returns grouped runs for campaign', async () => {
    const Log = require('../models/log.model');
    const campaignId = new mongoose.Types.ObjectId();
    await new Log({ campaignId, sendJobId: 'run-1', phone: '5511000000001', name: 'A', status: 'sent' }).save();
    await new Log({ campaignId, sendJobId: 'run-1', phone: '5511000000002', name: 'B', status: 'failed' }).save();
    await new Log({ campaignId, sendJobId: 'run-2', phone: '5511000000003', name: 'C', status: 'pending' }).save();
    const res = await request(app).get(`/api/logs/${campaignId}/runs`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    const run1 = res.body.find((r) => r.runId === 'run-1');
    expect(run1.total).toBe(2);
  });
});

describe('GET /api/logs/runs', () => {
  it('returns global run list grouped by campaign+run', async () => {
    const Log = require('../models/log.model');
    const Campaign = require('../models/campaign.model');
    const c1 = await new Campaign({ name: 'Template A', text: 'x' }).save();
    await new Log({ campaignId: c1._id, sendJobId: 'run-x', phone: '5511', name: 'A', status: 'sent' }).save();
    const res = await request(app).get('/api/logs/runs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r) => r.campaignId === String(c1._id) && r.runId === 'run-x')).toBe(true);
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
    expect(res.body.retrying).toBe(1);
  });

  it('returns message when there are no failed logs', async () => {
    const Campaign = require('../models/campaign.model');
    const camp = await new Campaign({ name: 'V', text: 'Hi' }).save();
    const res = await request(app).post(`/api/logs/${camp._id}/retry-failed`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeUndefined();
    expect(res.body.retrying).toBe(0);
  });
});

describe('POST /api/logs/:campaignId/retry/:logId', () => {
  it('requeues a single failed log', async () => {
    const Log = require('../models/log.model');
    const Campaign = require('../models/campaign.model');
    const camp = await new Campaign({ name: 'T', text: 'Olá {nome}!' }).save();
    const log = await new Log({
      campaignId: camp._id,
      phone: '5511000000003',
      name: 'Pedro',
      status: 'failed',
      error: 'timeout',
    }).save();
    const res = await request(app).post(`/api/logs/${camp._id}/retry/${log._id}`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.retrying).toBe(1);
  });
});
