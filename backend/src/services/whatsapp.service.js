const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { eq, and, inArray } = require('drizzle-orm');
const { classifyReply, isGreetingReply } = require('../utils/reply-classifier.util');
const { collectPhoneKeys, normalizePhoneForWhatsApp, phonesMatchLoose } = require('../utils/phone.util');

const READ_MSG_LIMIT = Math.min(50000, Math.max(2000, Number(process.env.WWEBJS_READ_MSG_LIMIT) || 15000));
const CHAT_INDEX_SYNC_RETRY = /^1|true|yes$/i.test(String(process.env.WWEBJS_CHAT_INDEX_SYNC || ''));
const WWEBJS_DEBUG = /^1|true|yes$/i.test(String(process.env.WWEBJS_DEBUG || ''));
const CHAT_INDEX_PAD_BEFORE_SEC = Math.max(0, Number(process.env.WWEBJS_CHAT_INDEX_PAD_BEFORE_SEC) || 7200);
const CHAT_INDEX_PAD_AFTER_SEC = Math.max(0, Number(process.env.WWEBJS_CHAT_INDEX_PAD_AFTER_SEC) || 86400);
const CHAT_INDEX_SKIP_FETCH = !/^0|false|no$/i.test(String(process.env.WWEBJS_CHAT_INDEX_SKIP_FETCH || '1'));
const CHAT_INDEX_EARLY_STOP = !/^0|false|no$/i.test(String(process.env.WWEBJS_CHAT_INDEX_EARLY_STOP || '1'));

const WWEBJS_DATA_PATH = path.resolve(process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth');
const CHROME_LOCK_NAMES = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie']);

/* ─── Estado por tenant ──────────────────────────────────────── */

/**
 * Map de tenantId → { client, status, consecutiveFailures }
 * status: 'disconnected' | 'qr_ready' | 'connected'
 */
const tenantClients = new Map();

function getTenantState(tenantId) {
  if (!tenantClients.has(tenantId)) {
    tenantClients.set(tenantId, { client: null, status: 'disconnected', consecutiveFailures: 0 });
  }
  return tenantClients.get(tenantId);
}

function getClientFor(tenantId) {
  return getTenantState(tenantId).client;
}

/* ─── Helpers ────────────────────────────────────────────────── */

function stringFromWwebjsErr(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  const m = err.message;
  return (typeof m === 'string' && m.trim()) ? m.trim() : String(err);
}

function removeStaleChromeLocks(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) removeStaleChromeLocks(full);
      else if (CHROME_LOCK_NAMES.has(entry.name)) fs.unlinkSync(full);
    }
  } catch (err) {
    console.warn('removeStaleChromeLocks:', err.message);
  }
}

