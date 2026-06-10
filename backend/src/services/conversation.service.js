const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { eq, and, desc, lt, sql, isNotNull, inArray, ilike, or } = require('drizzle-orm');
const { getDb } = require('../db');
const { conversations, messages, contacts } = require('../db/schema');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');

// Transcodificação Opus → MP3 (universal: Safari/iOS, browsers antigos)
let ffmpegPath = null;
let ffmpeg = null;
try {
  ffmpegPath = require('ffmpeg-static');
  ffmpeg = require('fluent-ffmpeg');
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('[chat] ffmpeg disponível:', ffmpegPath);
} catch (e) {
  console.warn('[chat] ffmpeg não disponível — áudios serão servidos como recebidos:', e.message);
}

function transcodeAudioToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!ffmpeg) return reject(new Error('ffmpeg não disponível'));
    ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .audioBitrate('64k')
      .format('mp3')
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

const CHAT_UPLOAD_BASE = path.join(__dirname, '../../uploads/chat');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function previewFromBody(body, hasMedia, mediaType) {
  if (body && body.trim()) return body.slice(0, 200);
  if (hasMedia) {
    const labels = { image: '📷 Imagem', audio: '🎤 Áudio', video: '🎥 Vídeo', document: '📄 Documento', sticker: '🌟 Sticker' };
    return labels[mediaType] || '📎 Mídia';
  }
  return '';
}

function phoneFromWaChatId(waChatId) {
  // 5511999999999@c.us → 5511999999999
  return String(waChatId || '').split('@')[0].replace(/\D/g, '');
}

/**
 * Cria ou atualiza conversa.
 * Aceita meta.realPhone (preferido para LID), meta.avatarUrl, meta.contactName, meta.isGroup.
 * Retorna { id, isNew }
 */
async function upsertConversationFromWaChat(tenantId, waChatId, meta = {}) {
  const db = getDb();
  // Em LID o phoneFromWaChatId retorna lixo (ID interno); preferimos realPhone quando vier
  const rawPhone = meta.realPhone || phoneFromWaChatId(waChatId);
  const normalized = normalizePhoneForWhatsApp(rawPhone) || rawPhone;

  let contactId = null;
  let contactName = meta.contactName || null;
  try {
    const [c] = await db.select({ id: contacts.id, name: contacts.name }).from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, normalized)))
      .limit(1);
    if (c) {
      contactId = c.id;
      contactName = c.name || contactName;
    }
  } catch (_) {}

  const inserted = await db.insert(conversations).values({
    tenantId,
    waChatId,
    phone: normalized,
    contactId,
    contactName,
    isGroup: Boolean(meta.isGroup),
    avatarUrl: meta.avatarUrl || null,
  }).onConflictDoNothing().returning({ id: conversations.id });

  if (inserted.length) {
    return { id: inserted[0].id, isNew: true };
  }

  const [existing] = await db.select({ id: conversations.id }).from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.waChatId, waChatId)));

  // Atualiza campos que possam ter mudado (nome do contato, foto, telefone real)
  if (existing) {
    const update = { updatedAt: new Date() };
    let changed = false;
    if (contactId)   { update.contactId = contactId; changed = true; }
    if (contactName) { update.contactName = contactName; changed = true; }
    if (meta.avatarUrl) { update.avatarUrl = meta.avatarUrl; changed = true; }
    if (meta.realPhone && normalized) { update.phone = normalized; changed = true; }
    if (changed) {
      await db.update(conversations).set(update).where(eq(conversations.id, existing.id));
    }
  }

  return { id: existing?.id, isNew: false };
}

/**
 * Salva mídia inbound do wwebjs. Retorna { url, mime, type }.
 */
