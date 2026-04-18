# WA Invites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web tool to send personalized WhatsApp invites in batch with anti-ban protections, real-time progress, and campaign history.

**Architecture:** Express backend exposes REST API + Socket.io for real-time events (QR code delivery, send progress). whatsapp-web.js manages the WA session with LocalAuth persistence. Bull queue handles batch dispatch with configurable delays. React frontend connects via HTTP + Socket.io.

**Tech Stack:** Node.js + Express + Socket.io, whatsapp-web.js (LocalAuth), Bull + Redis, Mongoose + MongoDB, React + Vite + TailwindCSS, Docker Compose.

**Gap resolved (not in spec):** Real-time delivery mechanism → Socket.io events: `qr`, `session:ready`, `session:disconnected`, `send:progress`, `send:done`, `send:error`.

---

## File Structure

```
wa-invites/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app.js                    # Express + Socket.io bootstrap
│       ├── config/
│       │   ├── db.js                 # Mongoose connection
│       │   └── queue.js              # Bull + Redis setup
│       ├── models/
│       │   ├── contact.model.js
│       │   ├── campaign.model.js
│       │   └── log.model.js
│       ├── services/
│       │   ├── whatsapp.service.js   # wwebjs lifecycle + socket events
│       │   └── queue.service.js      # Bull queue + processor with anti-ban
│       └── routes/
│           ├── session.routes.js
│           ├── contacts.routes.js
│           ├── campaigns.routes.js
│           ├── send.routes.js
│           └── logs.routes.js
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api/index.js              # axios instance (baseURL from env)
        ├── hooks/useSocket.js        # Socket.io connection hook
        └── pages/
            ├── Session.jsx
            ├── Contacts.jsx
            ├── Campaigns.jsx
            ├── Send.jsx
            └── History.jsx
```

---

## Task 1: Infrastructure — Docker Compose + env

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Write docker-compose.yml**

```yaml
version: '3.9'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    volumes:
      - ./backend/src:/app/src
      - ./backend/uploads:/app/uploads
      - wwebjs_auth:/app/.wwebjs_auth
    environment:
      - MONGO_URI=mongodb://mongodb:27017/wa-invites
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PORT=3001
    depends_on:
      - mongodb
      - redis

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
    environment:
      - VITE_API_URL=http://localhost:3001

  mongodb:
    image: mongo:7
    volumes:
      - mongo_data:/data/db

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  mongo_data:
  redis_data:
  wwebjs_auth:
```

- [ ] **Step 2: Write .env.example**

```env
MONGO_URI=mongodb://localhost:27017/wa-invites
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3001
VITE_API_URL=http://localhost:3001
```

- [ ] **Step 3: Commit**
```bash
git add docker-compose.yml .env.example
git commit -m "feat: docker compose infrastructure (mongo, redis, backend, frontend)"
```

---

## Task 2: Backend Foundation — Express + Socket.io

**Files:**
- Create: `backend/package.json`
- Create: `backend/Dockerfile`
- Create: `backend/src/app.js`
- Create: `backend/src/config/db.js`
- Create: `backend/src/config/queue.js`

- [ ] **Step 1: Create backend/package.json**

```json
{
  "name": "wa-invites-backend",
  "version": "1.0.0",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "bull": "^4.16.0",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "mongoose": "^8.3.4",
    "multer": "^1.4.5-lts.1",
    "socket.io": "^4.7.5",
    "uuid": "^9.0.1",
    "whatsapp-web.js": "^1.25.0",
    "qrcode": "^1.5.4"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.1.0",
    "supertest": "^7.0.0"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create backend/Dockerfile**

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p uploads
EXPOSE 3001
CMD ["node", "src/app.js"]
```

- [ ] **Step 3: Create backend/src/config/db.js**

```js
const mongoose = require('mongoose');

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/wa-invites');
  console.log('MongoDB connected');
}

module.exports = { connectDB };
```

- [ ] **Step 4: Create backend/src/config/queue.js**

```js
const Bull = require('bull');

const sendQueue = new Bull('send-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

module.exports = { sendQueue };
```

- [ ] **Step 5: Create backend/src/app.js**

```js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/session', require('./routes/session.routes'));
app.use('/api/contacts', require('./routes/contacts.routes'));
app.use('/api/campaigns', require('./routes/campaigns.routes'));
app.use('/api/send', require('./routes/send.routes'));
app.use('/api/logs', require('./routes/logs.routes'));

app.set('io', io);

const PORT = process.env.PORT || 3001;

connectDB().then(() => {
  server.listen(PORT, () => console.log(`Backend running on :${PORT}`));
});

module.exports = { app, server, io };
```

- [ ] **Step 6: Write failing test for app bootstrap**

Create `backend/src/__tests__/app.test.js`:
```js
const request = require('supertest');
const mongoose = require('mongoose');

// Mock mongoose to avoid real DB in tests
jest.mock('../config/db', () => ({ connectDB: jest.fn().mockResolvedValue(true) }));
jest.mock('../config/queue', () => ({ sendQueue: { process: jest.fn(), add: jest.fn() } }));
jest.mock('../services/whatsapp.service', () => ({ initWhatsApp: jest.fn(), getStatus: jest.fn(() => 'disconnected') }));

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
```