function normalizeChatIdCandidate(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    if (typeof value._serialized === 'string') return value._serialized;
    if (typeof value.user === 'string' && typeof value.server === 'string') return `${value.user}@${value.server}`;
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

/* ─── Persistência de sessão no banco ───────────────────────── */

async function persistWaStatus(tenantId, status, connectedPhone = null) {
  try {
    const { getDb } = require('../db');
    const { whatsappSessions } = require('../db/schema');
    const db = getDb();
    const update = { status, updatedAt: new Date() };
    if (connectedPhone !== null) update.connectedPhone = connectedPhone;
    if (status === 'connected') update.lastSeenAt = new Date();
    await db.update(whatsappSessions).set(update)
      .where(eq(whatsappSessions.tenantId, tenantId));
  } catch (e) {
    // Silencioso — não bloquear o fluxo de conexão por falha de DB
    console.warn('[wa] persistWaStatus error:', e.message);
  }
}

/* ─── Init WhatsApp ──────────────────────────────────────────── */

function initWhatsApp(tenantId, io) {
  const state = getTenantState(tenantId);
  if (state.client) return; // já inicializado para este tenant

  // clientId isola sessão de cada tenant: .wwebjs_auth/session-{tenantId}/
  const sessionDir = path.join(WWEBJS_DATA_PATH, `session-${tenantId}`);
  removeStaleChromeLocks(sessionDir);

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: WWEBJS_DATA_PATH, clientId: tenantId }),
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

  state.client = client;
  state.status = 'disconnected';

  client.on('qr', async (qr) => {
    state.status = 'qr_ready';
    await persistWaStatus(tenantId, 'qr_ready');
    const qrDataUrl = await qrcode.toDataURL(qr);
    io.to(tenantId).emit('qr', { qr: qrDataUrl });
    io.to(tenantId).emit('session:status', { status: 'qr_ready' });
  });

  client.on('ready', async () => {
    // Validar se o número conectado corresponde ao cadastrado no tenant
    try {
      const connectedPhone = normalizePhoneForWhatsApp(client.info?.wid?.user || '');
      const { getDb } = require('../db');
      const { tenants } = require('../db/schema');
      const db = getDb();
      const [tenant] = await db.select({ registeredPhone: tenants.registeredPhone })
        .from(tenants).where(eq(tenants.id, tenantId));

      if (tenant && tenant.registeredPhone) {
        const registered = normalizePhoneForWhatsApp(tenant.registeredPhone);
        // Comparação tolerante ao 9º dígito: mesma conta WhatsApp pode aparecer
        // como 5531995637020 (com 9) ou 553195637020 (sem 9) — ambos válidos.
        const matchesPhone = (a, b) => {
          if (!a || !b) return false;
          if (a === b) return true;
          const variants = brSendVariants(a);
          return variants.includes(b);
        };
        if (registered && connectedPhone && !matchesPhone(registered, connectedPhone)) {
          console.warn(`[wa] número errado para tenant ${tenantId}: conectado=${connectedPhone} esperado=${registered}`);
          await client.destroy().catch(() => {});
          state.client = null;
          state.status = 'disconnected';
          await persistWaStatus(tenantId, 'disconnected', null);
          const fmt = (p) => {
            const d = String(p || '').replace(/\D/g, '');
            if (d.length === 13 && d.startsWith('55')) return `+55 (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
            if (d.length === 12 && d.startsWith('55')) return `+55 (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
            return p;
          };
          io.to(tenantId).emit('session:wrong_phone', {
            message: `Esse número não é o que está vinculado à sua conta. O cadastro aqui é para o ${fmt(registered)}, mas o que escaneou foi o ${fmt(connectedPhone)}. Encerramos a conexão por segurança — use o WhatsApp do número certo e tente de novo.`,
            connectedPhone,
            registeredPhone: registered,
          });
          io.to(tenantId).emit('session:status', { status: 'disconnected' });
          return;
        }
      }

      state.status = 'connected';
      await persistWaStatus(tenantId, 'connected', connectedPhone);
      io.to(tenantId).emit('session:ready');
      io.to(tenantId).emit('session:status', { status: 'connected' });
      try { require('./metrics.service').recordClientEvent(tenantId, 'ready'); } catch (_) {}
      try { require('./incidents.service').record(tenantId, io, 'wa_ready', 'info', { connectedPhone }); } catch (_) {}

      // Backfill em background (não bloqueia o session:ready)
      try {
        const conversationService = require('./conversation.service');
        conversationService.syncFromWwebjs(tenantId, io).catch((e) => {
          console.warn('[chat] sync background error:', e.message);
        });
      } catch (_) {}
    } catch (err) {
      console.error('[wa] ready handler error:', err.message);
      state.status = 'connected';
      io.to(tenantId).emit('session:ready');
      io.to(tenantId).emit('session:status', { status: 'connected' });
    }
  });

  client.on('auth_failure', async (message) => {
    state.status = 'disconnected';
    state.client = null;
    await persistWaStatus(tenantId, 'disconnected', null);
    io.to(tenantId).emit('session:auth_failure', { message });
    try { require('./metrics.service').recordClientEvent(tenantId, 'auth_failure'); } catch (_) {}
    try { require('./incidents.service').record(tenantId, io, 'wa_auth_failure', 'critical', { message }); } catch (_) {}
    tenantClients.delete(tenantId);
  });

  client.on('disconnected', async (reason) => {
    state.status = 'disconnected';
    state.client = null;
    await persistWaStatus(tenantId, 'disconnected', null);
    io.to(tenantId).emit('session:disconnected');
    io.to(tenantId).emit('session:status', { status: 'disconnected' });
    try { require('./metrics.service').recordClientEvent(tenantId, 'disconnected'); } catch (_) {}
    try { require('./incidents.service').record(tenantId, io, 'wa_disconnected', 'warning', { reason: String(reason) }); } catch (_) {}
    tenantClients.delete(tenantId);
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;

    // ─── Persistir TODA mensagem inbound na timeline de conversas (DMs + grupos) ───
    try {
      const conversationService = require('./conversation.service');
      const waChatId = msg?.from || msg?.id?.remote?._serialized || msg?.id?.remote;
      if (waChatId) {
        const isGroup = String(waChatId).endsWith('@g.us');
        const body = (msg.body || msg.caption || '').toString();
        const mediaInfo = msg.hasMedia
          ? await conversationService.saveInboundMedia(tenantId, msg).catch(() => null)
          : null;

        // Nome do chat/grupo, foto e telefone real (para LID)
        let contactName = null;
        let avatarUrl = null;
        let realPhone = null;
        try {
          if (isGroup) {
            const groupChat = await msg.getChat().catch(() => null);
            contactName = groupChat?.name || groupChat?.formattedTitle || null;
            avatarUrl = await client.getProfilePicUrl(waChatId).catch(() => null);
          } else {
            const c = await msg.getContact();
            contactName = c?.name || c?.pushname || null;
            if (c?.number) realPhone = c.number;
            avatarUrl = await c?.getProfilePicUrl?.().catch(() => null);
          }
        } catch (_) {}

        // Em grupos, captura também o nome de quem enviou
        let authorName = null;
        if (isGroup && msg.author) {
          try {
            const author = await client.getContactById(msg.author).catch(() => null);
            authorName = author?.pushname || author?.name || author?.number || null;
          } catch (_) {}
        }

        await conversationService.recordIncomingMessage(tenantId, io, {
          waMessageId: msg.id?._serialized || null,
          waChatId,
          body,
          hasMedia: Boolean(msg.hasMedia),
          mediaInfo,
          timestampMs: (msg.timestamp || 0) * 1000,
          contactName,
          isGroup,
          authorName,
          realPhone,
          avatarUrl,
        }).catch((e) => { console.warn('[chat] recordIncoming error:', e.message); });
      }
    } catch (e) {
      console.warn('[chat] inbound persist error:', e.message);
    }

    // ─── Detecção de opt-out (mantém comportamento existente) ───
    const text = (msg.body || '').trim().toLowerCase();
    if (!isOptOutText(text)) return;

    const phone = msg.from.replace(/@\S+$/, '');
    const phoneKeys = collectPhoneKeys(phone);
    let optedOutContact = null;
    try {
      const { getDb } = require('../db');
      const { contacts } = require('../db/schema');
      const db = getDb();
      const [updated] = await db.update(contacts)
        .set({ optedOut: true, optedOutAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(contacts.tenantId, tenantId),
          inArray(contacts.phone, phoneKeys),
          eq(contacts.optedOut, false),
        ))
        .returning();
      optedOutContact = updated || null;
    } catch (e) {
      console.error('[opt-out] db error:', e.message);
    }

    if (!optedOutContact) return;
    io.to(tenantId).emit('contact:opted-out', { phone: optedOutContact.phone, name: optedOutContact.name });
    console.log(`[opt-out] tenant=${tenantId} ${optedOutContact.name} (${optedOutContact.phone}) saiu via mensagem`);
  });

  // ─── message_create: dispara para mensagens enviadas pelo celular físico (espelhamento WA Web) ───
  client.on('message_create', async (msg) => {
    if (!msg.fromMe) return; // só mensagens que eu envio
    try {
      const conversationService = require('./conversation.service');
      const waChatId = msg?.to || msg?.id?.remote?._serialized || msg?.id?.remote;
      if (!waChatId) return;

      const body = (msg.body || msg.caption || '').toString();
      const mediaInfo = msg.hasMedia
        ? await conversationService.saveInboundMedia(tenantId, msg).catch(() => null)
        : null;

      await conversationService.recordOutgoingMessage(tenantId, io, {
        waMessageId: msg.id?._serialized || null,
        waChatId,
        body,
        mediaInfo,
        timestampMs: (msg.timestamp || 0) * 1000,
      }).catch((e) => { console.warn('[chat] recordOutgoing error:', e.message); });
    } catch (e) {
      console.warn('[chat] message_create error:', e.message);
    }
  });

  // ─── message_ack: atualiza status de entrega/leitura ───
  client.on('message_ack', async (msg, ack) => {
    try {
      // ack: 0=pending, 1=sent, 2=delivered, 3=read, 4=played
      const statusMap = { 0: 'queued', 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read' };
      const status = statusMap[ack];
      if (!status || !msg?.id?._serialized) return;
      const conversationService = require('./conversation.service');
      await conversationService.updateMessageStatus(tenantId, io, msg.id._serialized, status)
        .catch(() => {});
    } catch (e) {
      console.warn('[chat] message_ack error:', e.message);
    }
  });

  client.initialize().catch((err) => {
    console.error(`[wa] init error tenant=${tenantId}:`, err.message);
    state.status = 'disconnected';
    state.client = null;
    io.to(tenantId).emit('session:error', { message: err.message });
    io.to(tenantId).emit('session:status', { status: 'disconnected' });
    tenantClients.delete(tenantId);
  });
}

function getStatus(tenantId) {
  if (!tenantId) {
    // Fallback: retorna 'connected' se qualquer tenant estiver conectado (retrocompatibilidade)
    for (const state of tenantClients.values()) {
      if (state.status === 'connected') return 'connected';
    }
    return 'disconnected';
  }
  return getTenantState(tenantId).status;
}

/* ─── Chat / Destination resolution ─────────────────────────── */

function compareJidSendOrder(a, b) {
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  const score = (s) => (s.endsWith('@lid') ? 0 : s.endsWith('@c.us') || s.endsWith('@s.whatsapp.net') ? 2 : 1);
  return score(sa) - score(sb) || sa.localeCompare(sb);
}

async function expandJidCandidates(client, phoneOrDigits) {
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
  for (const d of keyDigits) { toLidQuery.add(`${d}@c.us`); toLidQuery.add(`${d}@s.whatsapp.net`); }
  toLidQuery.add(`${rawDigits}@c.us`); toLidQuery.add(`${rawDigits}@s.whatsapp.net`);

  for (const d of keyDigits) {
    try { const numId = await client.getNumberId(d); const s = normalizeChatIdCandidate(numId); if (s) add(s, 0); } catch (_) {}
  }

  if (toLidQuery.size) {
    try {
      const pairs = await client.getContactLidAndPhone([...toLidQuery]);
      for (const row of pairs || []) { add(row && row.lid, 0); add(row && row.pn, 1); }
    } catch (err) { console.warn('getContactLidAndPhone:', err.message); }
  }

  try {
    const contacts = await client.getContacts();
    const fullKeyDigits = keyDigits.filter((d) => d.length >= 11);
    for (const c of contacts) {
      if (c.isGroup || !c.number) continue;
      const cn = digitsOnly(c.number);
      if (cn.length < 10) continue;
      for (const d of fullKeyDigits) {
        const L = cn.length >= d.length ? cn : d;
        const s = cn.length < d.length ? cn : d;
        if (L.endsWith(s) && c.id) add(c.id, 1);
      }
    }
  } catch (_) {}

  for (const d of keyDigits) { add(`${d}@c.us`, 3); add(`${d}@s.whatsapp.net`, 4); }
  if (!keyDigits.length) add(`${rawDigits}@c.us`, 3);

  return [...byKey.values()].sort((a, b) => a.p - b.p || compareJidSendOrder(a.jid, b.jid)).map((x) => x.jid);
}

async function resolveChatIds(client, phoneDigits) {
  return expandJidCandidates(client, phoneDigits);
}

async function getChatByPhone(tenantId, phone) {
  const { client, status } = getTenantState(tenantId);
  if (!client || status !== 'connected') return null;

  const digits = digitsOnly(phone);
  const keySet = new Set([...collectPhoneKeys(phone), digits].filter((k) => k && String(k).replace(/\D/g, '').length >= 8));
  const numericKeys = [...new Set([...keySet].map((k) => digitsOnly(k)).filter((k) => k.length >= 8))];

  for (const k of numericKeys) {
    for (const domain of ['c.us', 's.whatsapp.net']) {
      try { const ch = await client.getChatById(`${k}@${domain}`); if (ch && !ch.isGroup) return ch; } catch (err) {
        console.warn('getChatByPhone:directJid:', err.message);
      }
    }
  }

  const resolvedJids = await resolveChatIds(client, digits);
  const resolvedLower = new Set(resolvedJids.map((j) => String(j).toLowerCase()));

  for (const jid of resolvedJids) {
    try { const ch = await client.getChatById(jid); if (ch && !ch.isGroup) return ch; } catch (err) {
      console.warn('getChatByPhone:resolveJid:', jid, err.message);
    }
  }

  let allChats = [];
  try { allChats = await client.getChats(); } catch (err) { console.warn('getChatByPhone:getChats:', err.message); return null; }

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
        try { const ch = await client.getChatById(contact.id._serialized); if (ch && !ch.isGroup) return ch; } catch (_) {}
      }
    }
  } catch (_) {}

  return null;
}