async function saveInboundMedia(tenantId, msg) {
  try {
    if (!msg.hasMedia) return null;
    const media = await msg.downloadMedia();
    if (!media || !media.data) return null;

    const dir = path.join(CHAT_UPLOAD_BASE, tenantId);
    ensureDir(dir);

    const mime = media.mimetype || '';

    // O wwebjs identifica o tipo da mensagem — usar isso como verdade primária.
    // 'ptt' = push-to-talk (áudio gravado), 'audio' = áudio enviado como arquivo
    const wwebjsType = msg.type || '';
    const isAudioByMsgType = wwebjsType === 'ptt' || wwebjsType === 'audio' || wwebjsType === 'voice';
    const isImageByMsgType = wwebjsType === 'image';
    const isVideoByMsgType = wwebjsType === 'video' || wwebjsType === 'gif';
    const isStickerByMsgType = wwebjsType === 'sticker';
    const isDocByMsgType   = wwebjsType === 'document';

    const type = isAudioByMsgType || mime.startsWith('audio/') ? 'audio'
      : isImageByMsgType || isStickerByMsgType || mime.startsWith('image/') ? 'image'
      : isVideoByMsgType || mime.startsWith('video/') ? 'video'
      : isDocByMsgType || mime.startsWith('application/') ? 'document'
      : 'other';

    const rawExt = mime.split('/')[1]?.split(';')[0]?.replace(/[^a-z0-9]/gi, '') || 'bin';
    const id = randomUUID();
    const rawFilename = `${id}.${rawExt}`;
    const rawFilepath = path.join(dir, rawFilename);
    fs.writeFileSync(rawFilepath, Buffer.from(media.data, 'base64'));

    const storage = require('./storage.service');
    const keyHint = `chat/${tenantId}`;

    // Áudios do WhatsApp são Opus/OGG (não tocam em Safari/iOS).
    // Transcodifica para MP3 — universal em qualquer browser.
    if (type === 'audio' && ffmpeg) {
      const mp3Filename = `${id}.mp3`;
      const mp3Filepath = path.join(dir, mp3Filename);
      try {
        await transcodeAudioToMp3(rawFilepath, mp3Filepath);
        try { fs.unlinkSync(rawFilepath); } catch (_) {}

        const up = await storage.uploadFromPath(mp3Filepath, keyHint).catch((e) => {
          console.warn('[chat] R2 upload audio falhou — mantém local:', e.message);
          return null;
        });
        if (up?.provider === 'r2') {
          try { fs.unlinkSync(mp3Filepath); } catch (_) {} // não precisa mais do arquivo local
        }
        return {
          url:  up?.url || `/uploads/chat/${tenantId}/${mp3Filename}`,
          mime: 'audio/mpeg',
          type: 'audio',
        };
      } catch (err) {
        console.warn(`[chat] transcode falhou (${err.message}) — usando original`);
      }
    }

    // Demais tipos (imagem, vídeo, documento): tenta upload pro R2 e cai pra local se falhar
    const up = await storage.uploadFromPath(rawFilepath, keyHint).catch((e) => {
      console.warn('[chat] R2 upload falhou — mantém local:', e.message);
      return null;
    });
    if (up?.provider === 'r2') {
      try { fs.unlinkSync(rawFilepath); } catch (_) {}
    }
    return {
      url:  up?.url || `/uploads/chat/${tenantId}/${rawFilename}`,
      mime: mime || null,
      type,
    };
  } catch (e) {
    console.warn('[chat] saveInboundMedia falhou:', e.message);
    return null;
  }
}

/**
 * Registra mensagem inbound (recebida do cliente).
 */
