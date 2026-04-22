const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

/** Same base path as LocalAuth + default clientId → `session` */
const WWEBJS_DATA_PATH = path.resolve(process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth');
const SESSION_USER_DATA_DIR = path.join(WWEBJS_DATA_PATH, 'session');

const CHROME_LOCK_NAMES = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie']);

/**
 * Removes Chromium singleton lock files left after crash or container kill.
 * Without this, Docker restarts often hit: "The profile appears to be in use..."
 */
function removeStaleChromeLocks(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        removeStaleChromeLocks(full);
      } else if (CHROME_LOCK_NAMES.has(entry.name)) {
        fs.unlinkSync(full);
      }
    }
  } catch (err) {
    console.warn('removeStaleChromeLocks:', err.message);
  }
}

let client = null;
let status = 'disconnected'; // disconnected | qr_ready | connected
let consecutiveFailures = 0;

function normalizeChatIdCandidate(value) {
  if (!value) return null;

  // getNumberId can return object with _serialized
  if (typeof value === 'object') {
    if (typeof value._serialized === 'string') return value._serialized;
    if (typeof value.user === 'string' && typeof value.server === 'string') {
      return `${value.user}@${value.server}`;
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.includes('@')) return raw;

  // If provider returns only digits, force default user jid.
  if (/^\d+$/.test(raw)) return `${raw}@c.us`;

  return null;
}

function initWhatsApp(io) {
  if (client) return;

  removeStaleChromeLocks(SESSION_USER_DATA_DIR);

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: WWEBJS_DATA_PATH }),
    puppeteer: {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-extensions',
        '--disable-features=TranslateUI',
      ],
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

  client.initialize().catch((err) => {
    console.error('WhatsApp init error:', err.message);
    status = 'disconnected';
    client = null;
    io.emit('session:error', { message: err.message });
    io.emit('session:status', { status });
  });
}

function getStatus() {
  return status;
}

/**
 * Resolve o JID que o WhatsApp Web aceita para envio (evita "No LID for user" em contatos novos / pós-migração LID).
 */
async function resolveChatIds(phoneDigits) {
  const digits = String(phoneDigits).replace(/\D/g, '');
  const fallback = `${digits}@c.us`;
  const alternatives = new Set([fallback, `${digits}@s.whatsapp.net`]);

  try {
    const pairs = await client.getContactLidAndPhone([fallback]);
    for (const row of pairs || []) {
      const lid = normalizeChatIdCandidate(row && row.lid);
      const pn = normalizeChatIdCandidate(row && row.pn);
      if (lid) alternatives.add(lid);
      if (pn) alternatives.add(pn);
    }
  } catch (err) {
    console.warn('getContactLidAndPhone:', err.message);
  }

  try {
    const numId = await client.getNumberId(digits);
    const numberId = normalizeChatIdCandidate(numId);
    if (numberId) alternatives.add(numberId);
  } catch (err) {
    console.warn('getNumberId:', err.message);
  }

  return Array.from(alternatives);
}

function isNoLidError(err) {
  const m = err && (err.message || String(err));
  return typeof m === 'string' && /No LID|LID for user/i.test(m);
}

async function sendMessage(phone, message, imagePath) {
  if (!client || status !== 'connected') throw new Error('WhatsApp not connected');

  const { MessageMedia } = require('whatsapp-web.js');

  const sendTo = async (chatId) => {
    if (imagePath) {
      const media = MessageMedia.fromFilePath(imagePath);
      await client.sendMessage(chatId, media, { caption: message });
    } else {
      await client.sendMessage(chatId, message);
    }
  };

  const chatIds = await resolveChatIds(phone);
  let lastErr = null;

  for (const chatId of chatIds) {
    try {
      await sendTo(chatId);
      return;
    } catch (err) {
      lastErr = err;
      const msg = err && (err.message || String(err));
      // Keep trying candidates only for destination-resolution failures.
      if (!/No LID|LID for user|wid|not a whatsapp|invalid/i.test(String(msg))) {
        throw err;
      }
    }
  }

  const details = (lastErr && (lastErr.message || String(lastErr))) || 'Unknown send error';
  throw new Error(`${details.trim()} — destinos tentados: ${chatIds.join(', ')}`);
}