- [ ] **Step 7: Run test to confirm it fails**
```bash
cd backend && npm test -- --testPathPattern=app.test
```
Expected: FAIL (routes not yet wired)

- [ ] **Step 8: Commit skeleton**
```bash
git add backend/
git commit -m "feat: backend foundation — express, socket.io, db config"
```

---

## Task 3: MongoDB Models

**Files:**
- Create: `backend/src/models/contact.model.js`
- Create: `backend/src/models/campaign.model.js`
- Create: `backend/src/models/log.model.js`
- Create: `backend/src/__tests__/models.test.js`

- [ ] **Step 1: Write failing model tests**

Create `backend/src/__tests__/models.test.js`:
```js
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
```

- [ ] **Step 2: Add mongodb-memory-server dev dep**
```bash
cd backend && npm install --save-dev mongodb-memory-server
```

- [ ] **Step 3: Run tests — confirm FAIL**
```bash
cd backend && npm test -- --testPathPattern=models.test
```

- [ ] **Step 4: Create contact.model.js**

```js
const { Schema, model } = require('mongoose');

const contactSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  tags: [String],
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = model('Contact', contactSchema);
```

- [ ] **Step 5: Create campaign.model.js**

```js
const { Schema, model } = require('mongoose');

const campaignSchema = new Schema({
  name: { type: String, required: true },
  text: { type: String, required: true },
  imagePath: String,
}, { timestamps: true });

module.exports = model('Campaign', campaignSchema);
```

- [ ] **Step 6: Create log.model.js**

```js
const { Schema, model } = require('mongoose');

const logSchema = new Schema({
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
  phone: { type: String, required: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  sentAt: Date,
  error: String,
}, { timestamps: true });

module.exports = model('Log', logSchema);
```

- [ ] **Step 7: Run tests — confirm PASS**
```bash
cd backend && npm test -- --testPathPattern=models.test
```

- [ ] **Step 8: Commit**
```bash
git add backend/src/models/ backend/src/__tests__/models.test.js
git commit -m "feat: mongoose models for contact, campaign, log"
```

---

## Task 4: WhatsApp Service

**Files:**
- Create: `backend/src/services/whatsapp.service.js`

> Note: whatsapp-web.js requires Chromium and can't be unit-tested without a real WA session. Test coverage here is limited to the service interface (status/state machine), not the live WA connection.

- [ ] **Step 1: Create whatsapp.service.js**

```js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client = null;
let status = 'disconnected'; // disconnected | qr_ready | connected
let consecutiveFailures = 0;

function initWhatsApp(io) {
  if (client) return;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', async (qr) => {
    status = 'qr_ready';
    const qrDataUrl = await qrcode.toDataURL(qr);
    io.emit('qr', { qr: qrDataUrl });
    io.emit('session:status', { status });
  });

  client.on('ready', () => {
    status = 'connected';
    io.emit('session:ready');
    io.emit('session:status', { status });
  });

  client.on('disconnected', () => {
    status = 'disconnected';
    client = null;
    io.emit('session:disconnected');
    io.emit('session:status', { status });
  });

  client.initialize();
}

function getStatus() {
  return status;
}

async function sendMessage(phone, message, imagePath) {
  if (!client || status !== 'connected') throw new Error('WhatsApp not connected');
  const chatId = `${phone}@c.us`;
  if (imagePath) {
    const { MessageMedia } = require('whatsapp-web.js');
    const media = MessageMedia.fromFilePath(imagePath);
    await client.sendMessage(chatId, media, { caption: message });
  } else {
    await client.sendMessage(chatId, message);
  }
}

function resetConsecutiveFailures() { consecutiveFailures = 0; }
function incrementFailures() { return ++consecutiveFailures; }
function getConsecutiveFailures() { return consecutiveFailures; }

module.exports = { initWhatsApp, getStatus, sendMessage, resetConsecutiveFailures, incrementFailures, getConsecutiveFailures };
```

- [ ] **Step 2: Write service interface test**

Add to `backend/src/__tests__/whatsapp.service.test.js`:
```js
jest.mock('whatsapp-web.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    initialize: jest.fn(),
  })),
  LocalAuth: jest.fn(),
  MessageMedia: { fromFilePath: jest.fn() },
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fake') }));

const service = require('../services/whatsapp.service');

describe('whatsapp service interface', () => {
  it('initial status is disconnected', () => {
    expect(service.getStatus()).toBe('disconnected');
  });

  it('tracks consecutive failures', () => {
    service.resetConsecutiveFailures();
    service.incrementFailures();
    service.incrementFailures();
    expect(service.getConsecutiveFailures()).toBe(2);
    service.resetConsecutiveFailures();
    expect(service.getConsecutiveFailures()).toBe(0);
  });
});
```

- [ ] **Step 3: Run test — confirm PASS**
```bash
cd backend && npm test -- --testPathPattern=whatsapp.service.test
```

- [ ] **Step 4: Commit**
```bash
git add backend/src/services/whatsapp.service.js backend/src/__tests__/whatsapp.service.test.js
git commit -m "feat: whatsapp service with LocalAuth, QR events, send message"
```

---

