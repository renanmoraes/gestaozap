const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { classifyReply, isGreetingReply } = require('../utils/reply-classifier.util');
const { collectPhoneKeys } = require('../utils/phone.util');

/** Histórico carregado no analyze (wwebjs: ultimos N ou pagina com loadEarlierMsgs) */
const READ_MSG_LIMIT = Math.min(50000, Math.max(2000, Number(process.env.WWEBJS_READ_MSG_LIMIT) || 15000));
/** 1 = antes de re-fetch, tenta `chat.syncHistory()` quando `fetchMessages` vem vazio (mais lento, útil p/ depuração) */
const CHAT_INDEX_SYNC_RETRY = /^1|true|yes$/i.test(String(process.env.WWEBJS_CHAT_INDEX_SYNC || ''));
/** 1 = logs [chatIndex] (samples, janela, resumo) */
const WWEBJS_DEBUG = /^1|true|yes$/i.test(String(process.env.WWEBJS_DEBUG || ''));
/** Só varre chats cuja última atividade (Chat.timestamp) caia após 1º envio −N s e antes do último +M s (padrão: 2h antes, 24h depois) */
const CHAT_INDEX_PAD_BEFORE_SEC = Math.max(0, Number(process.env.WWEBJS_CHAT_INDEX_PAD_BEFORE_SEC) || 7200);
const CHAT_INDEX_PAD_AFTER_SEC = Math.max(0, Number(process.env.WWEBJS_CHAT_INDEX_PAD_AFTER_SEC) || 86400);
/**
 * 1 = não chama `fetchMessages` ao montar o índice timestamp→chat; usa só `lastMessage` da lista (evita
 * falhas do WA tipo `waitForChatLoading` e deixa a análise muito mais rápida). 0 = tenta fetch (lento, pode quebrar com WA novo).
 */
const CHAT_INDEX_SKIP_FETCH = !/^0|false|no$/i.test(String(process.env.WWEBJS_CHAT_INDEX_SKIP_FETCH || '1'));
/** Quando o índice tiver 1 chat por envio, para de abrir o resto da lista (não piora o *best match* de timestamp se chats já vêm do mais recente) */
const CHAT_INDEX_EARLY_STOP = !/^0|false|no$/i.test(String(process.env.WWEBJS_CHAT_INDEX_EARLY_STOP || '1'));

