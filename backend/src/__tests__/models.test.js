const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Contact model', () => {
  it('saves a valid contact', async () => {
    const Contact = require('../models/contact.model');
    const c = new Contact({ name: 'João', phone: '5511999998888' });
    const saved = await c.save();
    expect(saved._id).toBeDefined();
    expect(saved.active).toBe(true);
  });

  it('requires name and phone', async () => {
    const Contact = require('../models/contact.model');
    await expect(new Contact({}).save()).rejects.toThrow();
  });
});

describe('Campaign model', () => {
  it('saves a valid campaign', async () => {
    const Campaign = require('../models/campaign.model');
    const camp = new Campaign({ name: 'Abril 2026', text: 'Olá {nome}!' });
    const saved = await camp.save();
    expect(saved._id).toBeDefined();
  });
});

describe('Log model', () => {
  it('defaults status to pending', async () => {
    const Log = require('../models/log.model');
    const log = new Log({ campaignId: new mongoose.Types.ObjectId(), phone: '5511999998888', name: 'João' });
    const saved = await log.save();
    expect(saved.status).toBe('pending');
  });
});