## Task 5: Bull Queue — Anti-ban Send Processor

**Files:**
- Create: `backend/src/services/queue.service.js`
- Create: `backend/src/__tests__/queue.service.test.js`

- [ ] **Step 1: Write failing queue logic tests**

```js
const { buildAntibanDelay, shouldPauseBatch, buildMessage } = require('../services/queue.service');

describe('buildAntibanDelay', () => {
  it('returns value between 15000 and 60000', () => {
    for (let i = 0; i < 20; i++) {
      const d = buildAntibanDelay();
      expect(d).toBeGreaterThanOrEqual(15000);
      expect(d).toBeLessThanOrEqual(60000);
    }
  });
  it('is never the same twice in a row (randomness check)', () => {
    const delays = new Set(Array.from({ length: 10 }, () => buildAntibanDelay()));
    expect(delays.size).toBeGreaterThan(1);
  });
});

describe('shouldPauseBatch', () => {
  it('returns true every 30 messages (but not at 0)', () => {
    expect(shouldPauseBatch(30)).toBe(true);
    expect(shouldPauseBatch(60)).toBe(true);
    expect(shouldPauseBatch(0)).toBe(false);
    expect(shouldPauseBatch(29)).toBe(false);
    expect(shouldPauseBatch(31)).toBe(false);
  });
});

describe('buildMessage', () => {
  it('replaces {nome} with contact name', () => {
    expect(buildMessage('Olá {nome}!', 'Maria')).toBe('Olá Maria!');
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**
```bash
cd backend && npm test -- --testPathPattern=queue.service.test
```

- [ ] **Step 3: Create queue.service.js**

```js
const { sendQueue } = require('../config/queue');
const Log = require('../models/log.model');
const whatsapp = require('./whatsapp.service');

const BATCH_SIZE = 30;
const BATCH_PAUSE_MS = 10 * 60 * 1000; // 10 min

function buildAntibanDelay() {
  return Math.floor(Math.random() * (60000 - 15000 + 1)) + 15000;
}

function shouldPauseBatch(sentCount) {
  return sentCount > 0 && sentCount % BATCH_SIZE === 0;
}

function buildMessage(template, name) {
  return template.replace(/\{nome\}/g, name);
}

function registerProcessor(io) {
  sendQueue.process(async (job) => {
    const { campaignId, contacts, text, imagePath, hourStart = 8, hourEnd = 20 } = job.data;

    let sentCount = 0;

    for (const contact of contacts) {
      const hour = new Date().getHours();
      if (hour < hourStart || hour >= hourEnd) {
        io.emit('send:paused', { reason: 'outside_hours', campaignId });
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }

      const log = await Log.findOneAndUpdate(
        { campaignId, phone: contact.phone },
        { $setOnInsert: { name: contact.name, status: 'pending' } },
        { upsert: true, new: true }
      );

      if (log.status === 'sent') continue;

      try {
        const message = buildMessage(text, contact.name);
        await whatsapp.sendMessage(contact.phone, message, imagePath || null);
        await Log.findByIdAndUpdate(log._id, { status: 'sent', sentAt: new Date() });
        whatsapp.resetConsecutiveFailures();
        sentCount++;

        io.emit('send:progress', { campaignId, phone: contact.phone, status: 'sent', sentCount, total: contacts.length });

        if (shouldPauseBatch(sentCount)) {
          io.emit('send:batch_pause', { campaignId, sentCount });
          await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
        } else {
          await new Promise(r => setTimeout(r, buildAntibanDelay()));
        }
      } catch (err) {
        await Log.findByIdAndUpdate(log._id, { status: 'failed', error: err.message });
        const failures = whatsapp.incrementFailures();
        io.emit('send:progress', { campaignId, phone: contact.phone, status: 'failed', sentCount, total: contacts.length });

        if (failures >= 3) {
          io.emit('send:alert', { campaignId, message: '3 falhas consecutivas — envio pausado' });
          await new Promise(r => setTimeout(r, 5 * 60 * 1000));
        }
      }
    }

    io.emit('send:done', { campaignId, sentCount, total: contacts.length });
  });
}

module.exports = { registerProcessor, buildAntibanDelay, shouldPauseBatch, buildMessage };
```

- [ ] **Step 4: Run test — confirm PASS**
```bash
cd backend && npm test -- --testPathPattern=queue.service.test
```

- [ ] **Step 5: Commit**
```bash
git add backend/src/services/queue.service.js backend/src/__tests__/queue.service.test.js
git commit -m "feat: bull queue processor with anti-ban delays and batch pauses"
```

---

## Task 6: Session Routes

**Files:**
- Create: `backend/src/routes/session.routes.js`
- Create: `backend/src/__tests__/session.routes.test.js`

- [ ] **Step 1: Write failing route tests**

```js
jest.mock('../services/whatsapp.service', () => ({
  initWhatsApp: jest.fn(),
  getStatus: jest.fn(() => 'disconnected'),
}));
jest.mock('../config/db', () => ({ connectDB: jest.fn() }));
jest.mock('../config/queue', () => ({ sendQueue: { process: jest.fn() } }));
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
```

- [ ] **Step 2: Run test — confirm FAIL**

- [ ] **Step 3: Create session.routes.js**

```js
const router = require('express').Router();
const whatsapp = require('../services/whatsapp.service');