/** Same base path as LocalAuth + default clientId → `session` */
const WWEBJS_DATA_PATH = path.resolve(process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth');
const SESSION_USER_DATA_DIR = path.join(WWEBJS_DATA_PATH, 'session');

const CHROME_LOCK_NAMES = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie']);

/** Erros de `pupPage.evaluate` vêm como string com stack `<anonymous>:N` — não passar o objeto Error ao `console` (evita spam de stack). */
function stringFromWwebjsErr(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  const m = err.message;
  if (typeof m === 'string' && m.trim()) return m.trim();
  return String(err);
}

let client = null;
let status = 'disconnected'; // disconnected | qr_ready | connected
let consecutiveFailures = 0;

/* =========================================================
 * HELPERS
 * ======================================================= */

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

function normalizeChatIdCandidate(value) {
  if (!value) return null;

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
  if (/^\d+$/.test(raw)) return `${raw}@c.us`;

  return null;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Texto visível para análise */
function incomingMessageText(msg) {
  if (!msg || msg.fromMe) return '';

  let t = '';
  if (typeof msg.body === 'string') t = msg.body.trim();
  else if (msg.body != null && msg.body !== '') t = String(msg.body).trim();
  if (!t && typeof msg.caption === 'string') t = msg.caption.trim();
  if (!t && msg._data) {
    const d = msg._data;
    if (typeof d.caption === 'string' && d.caption.trim()) t = d.caption.trim();
    else if (typeof d.body === 'string' && d.body.trim()) t = d.body.trim();
  }
  return t;
}

/* =========================================================
 * WHATSAPP INIT
 * ======================================================= */

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

/* =========================================================
 * CHAT / DESTINATION RESOLUTION
 * ======================================================= */

/**
 * Coleciona JIDs a tentar para envio/leitura. O WA recente muitas vece exige LID em vez de só @c.us.
 * Ordenação: LID / wid do QueryExist primeiro; @c.us / @s.whatsapp.net no fim.
 */
function compareJidSendOrder(a, b) {
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  const score = (s) => (s.endsWith('@lid') ? 0
    : s.endsWith('@c.us') || s.endsWith('@s.whatsapp.net') ? 2
    : 1);
  return score(sa) - score(sb) || sa.localeCompare(sb);
}

async function expandJidCandidates(phoneOrDigits) {
  const rawDigits = digitsOnly(phoneOrDigits);
  const byKey = new Map();
  const add = (v, p) => {
    const n = normalizeChatIdCandidate(v);
    if (!n) return;
    const k = n.toLowerCase();
    const prev = byKey.get(k);
    if (!prev || p < prev.p) byKey.set(k, { p, jid: n });
  };

  const keyDigits = [...new Set(
    [rawDigits, ...collectPhoneKeys(phoneOrDigits).map((x) => digitsOnly(x))],
  )].filter((d) => d.length >= 8);

  const toLidQuery = new Set();
  for (const d of keyDigits) {
    toLidQuery.add(`${d}@c.us`);
    toLidQuery.add(`${d}@s.whatsapp.net`);
  }
  toLidQuery.add(`${rawDigits}@c.us`);
  toLidQuery.add(`${rawDigits}@s.whatsapp.net`);

  for (const d of keyDigits) {
    try {
      const numId = await client.getNumberId(d);
      const s = normalizeChatIdCandidate(numId);
      if (s) add(s, 0);
    } catch (_) { /* muitas falhas com números alternativos */ }
  }

  if (toLidQuery.size) {
    try {
      const pairs = await client.getContactLidAndPhone([...toLidQuery]);
      for (const row of pairs || []) {
        add(row && row.lid, 0);
        add(row && row.pn, 1);
      }
    } catch (err) {
      console.warn('getContactLidAndPhone:', err.message);
    }
  }

  try {
    const contacts = await client.getContacts();
    // Only use keys with DDD (>= 11 digits) to avoid false matches between contacts
    // that share the same local number but have different area codes.
    const fullKeyDigits = keyDigits.filter((d) => d.length >= 11);
    for (const c of contacts) {
      if (c.isGroup || !c.number) continue;
      const cn = digitsOnly(c.number);
      if (cn.length < 10) continue;
      for (const d of fullKeyDigits) {
        const L = cn.length >= d.length ? cn : d;
        const s = cn.length < d.length ? cn : d;
        if (L.endsWith(s) && c.id) {
          add(c.id, 1);
        }
      }
    }
  } catch (_) {}

  for (const d of keyDigits) {
    add(`${d}@c.us`, 3);
    add(`${d}@s.whatsapp.net`, 4);
  }
  if (!keyDigits.length) {
    add(`${rawDigits}@c.us`, 3);
  }

  return [...byKey.values()]
    .sort((a, b) => a.p - b.p || compareJidSendOrder(a.jid, b.jid))
    .map((x) => x.jid);
}

/** Resolução alargada: LID/PN, QueryExist, contatos, depois @c.us. Usado em getChatByPhone, fila, etc. */
async function resolveChatIds(phoneDigits) {
  return expandJidCandidates(phoneDigits);
}

/**
 * JIDs a tentar em `sendMessage`, com prioridade: chat aberto (canônico) → expandJidCandidates.
 */
async function getJidsForSend(phone) {
  const ordered = [];
  const seen = new Set();
  const push = (n) => {
    const j = normalizeChatIdCandidate(n);
    if (!j) return;
    const k = j.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    ordered.push(j);
  };
  try {
    const ch = await getChatByPhone(phone);
    if (ch && ch.id && ch.id._serialized) {
      push(ch.id._serialized);
    }
  } catch (_) {}
  for (const j of await expandJidCandidates(phone)) {
    push(j);
  }
  if (ordered.length) return ordered;
  const d = digitsOnly(phone);
  if (d.length >= 8) return [`${d}@c.us`];
  return [normalizeChatIdCandidate(phone)].filter(Boolean);
}

async function getChatByPhone(phone) {
  if (!client || status !== 'connected') return null;

  const digits = digitsOnly(phone);
  const keySet = new Set(
    [...collectPhoneKeys(phone), digits].filter((k) => k && String(k).replace(/\D/g, '').length >= 8),
  );
  const numericKeys = [...new Set([...keySet].map((k) => digitsOnly(k)).filter((k) => k.length >= 8))];

  for (const k of numericKeys) {
    for (const domain of ['c.us', 's.whatsapp.net']) {
      try {
        const jid = `${k}@${domain}`;
        const ch = await client.getChatById(jid);
        if (ch && !ch.isGroup) return ch;
      } catch (err) {
        console.warn('getChatByPhone:directJid:', err.message);
      }
    }
  }

  const resolvedJids = await resolveChatIds(digits);
  const resolvedLower = new Set(resolvedJids.map((j) => String(j).toLowerCase()));

  for (const jid of resolvedJids) {
    try {
      const ch = await client.getChatById(jid);
      if (ch && !ch.isGroup) return ch;
    } catch (err) {
      console.warn('getChatByPhone:resolveJid:', jid, err.message);
    }
  }

  let allChats = [];
  try {
    allChats = await client.getChats();
  } catch (err) {
    console.warn('getChatByPhone:getChats:', err.message);
    return null;
  }

  // Only use keys with DDD (>= 11 digits) to avoid false positives between contacts
  // sharing the same local number but with different area codes.
  const numericKeysWithDDD = numericKeys.filter((k) => k.length >= 11);

  for (const chat of allChats) {
    if (chat.isGroup) continue;
    const sid = String(chat?.id?._serialized || '').toLowerCase();
    if (resolvedLower.has(sid)) return chat;

    const user = digitsOnly(chat?.id?.user || '');
    if (!user) continue;

    for (const k of numericKeysWithDDD) {
      const longer = user.length >= k.length ? user : k;
      const shorter = user.length < k.length ? user : k;
      if (longer.endsWith(shorter)) return chat;
    }
  }

  // Last resort for LID accounts: getContacts() has the real phone number mapped to WID
  try {
    const allContacts = await client.getContacts();
    for (const contact of allContacts) {
      if (contact.isGroup || !contact.number) continue;
      const cn = digitsOnly(contact.number);
      if (cn.length < 10) continue;
      const isMatch = numericKeysWithDDD.some((k) => {
        const longer = cn.length >= k.length ? cn : k;
        const shorter = cn.length < k.length ? cn : k;
        return longer.endsWith(shorter);
      });
      if (isMatch) {
        try {
          const ch = await client.getChatById(contact.id._serialized);
          if (ch && !ch.isGroup) return ch;
        } catch (_) {}
      }
    }
  } catch (_) {}

  return null;
}

/* =========================================================
 * SEND MESSAGE
 * ======================================================= */

async function sendMessage(phone, message, imagePath) {
  if (!client || status !== 'connected') throw new Error('WhatsApp not connected');

  const { MessageMedia } = require('whatsapp-web.js');

  const sendTo = async (chatId) => {
    if (imagePath) {
      const media = MessageMedia.fromFilePath(imagePath);
      return await client.sendMessage(chatId, media, { caption: message });
    }

    return await client.sendMessage(chatId, message);
  };

  const chatIds = await getJidsForSend(phone);
  let lastErr = null;

  for (const chatId of chatIds) {
    try {
      const sent = await sendTo(chatId);

      return {
        phone: digitsOnly(phone),
        chatId,
        messageId: sent?.id?._serialized || null,
        timestamp: sent?.timestamp ? sent.timestamp * 1000 : Date.now(),
        body: message,
      };
    } catch (err) {
      lastErr = err;
      const msg = err && (err.message || String(err));

      if (!/No LID|LID for user|wid|not a whatsapp|invalid/i.test(String(msg))) {
        throw err;
      }
    }
  }

  const details = (lastErr && (lastErr.message || String(lastErr))) || 'Unknown send error';
  throw new Error(`${details.trim()} — destinos tentados: ${chatIds.join(', ')}`);
}

/* =========================================================
 * READ INCOMING MESSAGES SINCE DATE
 * ======================================================= */

function addIncomingToMapSince(chat, messages, sinceMs, outById) {
  for (const msg of messages || []) {
    const tsMs = (msg.timestamp || 0) * 1000;
    if (msg.fromMe) continue;
    if (tsMs < sinceMs) continue;
    const body = incomingMessageText(msg);
    if (!body) continue;
    const id = msg.id?._serialized || `${chat.id._serialized}:${msg.timestamp}:${body}`;
    if (!outById.has(id)) {
      outById.set(id, {
        id,
        chatId: chat.id._serialized,
        timestamp: tsMs,
        body,
      });
    }
  }
}

async function listIncomingMessagesSince(phone, sinceDate) {
  if (!client || status !== 'connected') return [];

  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : new Date(sinceDate).getTime();
  if (!Number.isFinite(sinceMs)) return [];

  const outById = new Map();
  const digits = digitsOnly(phone);

  try {
    const direct = await getChatByPhone(phone);
    if (direct) {
      const messages = await direct.fetchMessages({ limit: READ_MSG_LIMIT }).catch(() => []);
      addIncomingToMapSince(direct, messages, sinceMs, outById);
      if (outById.size > 0) {
        return Array.from(outById.values()).sort((a, b) => a.timestamp - b.timestamp);
      }
    }
  } catch (e) {
    console.warn('listIncomingMessagesSince: directChat:', e.message);
  }

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
    return Array.from(outById.values()).sort((a, b) => a.timestamp - b.timestamp);
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
    if (chat.isGroup) continue;
    const sid = String(chat.id._serialized || '').toLowerCase();
    if (resolvedLower.has(sid)) {
      pushUnique(chat);
      continue;
    }
    const user = digitsOnly(chat.id.user || '');
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
      if (ch && !ch.isGroup) pushUnique(ch);
    } catch (err) {
      console.warn('listIncomingMessagesSince: getChatById', jid, err.message);
    }
  }

  // Fallback for LID accounts: match via getContacts() which has real phone numbers
  if (chatsToScan.length === 0) {
    // Only use keys with DDD (>= 11 digits) to avoid false positives with same local number / different DDD
    const fullKeys = [...new Set(
      [...collectPhoneKeys(phone), digits].map((k) => digitsOnly(k)).filter((k) => k.length >= 11),
    )];
    try {
      const allContacts = await client.getContacts();
      for (const contact of allContacts) {
        if (contact.isGroup || !contact.number) continue;
        const cn = digitsOnly(contact.number);
        if (cn.length < 10) continue;
        const isMatch = fullKeys.some((k) => {
          const longer = cn.length >= k.length ? cn : k;
          const shorter = cn.length < k.length ? cn : k;
          return longer.endsWith(shorter);
        });
        if (isMatch) {
          try {
            const ch = await client.getChatById(contact.id._serialized);
            if (ch && !ch.isGroup) pushUnique(ch);
          } catch (_) {}
          break;
        }
      }
    } catch (_) {}
  }

  for (const chat of chatsToScan) {
    const messages = await chat.fetchMessages({ limit: READ_MSG_LIMIT }).catch(() => []);
    addIncomingToMapSince(chat, messages, sinceMs, outById);
  }

  return Array.from(outById.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/* =========================================================
 * ANALYZE REPLIES TO A SPECIFIC OUTBOUND MESSAGE
 * ======================================================= */

function buildReplyRow(msg, chat, indexFallback) {
  return {
    id: msg.id?._serialized || `${chat.id._serialized}:${msg.timestamp}:${indexFallback}`,
    chatId: chat.id._serialized,
    timestamp: (msg.timestamp || 0) * 1000,
    body: incomingMessageText(msg),
  };
}

/**
 * Mensagens do contato após o nosso envio (âncora = id retornado no sendMessage ou timestamp do WA).
 * Não lança: retorna [] se não achar chat ou histórico insuficiente.
 */
async function listRepliesToOutbound(phone, outboundRef, options = {}) {
  if (!client || status !== 'connected') return [];

  const maxReplies = Math.min(50, Math.max(1, Number(options.maxReplies) || 8));
  const fetchLimit = Math.min(50000, Math.max(500, Number(options.fetchLimit) || READ_MSG_LIMIT));

  if (!outboundRef || (outboundRef.messageId == null && outboundRef.timestamp == null)) {
    return [];
  }

  let chat = null;

  // Fastest path: look up chat via the stored outbound message (works for LID accounts)
  if (!chat && outboundRef.messageId) {
    try {
      const sentMsg = await client.getMessageById(outboundRef.messageId);
      if (sentMsg) chat = await sentMsg.getChat();
    } catch (_) { /* fall through */ }
  }

  if (!chat && options.knownChatId) {
    try {
      chat = await client.getChatById(options.knownChatId);
    } catch (_) { /* fall through */ }
  }
  if (!chat) chat = await getChatByPhone(phone);
  if (!chat) return [];

  const raw = await chat.fetchMessages({ limit: fetchLimit }).catch(() => []);
  const ordered = [...raw].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let anchorIndex = -1;
  const mid = outboundRef.messageId != null ? String(outboundRef.messageId) : null;

  if (mid) {
    anchorIndex = ordered.findIndex(
      (m) => m.fromMe && m?.id?._serialized
        && (m.id._serialized === mid || m.id._serialized.endsWith(mid.split(':').pop() || mid)),
    );
  }

  if (anchorIndex === -1 && outboundRef.timestamp != null) {
    const tMs = Number(outboundRef.timestamp);
    const tSec = Math.floor(tMs / 1000);
    let bestI = -1;
    let bestD = 999999;
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      if (!m.fromMe) continue;
      const d = Math.abs((m.timestamp || 0) - tSec);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (bestI >= 0 && bestD <= 120) anchorIndex = bestI;
  }

  const pushIncoming = (replies, startIdx) => {
    for (let i = startIdx; i < ordered.length; i++) {
      const msg = ordered[i];
      if (msg.fromMe) continue;
      const body = incomingMessageText(msg);
      if (!body) continue;
      replies.push(buildReplyRow(msg, chat, i));
      if (replies.length >= maxReplies) break;
    }
  };

  const replies = [];
  if (anchorIndex >= 0) {
    pushIncoming(replies, anchorIndex + 1);
    if (replies.length) return replies;
  }

  // Fallback: tudo do contato depois de “por volta” do envio (registros antigos sem messageId)
  const sinceMs = (Number(outboundRef.timestamp) || 0) - 15_000;
  for (const msg of ordered) {
    if (msg.fromMe) continue;
    const tsMs = (msg.timestamp || 0) * 1000;
    if (tsMs < sinceMs) continue;
    const body = incomingMessageText(msg);
    if (!body) continue;
    replies.push(buildReplyRow(msg, chat, 'fb'));
    if (replies.length >= maxReplies) break;
  }
  return replies;
}

function pickWindowVerdict(analyzedReplies) {
  const rev = [...analyzedReplies].reverse();
  const lastMeaningful = rev.find(
    (r) => !r.greetingOnly && r.classification !== 'neutral',
  );
  if (!lastMeaningful) {
    return { status: 'neutral', classification: 'neutral' };
  }
  if (lastMeaningful.classification === 'negative') {
    return { status: 'negative', classification: 'negative' };
  }
  if (lastMeaningful.classification === 'positive') {
    return { status: 'positive', classification: 'positive' };
  }
  return { status: 'neutral', classification: 'neutral' };
}

/**
 * @param {string} phone
 * @param {{ messageId?: string|null, timestamp?: number }} outboundRef — retorno de `sendMessage` (messageId + timestamp ms)
 * @param {{ maxReplies?: number, fetchLimit?: number }} [options]
 */
async function analyzeReplyWindow(phone, outboundRef, options = {}) {
  const maxReplies = options.maxReplies != null ? options.maxReplies : 8;
  const fetchLimit = options.fetchLimit != null ? options.fetchLimit : READ_MSG_LIMIT;

  let replies = await listRepliesToOutbound(phone, outboundRef, { maxReplies, fetchLimit, knownChatId: options.knownChatId || null });

  if (!replies.length && outboundRef?.timestamp) {
    const t = new Date(Math.max(0, Number(outboundRef.timestamp) - 15_000));
    const legacy = await listIncomingMessagesSince(phone, t).catch(() => []);
    replies = legacy.slice(0, maxReplies);
  }

  if (!replies.length) {
    return {
      status: 'no_response',
      classification: 'no_response',
      replyCount: 0,
      analyzedReplies: [],
      positiveReply: null,
    };
  }

  const analyzedReplies = replies.map((reply) => ({
    ...reply,
    greetingOnly: isGreetingReply(reply.body),
    classification: classifyReply(reply.body),
  }));

  const { status, classification } = pickWindowVerdict(analyzedReplies);

  const positiveReply = [...analyzedReplies].reverse().find(
    (r) => r.classification === 'positive' && !r.greetingOnly,
  ) || analyzedReplies.find((r) => r.classification === 'positive') || null;

  return {
    status,
    classification,
    replyCount: analyzedReplies.length,
    analyzedReplies,
    positiveReply,
  };
}

/* =========================================================
 * TIMESTAMP-BASED CHAT INDEX (for LID accounts without chatId stored)
 * ======================================================= */

/**
 * Scans ALL non-group chats once and maps sentAt timestamps → Chat objects.
 * This avoids phone-number-based lookup which fails for LID accounts.
 *
 * @param {number[]} sentTimestampsMsArr  — array of sentAt epoch-ms values
 * @param {number}   toleranceMs          — max diff to count as a match (default 90s)
 * @returns {Promise<Map<number, object>>} sentMs → Chat
 */
async function buildTimestampToChatIndex(sentTimestampsMsArr, toleranceMs = 90_000) {
  if (WWEBJS_DEBUG) {
    console.log(`[chatIndex] called — client=${!!client} status=${status} timestamps=${sentTimestampsMsArr.length}`);
  }
  const result = new Map();
  if (!client || status !== 'connected' || !sentTimestampsMsArr.length) {
    if (WWEBJS_DEBUG) console.log('[chatIndex] early return — not ready or no timestamps');
    return result;
  }

  const sorted = [...sentTimestampsMsArr].sort((a, b) => a - b);
  const minSec = Math.floor(sorted[0] / 1000) - Math.ceil(toleranceMs / 1000);
  const maxSec = Math.ceil(sorted[sorted.length - 1] / 1000) + Math.ceil(toleranceMs / 1000);
  /** Só abre chats cuja “última atividade” possa vincular a este job (não percorre threads antigos parados) */
  const actMinSec = minSec - CHAT_INDEX_PAD_BEFORE_SEC;
  const actMaxSec = maxSec + CHAT_INDEX_PAD_AFTER_SEC;
  const expectKeys = new Set(sentTimestampsMsArr).size;

  let allChats = [];
  try {
    allChats = await client.getChats();
  } catch (err) {
    if (WWEBJS_DEBUG) console.warn('buildTimestampToChatIndex:getChats:', stringFromWwebjsErr(err));
    return result;
  }

  const raw = allChats.filter((c) => !c.isGroup);
  const skippedByTime = raw.length - raw.filter((c) => {
    const t = c.timestamp;
    if (t == null || t === 0) return true;
    return t >= actMinSec && t <= actMaxSec;
  }).length;
  const nonGroupChats = raw
    .filter((c) => {
      const t = c.timestamp;
      if (t == null || t === 0) return true;
      return t >= actMinSec && t <= actMaxSec;
    })
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (WWEBJS_DEBUG) {
    console.log(
      `[chatIndex] outbound window: ${new Date(minSec * 1000).toISOString()} – ${new Date(maxSec * 1000).toISOString()}; ` +
      `fila: ${actMinSec} – ${actMaxSec} (segundos)`,
    );
    console.log(
      `[chatIndex] candidatos ${nonGroupChats.length} (não-grupo) · ignorados por inatividade fora da janela: ${skippedByTime} · ` +
        `originais: ${raw.length}`,
    );
    if (CHAT_INDEX_SYNC_RETRY) {
      console.log('[chatIndex] WWEBJS_CHAT_INDEX_SYNC: syncHistory() antes de re-tentar fetch (lento)');
    }
  }

  let fetchErrorSamples = 0;
  const loadMessagesForIndex = async (chat, limit) => {
    if (CHAT_INDEX_SKIP_FETCH) {
      if (chat.lastMessage) return [chat.lastMessage];
      return [];
    }
    let msgs = await chat.fetchMessages({ limit }).catch((e) => {
      if (WWEBJS_DEBUG) fetchErrorSamples += 1;
      if (WWEBJS_DEBUG) {
        console.warn('[chatIndex] fetchMessages:', stringFromWwebjsErr(e).slice(0, 200));
      }
      return [];
    });
    if (msgs.length === 0 && CHAT_INDEX_SYNC_RETRY) {
      await chat.syncHistory().catch(() => {});
      msgs = await chat.fetchMessages({ limit }).catch((e) => {
        if (WWEBJS_DEBUG) fetchErrorSamples += 1;
        return [];
      });
    }
    if (msgs.length === 0 && chat.lastMessage) {
      msgs = [chat.lastMessage];
    }
    return msgs;
  };

  if (WWEBJS_DEBUG) {
    // eslint-disable-next-line no-console
    console.log(
      `[chatIndex] fonte: ${CHAT_INDEX_SKIP_FETCH ? 'só lastMessage (sem fetchMessages, rápido)' : 'fetchMessages'}`,
    );
    for (let si = 0; si < Math.min(3, nonGroupChats.length); si++) {
      const sc = nonGroupChats[si];
      const sm = await loadMessagesForIndex(sc, 10);
      const lm = sc.lastMessage
        ? { t: sc.lastMessage.timestamp, fromMe: sc.lastMessage.fromMe }
        : null;
      // eslint-disable-next-line no-console
      console.log(
        `[chatIndex] sample[${si}] id=${sc.id._serialized} msgs=${sm.length} ` +
        `lastMsgMeta=${JSON.stringify(lm)}`,
      );
    }
  }

  const bestDiff = new Map();
  let totalMsgsFound = 0;
  let chatsWithMsgs = 0;
  let indexRowsFromLastMessageOnly = 0;

  for (const chat of nonGroupChats) {
    let msgs = [];
    try {
      const rawMsgs = await loadMessagesForIndex(chat, 200);
      if (rawMsgs.length === 1 && chat.lastMessage && rawMsgs[0] === chat.lastMessage) {
        indexRowsFromLastMessageOnly += 1;
      }
      msgs = rawMsgs;
    } catch (_) {
      /* pupPage: silencioso; use WWEBJS_DEBUG se precisar */
    }
    if (msgs.length) { chatsWithMsgs += 1; totalMsgsFound += msgs.length; }

    if (WWEBJS_DEBUG) {
      const fromMeInWindow = msgs.filter((m) => m.fromMe && (m.timestamp || 0) >= minSec && (m.timestamp || 0) <= maxSec);
      if (fromMeInWindow.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[chatIndex] match chat ${chat.id._serialized} fromMe in win: ${
            fromMeInWindow.map((m) => new Date(m.timestamp * 1000).toISOString()).join(', ')}`,
        );
      }
    }

    for (const msg of msgs) {
      if (!msg.fromMe) continue;
      const tsSec = msg.timestamp || 0;
      if (tsSec < minSec || tsSec > maxSec) continue;
      const tsMs = tsSec * 1000;

      for (const sentMs of sentTimestampsMsArr) {
        const diff = Math.abs(tsMs - sentMs);
        if (diff <= toleranceMs) {
          const prev = bestDiff.get(sentMs);
          if (prev === undefined || diff < prev) {
            bestDiff.set(sentMs, diff);
            result.set(sentMs, chat);
          }
        }
      }
    }
    if (CHAT_INDEX_EARLY_STOP && result.size >= expectKeys) {
      if (WWEBJS_DEBUG) console.log('[chatIndex] early stop — todos os envios têm chat com match');
      break;
    }
  }

  if (WWEBJS_DEBUG) {
    // eslint-disable-next-line no-console
    console.log(
      `[chatIndex] chats com msg: ${chatsWithMsgs}/${nonGroupChats.length}, total msgs: ${totalMsgsFound}, ` +
        `só lastMessage: ${indexRowsFromLastMessageOnly}, matched: ${result.size}/${sentTimestampsMsArr.length} ` +
        (fetchErrorSamples > 0 ? `· evaluate falhou ~${fetchErrorSamples} (contagem aprox. em modo debug) ` : ''),
    );
  }
  return result;
}

/**
 * Fetch replies from a pre-resolved Chat object (skips phone-number lookup entirely).
 * Used when buildTimestampToChatIndex already resolved the chat.
 */
async function fetchRepliesFromChat(chat, outboundRef, maxReplies = 8) {
  const fetchLimit = Math.min(200, Math.max(30, READ_MSG_LIMIT));
  let raw = await chat.fetchMessages({ limit: fetchLimit }).catch(() => []);
  if (!raw.length && chat.lastMessage) {
    raw = [chat.lastMessage];
  }
  const ordered = [...raw].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let anchorIndex = -1;
  const mid = outboundRef.messageId != null ? String(outboundRef.messageId) : null;

  if (mid) {
    anchorIndex = ordered.findIndex(
      (m) => m.fromMe && m?.id?._serialized
        && (m.id._serialized === mid || m.id._serialized.endsWith(mid.split(':').pop() || mid)),
    );
  }

  if (anchorIndex === -1 && outboundRef.timestamp != null) {
    const tSec = Math.floor(Number(outboundRef.timestamp) / 1000);
    let bestI = -1;
    let bestD = 999999;
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      if (!m.fromMe) continue;
      const d = Math.abs((m.timestamp || 0) - tSec);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0 && bestD <= 120) anchorIndex = bestI;
  }

  const replies = [];
  const collectFrom = (startIdx) => {
    for (let i = startIdx; i < ordered.length; i++) {
      const msg = ordered[i];
      if (msg.fromMe) continue;
      const body = incomingMessageText(msg);
      if (!body) continue;
      replies.push(buildReplyRow(msg, chat, i));
      if (replies.length >= maxReplies) break;
    }
  };

  if (anchorIndex >= 0) {
    collectFrom(anchorIndex + 1);
    if (replies.length) return replies;
  }

  // Fallback: all incoming from contact after sentAt - 15s
  const sinceMs = (Number(outboundRef.timestamp) || 0) - 15_000;
  for (const msg of ordered) {
    if (msg.fromMe) continue;
    const tsMs = (msg.timestamp || 0) * 1000;
    if (tsMs < sinceMs) continue;
    const body = incomingMessageText(msg);
    if (!body) continue;
    replies.push(buildReplyRow(msg, chat, 'fb'));
    if (replies.length >= maxReplies) break;
  }
  return replies;
}

/* =========================================================
 * OPT-OUT DETECTION
 * ======================================================= */

function isOptOutText(raw) {
  const text = (raw || '').trim().toLowerCase();
  if (text === 'sair' || text === 'stop' || text === 'remover') return true;
  if (text.includes('sair do evento')) return true;
  return false;
}

/* =========================================================
 * FAILURE CONTROL
 * ======================================================= */

function resetConsecutiveFailures() {
  consecutiveFailures = 0;
}

function incrementFailures() {
  return ++consecutiveFailures;
}

function getConsecutiveFailures() {
  return consecutiveFailures;
}

/* =========================================================
 * EXPORTS
 * ======================================================= */

module.exports = {
  initWhatsApp,
  getStatus,
  sendMessage,
  getChatByPhone,
  listIncomingMessagesSince,
  listRepliesToOutbound,
  analyzeReplyWindow,
  buildTimestampToChatIndex,
  fetchRepliesFromChat,
  classifyReply,
  isGreetingReply,
  resetConsecutiveFailures,
  incrementFailures,
  getConsecutiveFailures,
  isOptOutText,
};