async function recordIncomingMessage(tenantId, io, payload) {
  const db = getDb();
  const { waMessageId, waChatId, body = '', hasMedia = false, mediaInfo = null, timestampMs, contactName, isGroup = false, authorName = null, realPhone = null, avatarUrl = null } = payload;

  const { id: conversationId } = await upsertConversationFromWaChat(tenantId, waChatId, {
    contactName, isGroup, realPhone, avatarUrl,
  });
  if (!conversationId) return null;

  const waTimestamp = new Date(timestampMs || Date.now());
  const basePreview = previewFromBody(body, hasMedia, mediaInfo?.type);
  // Em grupos, prefixa o preview com o nome do autor para o atendente identificar quem mandou
  const preview = (isGroup && authorName) ? `${authorName}: ${basePreview}`.slice(0, 200) : basePreview;

  const inserted = await db.insert(messages).values({
    tenantId,
    conversationId,
    waMessageId: waMessageId || null,
    direction: 'in',
    status: 'received',
    body: body || null,
    mediaUrl: mediaInfo?.url || null,
    mediaMime: mediaInfo?.mime || null,
    mediaType: mediaInfo?.type || null,
    hasMedia,
    waTimestamp,
  }).onConflictDoNothing().returning();

  if (!inserted.length) return null; // já existia (dedup)
  const message = inserted[0];

  // Atualiza conversa: +1 unread, novo preview, last_message_at
  await db.update(conversations)
    .set({
      unreadCount: sql`${conversations.unreadCount} + 1`,
      lastMessagePreview: preview,
      lastMessageAt: waTimestamp,
      lastMessageFromMe: false,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  if (io) {
    io.to(tenantId).emit('chat:message_in', { conversationId, message });
    io.to(tenantId).emit('chat:upserted', { conversationId });
  }

  // ─── Captura de intenção (feature paga "intencoes") — fire-and-forget ───
  // Gate de feature/contrato é feito dentro do serviço; só processa texto inbound.
  if (body) {
    require('./intent.service')
      .processInboundMessage(db, io, { tenantId, conversationId, messageId: message.id, body })
      .catch((e) => console.warn('[intent] inbound error:', e.message));
  }

  return message;
}

/**
 * Registra mensagem outbound (enviada pelo atendente ou celular físico).
 */
async function recordOutgoingMessage(tenantId, io, payload) {
  const db = getDb();
  const { waMessageId, waChatId, body = '', mediaInfo = null, timestampMs, sendLogId = null } = payload;

  const { id: conversationId } = await upsertConversationFromWaChat(tenantId, waChatId, {});
  if (!conversationId) return null;

  const waTimestamp = new Date(timestampMs || Date.now());
  const hasMedia = Boolean(mediaInfo);
  const preview = previewFromBody(body, hasMedia, mediaInfo?.type);

  const inserted = await db.insert(messages).values({
    tenantId,
    conversationId,
    waMessageId: waMessageId || null,
    direction: 'out',
    status: 'sent',
    body: body || null,
    mediaUrl: mediaInfo?.url || null,
    mediaMime: mediaInfo?.mime || null,
    mediaType: mediaInfo?.type || null,
    hasMedia,
    sendLogId,
    waTimestamp,
  }).onConflictDoNothing().returning();

  if (!inserted.length) return null;
  const message = inserted[0];

  await db.update(conversations)
    .set({
      lastMessagePreview: preview,
      lastMessageAt: waTimestamp,
      lastMessageFromMe: true,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  if (io) {
    io.to(tenantId).emit('chat:message_out', { conversationId, message });
  }
  return message;
}

/**
 * Atualiza status de mensagem (delivered, read) via ack do wwebjs.
 */
async function updateMessageStatus(tenantId, io, waMessageId, status) {
  if (!waMessageId) return;
  const db = getDb();
  const updated = await db.update(messages)
    .set({ status })
    .where(and(eq(messages.tenantId, tenantId), eq(messages.waMessageId, waMessageId)))
    .returning({ id: messages.id, conversationId: messages.conversationId });
  if (updated.length && io) {
    io.to(tenantId).emit('chat:message_status', {
      conversationId: updated[0].conversationId,
      messageId: updated[0].id,
      status,
    });
  }
}

/**
 * Nota interna do atendente (não enviada para o cliente).
 */
async function addInternalNote(tenantId, io, conversationId, body) {
  const db = getDb();

  // Confirma que conversa pertence ao tenant
  const [conv] = await db.select({ id: conversations.id }).from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)));
  if (!conv) return null;

  const [note] = await db.insert(messages).values({
    tenantId,
    conversationId,
    direction: 'note',
    status: 'sent',
    body,
    isInternalNote: true,
    waTimestamp: new Date(),
  }).returning();

  if (io) io.to(tenantId).emit('chat:note_added', { conversationId, message: note });
  return note;
}

async function markRead(tenantId, io, conversationId) {
  const db = getDb();
  const updated = await db.update(conversations)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)))
    .returning({ id: conversations.id });
  if (updated.length && io) {
    io.to(tenantId).emit('chat:read', { conversationId });
  }
  return updated.length > 0;
}

async function updateTags(tenantId, io, conversationId, tags) {
  const db = getDb();
  const clean = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const updated = await db.update(conversations)
    .set({ tags: clean, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)))
    .returning();
  if (updated.length && io) {
    io.to(tenantId).emit('chat:tags_changed', { conversationId, tags: clean });
  }
  return updated[0] || null;
}