router.get('/', (req, res) => {
  res.json({ status: whatsapp.getStatus() });
});

router.post('/start', (req, res) => {
  const io = req.app.get('io');
  whatsapp.initWhatsApp(io);
  res.json({ message: 'WhatsApp initialization started' });
});

module.exports = router;
```

- [ ] **Step 4: Wire up in app.js** — replace mock route with real route (already done in Task 2 app.js)

- [ ] **Step 5: Run test — confirm PASS**

- [ ] **Step 6: Commit**
```bash
git add backend/src/routes/session.routes.js backend/src/__tests__/session.routes.test.js
git commit -m "feat: session routes — GET status, POST start"
```

---

## Task 7: Contacts Routes

**Files:**
- Create: `backend/src/routes/contacts.routes.js`
- Create: `backend/src/__tests__/contacts.routes.test.js`

- [ ] **Step 1: Write failing tests**

```js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

jest.mock('../config/db', () => ({ connectDB: jest.fn() }));
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
```

- [ ] **Step 2: Run test — confirm FAIL**

- [ ] **Step 3: Create contacts.routes.js**

```js
const router = require('express').Router();
const Contact = require('../models/contact.model');

router.get('/', async (req, res) => {
  const filter = { active: true };
  if (req.query.tag) filter.tags = req.query.tag;
  const contacts = await Contact.find(filter).sort({ createdAt: -1 });
  res.json(contacts);
});

router.post('/', async (req, res) => {
  const contact = await new Contact(req.body).save();
  res.status(201).json(contact);
});

router.post('/import', async (req, res) => {
  const { contacts } = req.body;
  const docs = await Contact.insertMany(contacts, { ordered: false }).catch(e => e.insertedDocs || []);
  res.status(201).json({ imported: docs.length });
});

router.put('/:id', async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(contact);
});

router.delete('/:id', async (req, res) => {
  const contact = await Contact.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  res.json(contact);
});

module.exports = router;
```

- [ ] **Step 4: Run test — confirm PASS**

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/contacts.routes.js backend/src/__tests__/contacts.routes.test.js
git commit -m "feat: contacts routes — CRUD + import JSON + filter by tag"
```

---

## Task 8: Campaigns Routes (+ image upload)

**Files:**
- Create: `backend/src/routes/campaigns.routes.js`
- Create: `backend/src/__tests__/campaigns.routes.test.js`

- [ ] **Step 1: Write failing tests**

```js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const path = require('path');
const fs = require('fs');

jest.mock('../config/db', () => ({ connectDB: jest.fn() }));
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
```

- [ ] **Step 2: Run test — confirm FAIL**

- [ ] **Step 3: Create campaigns.routes.js**

```js
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const Campaign = require('../models/campaign.model');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

router.get('/', async (req, res) => {
  const campaigns = await Campaign.find().sort({ createdAt: -1 });
  res.json(campaigns);
});

router.post('/', upload.single('image'), async (req, res) => {
  const data = { ...req.body };
  if (req.file) data.imagePath = `uploads/${req.file.filename}`;
  const campaign = await new Campaign(data).save();
  res.status(201).json(campaign);
});

router.put('/:id', upload.single('image'), async (req, res) => {
  const data = { ...req.body };
  if (req.file) data.imagePath = `uploads/${req.file.filename}`;
  const campaign = await Campaign.findByIdAndUpdate(req.params.id, data, { new: true });
  res.json(campaign);
});

router.delete('/:id', async (req, res) => {
  await Campaign.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
```

- [ ] **Step 4: Run test — confirm PASS**

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/campaigns.routes.js backend/src/__tests__/campaigns.routes.test.js
git commit -m "feat: campaigns routes — CRUD + multer image upload"
```

---

## Task 9: Send Routes

**Files:**
- Create: `backend/src/routes/send.routes.js`
- Create: `backend/src/__tests__/send.routes.test.js`

- [ ] **Step 1: Write failing tests**

```js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

jest.mock('../config/db', () => ({ connectDB: jest.fn() }));
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