/** Texto visível para análise (evita descartar reply só porque `body` veio num formato não-string). */
function incomingMessageText(msg) {
  if (!msg || msg.fromMe) return '';
  let t = '';
  if (typeof msg.body === 'string') t = msg.body.trim();
  else if (msg.body != null && msg.body !== '') t = String(msg.body).trim();
  if (!t && typeof msg.caption === 'string') t = msg.caption.trim();
  return t;
}

async function listIncomingMessagesSince(phone, sinceDate) {
  if (!client || status !== 'connected') throw new Error('WhatsApp not connected');

  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : new Date(sinceDate).getTime();
  if (!Number.isFinite(sinceMs)) throw new Error('Invalid sinceDate');

  const digits = String(phone).replace(/\D/g, '');
  /** Mesmos JIDs que o envio usa (LID / @s.whatsapp.net / @c.us) — só “sufixo do número” falha com chat LID. */
  let resolvedJids = [];
  try {
    resolvedJids = await resolveChatIds(digits);
  } catch (err) {
    console.warn('listIncomingMessagesSince: resolveChatIds:', err.message);
  }
  const resolvedLower = new Set(resolvedJids.map((j) => String(j).toLowerCase()));

  let allChats = [];
  try {
    allChats = await client.getChats();
  } catch (err) {
    console.warn('listIncomingMessagesSince: getChats failed:', err.message);
    return [];
  }

  const seenSerialized = new Set();
  const chatsToScan = [];

  const pushUnique = (chat) => {
    const sid = chat && chat.id && chat.id._serialized;
    if (!sid || seenSerialized.has(sid)) return;
    seenSerialized.add(sid);
    chatsToScan.push(chat);
  };

  for (const chat of allChats) {
    const sid = String(chat.id._serialized || '').toLowerCase();
    if (resolvedLower.has(sid)) {
      pushUnique(chat);
      continue;
    }
    const user = String(chat.id.user || '').replace(/\D/g, '');
    if (!user) continue;
    const longer = user.length >= digits.length ? user : digits;
    const shorter = user.length < digits.length ? user : digits;
    if (longer.endsWith(shorter)) pushUnique(chat);
  }

  for (const jid of resolvedJids) {
    const j = String(jid).toLowerCase();
    if ([...seenSerialized].some((s) => s.toLowerCase() === j)) continue;
    try {
      const ch = await client.getChatById(jid);
      if (ch) pushUnique(ch);
    } catch (err) {
      console.warn('listIncomingMessagesSince: getChatById', jid, err.message);
    }
  }

  const outById = new Map();
  for (const chat of chatsToScan) {
    const messages = await chat.fetchMessages({ limit: 500 }).catch(() => []);
    for (const msg of messages || []) {
      const tsMs = (msg.timestamp || 0) * 1000;
      if (msg.fromMe) continue;
      if (tsMs < sinceMs) continue;

      const body = incomingMessageText(msg);
      if (!body) continue;

      const id = msg.id?._serialized || `${chat.id._serialized}:${msg.timestamp}:${body}`;
      if (!outById.has(id)) {
        outById.set(id, { id, chatId: chat.id._serialized, timestamp: tsMs, body });
      }
    }
  }

  return Array.from(outById.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function resetConsecutiveFailures() { consecutiveFailures = 0; }
function incrementFailures() { return ++consecutiveFailures; }
function getConsecutiveFailures() { return consecutiveFailures; }

module.exports = {
  initWhatsApp,
  getStatus,
  sendMessage,
  listIncomingMessagesSince,
  resetConsecutiveFailures,
  incrementFailures,
  getConsecutiveFailures,
};