/**
 * Lista paginada de conversas (keyset por last_message_at).
 */
async function paginateConversations(tenantId, opts = {}) {
  const db = getDb();
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit) || 50));
  const conditions = [
    eq(conversations.tenantId, tenantId),
    eq(conversations.archived, false),
  ];

  if (opts.search) {
    const s = `%${opts.search}%`;
    conditions.push(or(
      ilike(conversations.contactName, s),
      ilike(conversations.phone, s),
      ilike(conversations.lastMessagePreview, s),
    ));
  }

  if (opts.tag) {
    conditions.push(sql`${conversations.tags} @> ARRAY[${opts.tag}]::text[]`);
  }

  if (opts.onlyUnread) {
    conditions.push(sql`${conversations.unreadCount} > 0`);
  }

  if (opts.cursor) {
    const cursorDate = new Date(opts.cursor);
    if (!isNaN(cursorDate.getTime())) {
      conditions.push(lt(conversations.lastMessageAt, cursorDate));
    }
  }

  const rows = await db.select().from(conversations)
    .where(and(...conditions))
    .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length
    ? (items[items.length - 1].lastMessageAt?.toISOString?.() || null)
    : null;

  return { items, hasMore, nextCursor };
}

/**
 * Lista paginada de mensagens (mais recentes primeiro; scroll up carrega mais antigas).
 */
async function paginateMessages(tenantId, conversationId, opts = {}) {
  const db = getDb();
  const limit = Math.min(200, Math.max(1, parseInt(opts.limit) || 50));

  const conditions = [
    eq(messages.tenantId, tenantId),
    eq(messages.conversationId, conversationId),
  ];

  if (opts.before) {
    const beforeDate = new Date(opts.before);
    if (!isNaN(beforeDate.getTime())) {
      conditions.push(lt(messages.waTimestamp, beforeDate));
    }
  }

  const rows = await db.select().from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.waTimestamp))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const oldestTs = items.length ? items[items.length - 1].waTimestamp : null;
  const nextBefore = hasMore && oldestTs ? oldestTs.toISOString() : null;

  // Retorna em ordem cronológica (mais antiga primeiro) para a UI
  return { items: items.reverse(), hasMore, nextBefore };
}

/**
 * Backfill ao conectar: pega chats do wwebjs e cria conversas + lastMessage.
 * Executado em background no client.on('ready').
 */