/* ─── Send ───────────────────────────────────────────────────── */

function brSendVariants(digits) {
  const out = new Set();
  if (!digits) return [];
  out.add(digits);
  if (/^55\d{2}9\d{8}$/.test(digits)) out.add(digits.slice(0, 4) + digits.slice(5));
  else if (/^55\d{10}$/.test(digits)) out.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  return [...out];
}

async function getSendCandidates(client, phone) {
  const canonical = normalizePhoneForWhatsApp(phone) || digitsOnly(phone);
  const ordered = [];
  const seen = new Set();
  const push = (jid) => {
    const n = normalizeChatIdCandidate(jid);
    if (!n) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    ordered.push(n);
  };

  const variants = brSendVariants(canonical).filter((d) => d.length >= 12);

  for (const d of variants) {
    try { const numId = await client.getNumberId(d); const s = normalizeChatIdCandidate(numId); if (s) push(s); } catch (_) {}
  }
  for (const d of variants) push(`${d}@c.us`);
  if (!ordered.length && canonical.length >= 8) push(`${canonical}@c.us`);

  return ordered;
}

async function sendMessage(tenantId, phone, message, imagePath, opts = {}) {
  const { client, status } = getTenantState(tenantId);
  if (!client || status !== 'connected') throw new Error('WhatsApp não conectado');

  const { MessageMedia } = require('whatsapp-web.js');

  // Monta opções de envio. Para áudios, manda como voice note (PTT).
  function buildSendOptions(forMedia) {
    const o = {};
    if (forMedia && message) o.caption = message;
    if (opts.mediaType === 'audio') o.sendAudioAsVoice = true;
    if (opts.mediaType === 'document' && opts.originalName) {
      o.sendMediaAsDocument = true;
      o.filename = opts.originalName;
    }
    return o;
  }

  // Tentativa 1: enviar via objeto Chat — caminho mais robusto, funciona em LID.
  if (opts.directChatId) {
    try {
      const chat = await client.getChatById(opts.directChatId);
      if (chat) {
        let sent;
        if (imagePath) {
          const media = MessageMedia.fromFilePath(imagePath);
          sent = await chat.sendMessage(media, buildSendOptions(true));
        } else {
          sent = await chat.sendMessage(message);
        }
        return {
          phone: digitsOnly(phone),
          chatId: opts.directChatId,
          messageId: sent?.id?._serialized || null,
          timestamp: sent?.timestamp ? sent.timestamp * 1000 : Date.now(),
          body: message,
        };
      }
    } catch (err) {
      console.warn(`[wa] chat.sendMessage falhou para ${opts.directChatId} — caindo para fallback:`, err.message);
    }
  }

  // Tentativa 2: resolução tradicional por número (fallback para casos sem waChatId)
  const sendTo = async (chatId) => {
    if (imagePath) {
      const media = MessageMedia.fromFilePath(imagePath);
      return await client.sendMessage(chatId, media, buildSendOptions(true));
    }
    return await client.sendMessage(chatId, message);
  };

  let chatIds = [];
  if (opts.directChatId) chatIds.push(opts.directChatId);
  const fallback = await getSendCandidates(client, phone);
  for (const c of fallback) {
    if (!chatIds.includes(c)) chatIds.push(c);
  }

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
      if (!/No LID|LID for user|wid|not a whatsapp|invalid/i.test(String(err?.message || ''))) throw err;
    }
  }

  const details = (lastErr && (lastErr.message || String(lastErr))) || 'Unknown send error';
  throw new Error(`${details.trim()} — destinos tentados: ${chatIds.join(', ')}`);
}