describe('POST /api/send', () => {
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
```

- [ ] **Step 2: Run test — confirm FAIL**

- [ ] **Step 3: Create send.routes.js**

```js
const router = require('express').Router();
const { sendQueue } = require('../config/queue');
const Campaign = require('../models/campaign.model');
const Contact = require('../models/contact.model');
const whatsapp = require('../services/whatsapp.service');

router.post('/', async (req, res) => {
  if (whatsapp.getStatus() !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp not connected' });
  }

  const { campaignId, contactIds, hourStart = 8, hourEnd = 20 } = req.body;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const contacts = await Contact.find({ _id: { $in: contactIds }, active: true }).lean();

  const job = await sendQueue.add({
    campaignId,
    contacts: contacts.map(c => ({ phone: c.phone, name: c.name })),
    text: campaign.text,
    imagePath: campaign.imagePath || null,
    hourStart,
    hourEnd,
  });

  res.json({ jobId: job.id, queued: contacts.length });
});

module.exports = router;
```

- [ ] **Step 4: Run test — confirm PASS**

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/send.routes.js backend/src/__tests__/send.routes.test.js
git commit -m "feat: send routes — enqueue campaign dispatch"
```

---

## Task 10: Logs Routes

**Files:**
- Create: `backend/src/routes/logs.routes.js`
- Create: `backend/src/__tests__/logs.routes.test.js`

- [ ] **Step 1: Write failing tests**

```js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

jest.mock('../config/db', () => ({ connectDB: jest.fn() }));
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
```

- [ ] **Step 2: Run test — confirm FAIL**

- [ ] **Step 3: Create logs.routes.js**

```js
const router = require('express').Router();
const Log = require('../models/log.model');
const Campaign = require('../models/campaign.model');
const { sendQueue } = require('../config/queue');

router.get('/:campaignId', async (req, res) => {
  const logs = await Log.find({ campaignId: req.params.campaignId }).sort({ createdAt: -1 });
  res.json(logs);
});

router.post('/:campaignId/retry-failed', async (req, res) => {
  const campaign = await Campaign.findById(req.params.campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const failedLogs = await Log.find({ campaignId: req.params.campaignId, status: 'failed' });
  if (!failedLogs.length) return res.json({ message: 'No failed logs' });

  await Log.updateMany({ campaignId: req.params.campaignId, status: 'failed' }, { status: 'pending' });

  const job = await sendQueue.add({
    campaignId: req.params.campaignId,
    contacts: failedLogs.map(l => ({ phone: l.phone, name: l.name })),
    text: campaign.text,
    imagePath: campaign.imagePath || null,
  });

  res.json({ jobId: job.id, retrying: failedLogs.length });
});

module.exports = router;
```

- [ ] **Step 4: Run test — confirm PASS**

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/logs.routes.js backend/src/__tests__/logs.routes.test.js
git commit -m "feat: logs routes — list by campaign, retry failed"
```

---

## Task 11: Update app.js — wire services + init

Now that all services and routes exist, finalize app.js to init WhatsApp and register queue processor on startup.

**Files:**
- Modify: `backend/src/app.js`

- [ ] **Step 1: Update connectDB().then() block in app.js**

Replace:
```js
connectDB().then(() => {
  server.listen(PORT, () => console.log(`Backend running on :${PORT}`));
});
```

With:
```js
const { registerProcessor } = require('./services/queue.service');
const { initWhatsApp } = require('./services/whatsapp.service');

connectDB().then(() => {
  registerProcessor(io);
  initWhatsApp(io);
  server.listen(PORT, () => console.log(`Backend running on :${PORT}`));
});
```

- [ ] **Step 2: Run all backend tests**
```bash
cd backend && npm test
```
Expected: All PASS

- [ ] **Step 3: Commit**
```bash
git add backend/src/app.js
git commit -m "feat: wire whatsapp init and queue processor on startup"
```

---

## Task 12: Frontend Foundation — Vite + Tailwind + Routing + Socket hook

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/Dockerfile`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/api/index.js`
- Create: `frontend/src/hooks/useSocket.js`

- [ ] **Step 1: Create frontend/package.json**

```json
{
  "name": "wa-invites-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite --host",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.0",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "vite": "^5.3.3"
  }
}
```

- [ ] **Step 2: Create frontend/Dockerfile**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

- [ ] **Step 3: Create frontend/vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
});
```

- [ ] **Step 4: Create frontend/tailwind.config.js**

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 5: Create frontend/index.html**

```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WA Invites</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create frontend/src/main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

Create `frontend/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create frontend/src/api/index.js**

```js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
});

export default api;
```

- [ ] **Step 8: Create frontend/src/hooks/useSocket.js**

```js
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let socket = null;

export function useSocket(events) {
  const handlersRef = useRef(events);
  handlersRef.current = events;

  useEffect(() => {
    if (!socket) socket = io(SOCKET_URL);

    const attached = Object.entries(handlersRef.current).map(([event, handler]) => {
      const wrapped = (...args) => handler(...args);
      socket.on(event, wrapped);
      return [event, wrapped];
    });

    return () => {
      attached.forEach(([event, wrapped]) => socket.off(event, wrapped));
    };
  }, []);

  return socket;
}
```

- [ ] **Step 9: Create frontend/src/App.jsx**

```jsx
import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Session from './pages/Session';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import Send from './pages/Send';
import History from './pages/History';

const nav = [
  { to: '/', label: 'Sessão' },
  { to: '/contacts', label: 'Contatos' },
  { to: '/campaigns', label: 'Campanhas' },
  { to: '/send', label: 'Disparo' },
  { to: '/history', label: 'Histórico' },
];

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-green-600 text-white px-6 py-3 flex gap-6">
        <span className="font-bold mr-4">WA Invites</span>
        {nav.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => isActive ? 'underline font-semibold' : 'hover:underline'}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<Session />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/send" element={<Send />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 10: Commit**
```bash
git add frontend/
git commit -m "feat: frontend foundation — vite, tailwind, routing, socket hook, api client"
```

---

## Task 13: Session Page

**Files:**
- Create: `frontend/src/pages/Session.jsx`

- [ ] **Step 1: Create Session.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import api from '../api';

export default function Session() {
  const [status, setStatus] = useState('loading');
  const [qr, setQr] = useState(null);

  useEffect(() => {
    api.get('/api/session').then(r => setStatus(r.data.status));
  }, []);

  useSocket({
    qr: ({ qr: qrData }) => { setQr(qrData); setStatus('qr_ready'); },
    'session:ready': () => { setStatus('connected'); setQr(null); },
    'session:disconnected': () => { setStatus('disconnected'); setQr(null); },
    'session:status': ({ status: s }) => setStatus(s),
  });

  const start = async () => {
    await api.post('/api/session/start');
    setStatus('starting');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sessão WhatsApp</h1>
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'qr_ready' ? 'bg-yellow-400' : 'bg-red-400'}`} />
        <span className="capitalize">{status === 'connected' ? 'Conectado' : status === 'qr_ready' ? 'Aguardando QR Code' : status === 'starting' ? 'Iniciando...' : 'Desconectado'}</span>
      </div>

      {status === 'disconnected' && (
        <button onClick={start} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Conectar WhatsApp
        </button>
      )}

      {qr && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Escaneie o QR Code com seu WhatsApp</p>
          <img src={qr} alt="QR Code" className="w-64 h-64 border rounded" />
        </div>
      )}

      {status === 'connected' && (
        <p className="text-green-700 font-medium">✓ WhatsApp conectado e pronto para envios</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test manually**
- Open http://localhost:3000
- Verify status displays correctly
- Verify "Conectar WhatsApp" button appears when disconnected
- After clicking, verify QR code appears

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Session.jsx
git commit -m "feat: session page with real-time QR code and status"
```

---

## Task 14: Contacts Page

**Files:**
- Create: `frontend/src/pages/Contacts.jsx`

- [ ] **Step 1: Create Contacts.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import api from '../api';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [tag, setTag] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', tags: '' });
  const [selected, setSelected] = useState(new Set());
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const load = async () => {
    const params = tag ? { tag } : {};
    const res = await api.get('/api/contacts', { params });
    setContacts(res.data);
  };

  useEffect(() => { load(); }, [tag]);

  const add = async (e) => {
    e.preventDefault();
    await api.post('/api/contacts', { ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) });
    setForm({ name: '', phone: '', tags: '' });
    load();
  };

  const deactivate = async (id) => {
    await api.delete(`/api/contacts/${id}`);
    load();
  };

  const importContacts = async () => {
    try {
      const parsed = JSON.parse(importText);
      await api.post('/api/contacts/import', { contacts: parsed });
      setImportText('');
      setShowImport(false);
      load();
    } catch {
      alert('JSON inválido');
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(contacts.length === selected.size ? new Set() : new Set(contacts.map(c => c._id)));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Contatos</h1>
        <button onClick={() => setShowImport(!showImport)} className="text-sm text-blue-600 underline">
          Importar JSON
        </button>
      </div>

      {showImport && (
        <div className="border rounded p-4 space-y-2">
          <p className="text-sm text-gray-600">Cole um array JSON: <code>[{"{"}"name":"João","phone":"5511..."{"}"}]</code></p>
          <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={4} className="w-full border rounded p-2 text-sm font-mono" />
          <button onClick={importContacts} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Importar</button>
        </div>
      )}

      <form onSubmit={add} className="grid grid-cols-3 gap-3">
        <input placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="border rounded px-3 py-2" />
        <input placeholder="Telefone (5511...)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required className="border rounded px-3 py-2" />
        <div className="flex gap-2">
          <input placeholder="Tags (vírgula)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="border rounded px-3 py-2 flex-1" />
          <button type="submit" className="bg-green-600 text-white px-4 rounded">+</button>
        </div>
      </form>

      <div className="flex gap-3 items-center">
        <input placeholder="Filtrar por tag" value={tag} onChange={e => setTag(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <span className="text-sm text-gray-500">{contacts.length} contatos</span>
        {contacts.length > 0 && (
          <button onClick={selectAll} className="text-sm text-blue-600 underline">
            {selected.size === contacts.length ? 'Dessel. todos' : 'Sel. todos'}
          </button>
        )}
      </div>

      <ul className="divide-y border rounded">
        {contacts.map(c => (
          <li key={c._id} className="flex items-center gap-3 px-4 py-3">
            <input type="checkbox" checked={selected.has(c._id)} onChange={() => toggleSelect(c._id)} />
            <div className="flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-gray-500">{c.phone} {c.tags?.length ? `· ${c.tags.join(', ')}` : ''}</p>
            </div>
            <button onClick={() => deactivate(c._id)} className="text-red-500 text-sm hover:underline">Remover</button>
          </li>
        ))}
        {contacts.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Nenhum contato</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Test manually**
- Add a contact manually
- Import a JSON array
- Filter by tag
- Remove a contact

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Contacts.jsx
git commit -m "feat: contacts page — add, import, filter, select, remove"
```

---

## Task 15: Campaigns Page

**Files:**
- Create: `frontend/src/pages/Campaigns.jsx`

- [ ] **Step 1: Create Campaigns.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import api from '../api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState({ name: '', text: '' });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const res = await api.get('/api/campaigns');
    setCampaigns(res.data);
  };

  useEffect(() => { load(); }, []);

  const buildPreview = () => form.text.replace(/\{nome\}/g, 'João (exemplo)');

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('text', form.text);
    if (image) fd.append('image', image);

    if (editing) {
      await api.put(`/api/campaigns/${editing}`, fd);
      setEditing(null);
    } else {
      await api.post('/api/campaigns', fd);
    }
    setForm({ name: '', text: '' });
    setImage(null);
    load();
  };

  const remove = async (id) => {
    if (!confirm('Remover campanha?')) return;
    await api.delete(`/api/campaigns/${id}`);
    load();
  };

  const edit = (c) => {
    setEditing(c._id);
    setForm({ name: c.name, text: c.text });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Campanhas</h1>

      <form onSubmit={save} className="border rounded p-4 space-y-4">
        <h2 className="font-semibold">{editing ? 'Editar campanha' : 'Nova campanha'}</h2>
        <input placeholder="Nome da campanha" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full border rounded px-3 py-2" />
        <div className="space-y-1">
          <textarea placeholder="Texto da mensagem — use {nome} para personalizar" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} required rows={4} className="w-full border rounded px-3 py-2" />
          {form.text && <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded">Preview: {buildPreview()}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Imagem (opcional)</label>
          <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} className="block" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            {editing ? 'Salvar' : 'Criar campanha'}
          </button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', text: '' }); }} className="px-4 py-2 border rounded">Cancelar</button>}
        </div>
      </form>

      <ul className="space-y-3">
        {campaigns.map(c => (
          <li key={c._id} className="border rounded p-4 flex justify-between items-start">
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-sm text-gray-600 mt-1">{c.text.slice(0, 80)}{c.text.length > 80 ? '...' : ''}</p>
              {c.imagePath && <img src={`${API_URL}/${c.imagePath}`} alt="" className="mt-2 h-16 rounded" />}
            </div>
            <div className="flex gap-2">
              <button onClick={() => edit(c)} className="text-blue-600 text-sm hover:underline">Editar</button>
              <button onClick={() => remove(c._id)} className="text-red-500 text-sm hover:underline">Remover</button>
            </div>
          </li>
        ))}
        {campaigns.length === 0 && <li className="text-center py-6 text-gray-400">Nenhuma campanha</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Test manually**
- Create campaign with text + image
- Verify `{nome}` preview renders correctly
- Edit and delete campaigns

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Campaigns.jsx
git commit -m "feat: campaigns page — create/edit with image upload and preview"
```

---

## Task 16: Send Page

**Files:**
- Create: `frontend/src/pages/Send.jsx`

- [ ] **Step 1: Create Send.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import api from '../api';

export default function Send() {
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [tagFilter, setTagFilter] = useState('');
  const [progress, setProgress] = useState(null);
  const [alert, setAlert] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get('/api/campaigns').then(r => setCampaigns(r.data));
    api.get('/api/contacts').then(r => setContacts(r.data));
  }, []);

  useEffect(() => {
    api.get('/api/contacts', { params: tagFilter ? { tag: tagFilter } : {} }).then(r => setContacts(r.data));
  }, [tagFilter]);

  useSocket({
    'send:progress': (data) => setProgress(data),
    'send:done': (data) => { setProgress(data); setSending(false); },
    'send:alert': ({ message }) => setAlert(message),
    'send:batch_pause': ({ sentCount }) => setAlert(`Pausa entre batches após ${sentCount} envios (10 min)`),
    'send:paused': () => setAlert('Fora do horário permitido — aguardando...'),
  });

  const toggleContact = (id) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedContacts(contacts.length === selectedContacts.size ? new Set() : new Set(contacts.map(c => c._id)));

  const send = async () => {
    if (!selectedCampaign || selectedContacts.size === 0) return alert('Selecione campanha e contatos');
    setSending(true);
    setAlert(null);
    setProgress(null);
    await api.post('/api/send', {
      campaignId: selectedCampaign,
      contactIds: [...selectedContacts],
    });
  };

  const pct = progress ? Math.round((progress.sentCount / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Disparo</h1>

      <div className="space-y-2">
        <label className="font-medium">Campanha</label>
        <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="w-full border rounded px-3 py-2">
          <option value="">Selecione uma campanha...</option>
          {campaigns.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="font-medium">Contatos ({selectedContacts.size} selecionados)</label>
          <button onClick={selectAll} className="text-sm text-blue-600 underline">
            {selectedContacts.size === contacts.length ? 'Dessel. todos' : 'Sel. todos'}
          </button>
        </div>
        <input placeholder="Filtrar por tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="border rounded px-3 py-2 text-sm w-full" />
        <ul className="border rounded divide-y max-h-64 overflow-y-auto">
          {contacts.map(c => (
            <li key={c._id} className="flex items-center gap-3 px-4 py-2">
              <input type="checkbox" checked={selectedContacts.has(c._id)} onChange={() => toggleContact(c._id)} />
              <span>{c.name} <span className="text-gray-500 text-sm">({c.phone})</span></span>
            </li>
          ))}
        </ul>
      </div>

      {alert && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded">
          ⚠️ {alert}
        </div>
      )}

      {progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Enviados: {progress.sentCount} / {progress.total}</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <button
        onClick={send}
        disabled={sending || !selectedCampaign || selectedContacts.size === 0}
        className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? 'Enviando...' : `Disparar para ${selectedContacts.size} contatos`}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Test manually**
- Select campaign + contacts
- Verify button is disabled until both are selected
- Start a send (with WA connected) and observe real-time progress bar

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Send.jsx
git commit -m "feat: send page with real-time progress bar and anti-ban alerts"
```

---

## Task 17: History Page

**Files:**
- Create: `frontend/src/pages/History.jsx`

- [ ] **Step 1: Create History.jsx**

```jsx
import React, { useState, useEffect } from 'react';
import api from '../api';

export default function History() {
  const [campaigns, setCampaigns] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [logs, setLogs] = useState({});

  useEffect(() => {
    api.get('/api/campaigns').then(r => setCampaigns(r.data));
  }, []);

  const loadLogs = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!logs[id]) {
      const res = await api.get(`/api/logs/${id}`);
      setLogs(prev => ({ ...prev, [id]: res.data }));
    }
  };

  const retryFailed = async (id) => {
    await api.post(`/api/logs/${id}/retry-failed`);
    const res = await api.get(`/api/logs/${id}`);
    setLogs(prev => ({ ...prev, [id]: res.data }));
  };

  const getMetrics = (campaignLogs) => ({
    sent: campaignLogs.filter(l => l.status === 'sent').length,
    failed: campaignLogs.filter(l => l.status === 'failed').length,
    pending: campaignLogs.filter(l => l.status === 'pending').length,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Histórico</h1>
      <ul className="space-y-3">
        {campaigns.map(c => {
          const campaignLogs = logs[c._id] || [];
          const metrics = getMetrics(campaignLogs);
          return (
            <li key={c._id} className="border rounded overflow-hidden">
              <button onClick={() => loadLogs(c._id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-gray-500">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                {campaignLogs.length > 0 && (
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600">✓ {metrics.sent}</span>
                    <span className="text-red-500">✗ {metrics.failed}</span>
                    <span className="text-gray-400">⏳ {metrics.pending}</span>
                  </div>
                )}
                <span className="text-gray-400">{expanded === c._id ? '▲' : '▼'}</span>
              </button>

              {expanded === c._id && (
                <div className="border-t px-4 py-3 space-y-3">
                  {metrics.failed > 0 && (
                    <button onClick={() => retryFailed(c._id)} className="text-sm bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600">
                      Reenviar {metrics.failed} falhos
                    </button>
                  )}
                  <ul className="divide-y text-sm max-h-64 overflow-y-auto">
                    {campaignLogs.map(l => (
                      <li key={l._id} className="flex justify-between py-2">
                        <span>{l.name} <span className="text-gray-400">({l.phone})</span></span>
                        <span className={l.status === 'sent' ? 'text-green-600' : l.status === 'failed' ? 'text-red-500' : 'text-gray-400'}>
                          {l.status === 'sent' ? '✓ Enviado' : l.status === 'failed' ? `✗ Falhou${l.error ? ': ' + l.error : ''}` : '⏳ Pendente'}
                        </span>
                      </li>
                    ))}
                    {campaignLogs.length === 0 && <li className="py-4 text-center text-gray-400">Sem registros de envio</li>}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
        {campaigns.length === 0 && <li className="text-center py-8 text-gray-400">Nenhuma campanha criada</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Test manually**
- Expand campaign to see logs
- Verify sent/failed/pending counts
- Test "Reenviar falhos" button

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/History.jsx
git commit -m "feat: history page — campaign metrics, logs expand, retry failed"
```

---

## Task 18: End-to-End Smoke Test

- [ ] **Step 1: Start everything**
```bash
docker compose up -d
```

- [ ] **Step 2: Verify all services healthy**
```bash
docker compose ps
# All 4 services should be "Up"
```

- [ ] **Step 3: Run full flow**
1. Open http://localhost:3000
2. Go to Sessão → click "Conectar WhatsApp" → scan QR code with phone
3. Go to Contatos → add a contact (your own number for testing)
4. Go to Campanhas → create "Teste" campaign with text "Olá {nome}! Teste."
5. Go to Disparo → select campaign + contact → click "Disparar"
6. Observe real-time progress bar
7. Go to Histórico → verify log shows "Enviado"

- [ ] **Step 4: Run all backend tests**
```bash
docker compose exec backend npm test
```
Expected: All PASS

- [ ] **Step 5: Final commit**
```bash
git add .
git commit -m "feat: wa-invites complete — local WhatsApp batch invite tool"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Docker Compose + env | manual |
| 2 | Express + Socket.io + config | supertest |
| 3 | MongoDB models | jest + mongo-memory-server |
| 4 | WhatsApp service | jest (mocked) |
| 5 | Bull queue + anti-ban | jest (unit) |
| 6 | Session routes | supertest |
| 7 | Contacts routes | supertest |
| 8 | Campaigns routes | supertest |
| 9 | Send routes | supertest |
| 10 | Logs routes | supertest |
| 11 | Frontend foundation | manual |
| 12–17 | React pages (5 telas) | manual |
| 18 | E2E smoke test | manual |