async function syncFromWwebjs(tenantId, io) {
  try {
    const whatsapp = require('./whatsapp.service');
    const client = whatsapp.getClientFor(tenantId);
    if (!client) return;

    const chats = await client.getChats().catch(() => []);
    const total = chats.length;

    if (io) io.to(tenantId).emit('chat:sync_started', { total });
    console.log(`[chat] sync tenant=${tenantId}: ${total} chat(s) a processar`);

    let upserts = 0;
    let done = 0;

    for (const chat of chats) {
      const waChatId = chat?.id?._serialized;
      if (!waChatId) { done++; continue; }

      const isGroup = Boolean(chat.isGroup);
      const chatName = chat.name || chat.formattedTitle || chat.pushname || null;

      // Foto de perfil (não bloqueia se falhar)
      let avatarUrl = null;
      try {
        avatarUrl = await chat.getContact()
          .then((c) => c?.getProfilePicUrl?.())
          .catch(() => null);
        if (!avatarUrl) avatarUrl = await client.getProfilePicUrl(waChatId).catch(() => null);
      } catch (_) {}

      // Telefone real (caso de LID): pega via contact.number
      let realPhone = null;
      if (!isGroup && String(waChatId).endsWith('@lid')) {
        try {
          const c = await chat.getContact();
          if (c?.number) realPhone = c.number;
        } catch (_) {}
      }

      const { id: conversationId } = await upsertConversationFromWaChat(tenantId, waChatId, {
        contactName: chatName,
        isGroup,
        avatarUrl,
        realPhone,
      });

      // Insere lastMessage se ainda não existe
      const last = chat.lastMessage;
      if (last && last.id?._serialized && conversationId) {
        const isOut = Boolean(last.fromMe);
        const ts = (last.timestamp || 0) * 1000;
        const body = (last.body || last.caption || '').toString();

        // Em grupo, prefixa preview com o nome do autor
        let authorPrefix = '';
        if (isGroup && !isOut && last.author) {
          try {
            const authorContact = await client.getContactById(last.author).catch(() => null);
            const authorName = authorContact?.pushname || authorContact?.name || null;
            if (authorName) authorPrefix = `${authorName}: `;
          } catch (_) {}
        }

        const inserted = await getDb().insert(messages).values({
          tenantId,
          conversationId,
          waMessageId: last.id._serialized,
          direction: isOut ? 'out' : 'in',
          status: isOut ? 'sent' : 'received',
          body: body || null,
          hasMedia: Boolean(last.hasMedia),
          waTimestamp: new Date(ts || Date.now()),
        }).onConflictDoNothing().returning({ id: messages.id });

        if (inserted.length) {
          const preview = authorPrefix + previewFromBody(body, Boolean(last.hasMedia), null);
          await getDb().update(conversations)
            .set({
              lastMessagePreview: preview.slice(0, 200),
              lastMessageAt: new Date(ts || Date.now()),
              lastMessageFromMe: isOut,
              updatedAt: new Date(),
            })
            .where(eq(conversations.id, conversationId));
        }
      }

      upserts += 1;
      done += 1;

      // Emite progresso a cada 10 chats (ou no último)
      if (io && (done % 10 === 0 || done === total)) {
        io.to(tenantId).emit('chat:sync_progress', { done, total });
      }
    }

    console.log(`[chat] sync tenant=${tenantId}: ${upserts}/${total} conversas sincronizadas`);
    if (io) io.to(tenantId).emit('chat:sync_done', { count: upserts, total });
  } catch (err) {
    console.warn(`[chat] sync tenant=${tenantId} falhou:`, err.message);
    if (io) io.to(tenantId).emit('chat:sync_done', { count: 0, error: err.message });
  }
}

/**
 * Wrapper de envio que persiste a mensagem na timeline.
 * Usado pelos endpoints novos de chat (e opcionalmente pelo queue).
 */
async function sendMessageAndPersist(tenantId, io, phone, body, mediaPath, opts = {}) {
  const whatsapp = require('./whatsapp.service');
  const sent = await whatsapp.sendMessage(tenantId, phone, body, mediaPath || null, {
    directChatId: opts.waChatId || null,
    mediaType: opts.mediaType || null,
    mediaMime: opts.mediaMime || null,
    originalName: opts.originalName || null,
  });

  const waChatId = sent?.chatId || opts.waChatId || `${phone.replace(/\D/g, '')}@c.us`;
  let mediaInfo = null;

  if (mediaPath) {
    const filename = path.basename(mediaPath);
    let finalUrl = mediaPath.startsWith('/uploads') ? mediaPath : `/uploads/${filename}`;

    // Tenta subir pro R2 (se configurado). Após sucesso, deleta o local.
    try {
      const storage = require('./storage.service');
      const keyHint = `chat/${tenantId}`;
      const up = await storage.uploadFromPath(mediaPath, keyHint);
      finalUrl = up.url;
      if (up.provider === 'r2') {
        try { fs.unlinkSync(mediaPath); } catch (_) {}
      }
    } catch (e) {
      console.warn('[chat] R2 upload outbound falhou — mantém local:', e.message);
    }

    mediaInfo = {
      url: finalUrl,
      mime: opts.mediaMime || 'application/octet-stream',
      type: opts.mediaType || 'document',
    };
  }

  const message = await recordOutgoingMessage(tenantId, io, {
    waMessageId: sent?.messageId || null,
    waChatId,
    body,
    mediaInfo,
    timestampMs: sent?.timestamp || Date.now(),
    sendLogId: opts.sendLogId || null,
  });

  return { sent, message };
}

module.exports = {
  upsertConversationFromWaChat,
  recordIncomingMessage,
  recordOutgoingMessage,
  updateMessageStatus,
  addInternalNote,
  markRead,
  updateTags,
  paginateConversations,
  paginateMessages,
  syncFromWwebjs,
  sendMessageAndPersist,
  saveInboundMedia,
};