/* ─── Read incoming ──────────────────────────────────────────── */

function addIncomingToMapSince(chat, messages, sinceMs, outById) {
  for (const msg of messages || []) {
    const tsMs = (msg.timestamp || 0) * 1000;
    if (msg.fromMe) continue;
    if (tsMs < sinceMs) continue;
    const body = incomingMessageText(msg);
    if (!body) continue;
    const id = msg.id?._serialized || `${chat.id._serialized}:${msg.timestamp}:${body}`;
    if (!outById.has(id)) outById.set(id, { id, chatId: chat.id._serialized, timestamp: tsMs, body });
  }
}

async function listIncomingMessagesSince(tenantId, phone, sinceDate) {
  const { client, status } = getTenantState(tenantId);
  if (!client || status !== 'connected') return [];

  const sinceMs = sinceDate instanceof Date ? sinceDate.getTime() : new Date(sinceDate).getTime();
  if (!Number.isFinite(sinceMs)) return [];

  const outById = new Map();
  const digits = digitsOnly(phone);

  try {
    const direct = await getChatByPhone(tenantId, phone);
    if (direct) {
      const messages = await direct.fetchMessages({ limit: READ_MSG_LIMIT }).catch(() => []);
      addIncomingToMapSince(direct, messages, sinceMs, outById);
      if (outById.size > 0) return Array.from(outById.values()).sort((a, b) => a.timestamp - b.timestamp);
    }
  } catch (e) { console.warn('listIncomingMessagesSince: directChat:', e.message); }

  let resolvedJids = [];
  try { resolvedJids = await resolveChatIds(client, digits); } catch (err) { console.warn('listIncomingMessagesSince: resolveChatIds:', err.message); }

  const resolvedLower = new Set(resolvedJids.map((j) => String(j).toLowerCase()));

  let allChats = [];
  try { allChats = await client.getChats(); } catch (err) {
    console.warn('listIncomingMessagesSince: getChats failed:', err.message);
    return Array.from(outById.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  const seenSerialized = new Set();
  const chatsToScan = [];
  const pushUnique = (chat) => {
    const sid = chat && chat.id && chat.id._serialized;
    if (!sid || seenSerialized.has(sid)) return;
    seenSerialized.add(sid); chatsToScan.push(chat);
  };

  for (const chat of allChats) {
    if (chat.isGroup) continue;
    const sid = String(chat.id._serialized || '').toLowerCase();
    if (resolvedLower.has(sid)) { pushUnique(chat); continue; }
    const user = digitsOnly(chat.id.user || '');
    if (!user) continue;
    const longer = user.length >= digits.length ? user : digits;
    const shorter = user.length < digits.length ? user : digits;
    if (longer.endsWith(shorter)) pushUnique(chat);
  }

  for (const jid of resolvedJids) {
    const j = String(jid).toLowerCase();
    if ([...seenSerialized].some((s) => s.toLowerCase() === j)) continue;
    try { const ch = await client.getChatById(jid); if (ch && !ch.isGroup) pushUnique(ch); } catch (err) {
      console.warn('listIncomingMessagesSince: getChatById', jid, err.message);
    }
  }

  if (chatsToScan.length === 0) {
    const fullKeys = [...new Set([...collectPhoneKeys(phone), digits].map((k) => digitsOnly(k)).filter((k) => k.length >= 11))];
    try {
      const allContacts = await client.getContacts();
      for (const contact of allContacts) {
        if (contact.isGroup || !contact.number) continue;
        const cn = digitsOnly(contact.number);
        if (cn.length < 10) continue;
        const isMatch = fullKeys.some((k) => { const L = cn.length >= k.length ? cn : k; const s = cn.length < k.length ? cn : k; return L.endsWith(s); });
        if (isMatch) { try { const ch = await client.getChatById(contact.id._serialized); if (ch && !ch.isGroup) pushUnique(ch); } catch (_) {} break; }
      }
    } catch (_) {}
  }

  for (const chat of chatsToScan) {
    const messages = await chat.fetchMessages({ limit: READ_MSG_LIMIT }).catch(() => []);
    addIncomingToMapSince(chat, messages, sinceMs, outById);
  }

  return Array.from(outById.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/* ─── Analyze replies ────────────────────────────────────────── */

function buildReplyRow(msg, chat, indexFallback) {
  return {
    id: msg.id?._serialized || `${chat.id._serialized}:${msg.timestamp}:${indexFallback}`,
    chatId: chat.id._serialized,
    timestamp: (msg.timestamp || 0) * 1000,
    body: incomingMessageText(msg),
  };
}

async function listRepliesToOutbound(tenantId, phone, outboundRef, options = {}) {
  const { client, status } = getTenantState(tenantId);
  if (!client || status !== 'connected') return [];

  const maxReplies = Math.min(50, Math.max(1, Number(options.maxReplies) || 8));
  const fetchLimit = Math.min(50000, Math.max(500, Number(options.fetchLimit) || READ_MSG_LIMIT));

  if (!outboundRef || (outboundRef.messageId == null && outboundRef.timestamp == null)) return [];

  let chat = null;

  if (!chat && outboundRef.messageId) {
    try { const sentMsg = await client.getMessageById(outboundRef.messageId); if (sentMsg) chat = await sentMsg.getChat(); } catch (_) {}
  }

  if (!chat && options.knownChatId) {
    try { chat = await client.getChatById(options.knownChatId); } catch (_) {}
  }
  if (!chat) chat = await getChatByPhone(tenantId, phone);
  if (!chat) return [];

  const raw = await chat.fetchMessages({ limit: fetchLimit }).catch(() => []);
  const ordered = [...raw].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let anchorIndex = -1;
  const mid = outboundRef.messageId != null ? String(outboundRef.messageId) : null;

  if (mid) {
    anchorIndex = ordered.findIndex((m) => m.fromMe && m?.id?._serialized && (m.id._serialized === mid || m.id._serialized.endsWith(mid.split(':').pop() || mid)));
  }

  if (anchorIndex === -1 && outboundRef.timestamp != null) {
    const tSec = Math.floor(Number(outboundRef.timestamp) / 1000);
    let bestI = -1; let bestD = 999999;
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i]; if (!m.fromMe) continue;
      const d = Math.abs((m.timestamp || 0) - tSec);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0 && bestD <= 120) anchorIndex = bestI;
  }

  const pushIncoming = (replies, startIdx) => {
    for (let i = startIdx; i < ordered.length; i++) {
      const msg = ordered[i]; if (msg.fromMe) continue;
      const body = incomingMessageText(msg); if (!body) continue;
      replies.push(buildReplyRow(msg, chat, i)); if (replies.length >= maxReplies) break;
    }
  };

  const replies = [];
  if (anchorIndex >= 0) {
    pushIncoming(replies, anchorIndex + 1);
    if (replies.length) return replies;
  }

  const sinceMs = (Number(outboundRef.timestamp) || 0) - 15_000;
  for (const msg of ordered) {
    if (msg.fromMe) continue;
    const tsMs = (msg.timestamp || 0) * 1000; if (tsMs < sinceMs) continue;
    const body = incomingMessageText(msg); if (!body) continue;
    replies.push(buildReplyRow(msg, chat, 'fb'));
    if (replies.length >= maxReplies) break;
  }
  return replies;
}

function pickWindowVerdict(analyzedReplies) {
  const rev = [...analyzedReplies].reverse();
  const last = rev.find((r) => !r.greetingOnly && r.classification !== 'neutral');
  if (!last) return { status: 'neutral', classification: 'neutral' };
  return { status: last.classification, classification: last.classification };
}

async function analyzeReplyWindow(tenantId, phone, outboundRef, options = {}) {
  const maxReplies = options.maxReplies != null ? options.maxReplies : 8;
  const fetchLimit = options.fetchLimit != null ? options.fetchLimit : READ_MSG_LIMIT;

  let replies = await listRepliesToOutbound(tenantId, phone, outboundRef, { maxReplies, fetchLimit, knownChatId: options.knownChatId || null });

  if (!replies.length && outboundRef?.timestamp) {
    const t = new Date(Math.max(0, Number(outboundRef.timestamp) - 15_000));
    const legacy = await listIncomingMessagesSince(tenantId, phone, t).catch(() => []);
    replies = legacy.slice(0, maxReplies);
  }

  if (!replies.length) {
    return { status: 'no_response', classification: 'no_response', replyCount: 0, analyzedReplies: [], positiveReply: null };
  }

  const analyzedReplies = replies.map((reply) => ({ ...reply, greetingOnly: isGreetingReply(reply.body), classification: classifyReply(reply.body) }));
  const { status, classification } = pickWindowVerdict(analyzedReplies);
  const positiveReply = [...analyzedReplies].reverse().find((r) => r.classification === 'positive' && !r.greetingOnly) || analyzedReplies.find((r) => r.classification === 'positive') || null;

  return { status, classification, replyCount: analyzedReplies.length, analyzedReplies, positiveReply };
}

/* ─── Timestamp-based chat index ─────────────────────────────── */

async function buildTimestampToChatIndex(tenantId, sentTimestampsMsArr, toleranceMs = 90_000) {
  const { client, status } = getTenantState(tenantId);
  if (WWEBJS_DEBUG) console.log(`[chatIndex] client=${!!client} status=${status} timestamps=${sentTimestampsMsArr?.length}`);
  const result = new Map();
  if (!client || status !== 'connected' || !sentTimestampsMsArr?.length) return result;

  const sorted = [...sentTimestampsMsArr].sort((a, b) => a - b);
  const minSec = Math.floor(sorted[0] / 1000) - Math.ceil(toleranceMs / 1000);
  const maxSec = Math.ceil(sorted[sorted.length - 1] / 1000) + Math.ceil(toleranceMs / 1000);
  const actMinSec = minSec - CHAT_INDEX_PAD_BEFORE_SEC;
  const actMaxSec = maxSec + CHAT_INDEX_PAD_AFTER_SEC;
  const expectKeys = new Set(sentTimestampsMsArr).size;

  let allChats = [];
  try { allChats = await client.getChats(); } catch (err) {
    if (WWEBJS_DEBUG) console.warn('buildTimestampToChatIndex:getChats:', stringFromWwebjsErr(err));
    return result;
  }

  const nonGroupChats = allChats.filter((c) => !c.isGroup && (c.timestamp == null || c.timestamp === 0 || (c.timestamp >= actMinSec && c.timestamp <= actMaxSec)))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const loadMessages = async (chat) => {
    if (CHAT_INDEX_SKIP_FETCH) return chat.lastMessage ? [chat.lastMessage] : [];
    let msgs = await chat.fetchMessages({ limit: 200 }).catch(() => []);
    if (!msgs.length && CHAT_INDEX_SYNC_RETRY) { await chat.syncHistory().catch(() => {}); msgs = await chat.fetchMessages({ limit: 200 }).catch(() => []); }
    if (!msgs.length && chat.lastMessage) msgs = [chat.lastMessage];
    return msgs;
  };

  const bestDiff = new Map();

  for (const chat of nonGroupChats) {
    let msgs = [];
    try { msgs = await loadMessages(chat); } catch (_) {}

    for (const msg of msgs) {
      if (!msg.fromMe) continue;
      const tsSec = msg.timestamp || 0;
      if (tsSec < minSec || tsSec > maxSec) continue;
      const tsMs = tsSec * 1000;
      for (const sentMs of sentTimestampsMsArr) {
        const diff = Math.abs(tsMs - sentMs);
        if (diff <= toleranceMs) {
          const prev = bestDiff.get(sentMs);
          if (prev === undefined || diff < prev) { bestDiff.set(sentMs, diff); result.set(sentMs, chat); }
        }
      }
    }
    if (CHAT_INDEX_EARLY_STOP && result.size >= expectKeys) break;
  }

  return result;
}

async function fetchRepliesFromChat(chat, outboundRef, maxReplies = 8) {
  const fetchLimit = Math.min(200, Math.max(30, READ_MSG_LIMIT));
  let raw = await chat.fetchMessages({ limit: fetchLimit }).catch(() => []);
  if (!raw.length && chat.lastMessage) raw = [chat.lastMessage];
  const ordered = [...raw].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let anchorIndex = -1;
  const mid = outboundRef.messageId != null ? String(outboundRef.messageId) : null;

  if (mid) {
    anchorIndex = ordered.findIndex((m) => m.fromMe && m?.id?._serialized && (m.id._serialized === mid || m.id._serialized.endsWith(mid.split(':').pop() || mid)));
  }

  if (anchorIndex === -1 && outboundRef.timestamp != null) {
    const tSec = Math.floor(Number(outboundRef.timestamp) / 1000);
    let bestI = -1; let bestD = 999999;
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i]; if (!m.fromMe) continue;
      const d = Math.abs((m.timestamp || 0) - tSec);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0 && bestD <= 120) anchorIndex = bestI;
  }

  const replies = [];
  const collectFrom = (startIdx) => {
    for (let i = startIdx; i < ordered.length; i++) {
      const msg = ordered[i]; if (msg.fromMe) continue;
      const body = incomingMessageText(msg); if (!body) continue;
      replies.push(buildReplyRow(msg, chat, i)); if (replies.length >= maxReplies) break;
    }
  };

  if (anchorIndex >= 0) { collectFrom(anchorIndex + 1); if (replies.length) return replies; }

  const sinceMs = (Number(outboundRef.timestamp) || 0) - 15_000;
  for (const msg of ordered) {
    if (msg.fromMe) continue;
    const tsMs = (msg.timestamp || 0) * 1000; if (tsMs < sinceMs) continue;
    const body = incomingMessageText(msg); if (!body) continue;
    replies.push(buildReplyRow(msg, chat, 'fb'));
    if (replies.length >= maxReplies) break;
  }
  return replies;
}

/* ─── Opt-out detection ──────────────────────────────────────── */

function isOptOutText(raw) {
  const text = (raw || '').trim().toLowerCase();
  if (text === 'sair' || text === 'stop' || text === 'remover') return true;
  if (text.includes('sair do evento')) return true;
  return false;
}

/* ─── Failure control ────────────────────────────────────────── */

function resetConsecutiveFailures(tenantId) {
  getTenantState(tenantId).consecutiveFailures = 0;
}

function incrementFailures(tenantId) {
  const state = getTenantState(tenantId);
  return ++state.consecutiveFailures;
}

function getConsecutiveFailures(tenantId) {
  return getTenantState(tenantId).consecutiveFailures;
}

function getTenantStateForAdmin(tenantId) {
  return getTenantState(tenantId);
}

/* ─── Auto-reconexão ao iniciar o servidor ───────────────────── */

/**
 * Ao subir o backend, verifica quais tenants tinham sessão no banco
 * (status='connected' ou 'qr_ready') E cuja pasta de auth ainda existe.
 * Para esses, re-inicializa o cliente automaticamente — o LocalAuth
 * restaura a sessão sem precisar escanear o QR de novo.
 */
async function autoReconnectSessions(io) {
  try {
    const { getDb } = require('../db');
    const { whatsappSessions, tenants } = require('../db/schema');
    const { eq, and, inArray } = require('drizzle-orm');
    const db = getDb();

    const sessions = await db.select({
      tenantId: whatsappSessions.tenantId,
      status:   whatsappSessions.status,
    }).from(whatsappSessions)
      .where(inArray(whatsappSessions.status, ['connected', 'qr_ready']));

    if (!sessions.length) {
      console.log('[wa-autoreconnect] nenhuma sessão pendente de restaurar');
      return;
    }

    // Filtra só tenants ativos
    const tenantIds = sessions.map((s) => s.tenantId);
    const activeTenants = await db.select({ id: tenants.id }).from(tenants)
      .where(and(inArray(tenants.id, tenantIds), eq(tenants.active, true)));
    const activeSet = new Set(activeTenants.map((t) => t.id));

    let started = 0;
    for (const s of sessions) {
      if (!activeSet.has(s.tenantId)) continue;

      // Só tenta reconectar se a pasta de auth do LocalAuth existe
      const authDir = path.join(WWEBJS_DATA_PATH, `session-${s.tenantId}`);
      if (!fs.existsSync(authDir)) {
        console.log(`[wa-autoreconnect] tenant=${s.tenantId} sem cache local — ignora`);
        continue;
      }

      try {
        initWhatsApp(s.tenantId, io);
        started++;
        console.log(`[wa-autoreconnect] tenant=${s.tenantId} reconectando…`);
      } catch (e) {
        console.warn(`[wa-autoreconnect] tenant=${s.tenantId} falhou:`, e.message);
      }
    }
    console.log(`[wa-autoreconnect] ${started} sessão(ões) restaurada(s) em background`);
  } catch (err) {
    console.warn('[wa-autoreconnect] erro geral:', err.message);
  }
}

/* ─── Exports ────────────────────────────────────────────────── */

module.exports = {
  initWhatsApp,
  getStatus,
  getClientFor,
  getTenantState: getTenantStateForAdmin,
  autoReconnectSessions,
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
