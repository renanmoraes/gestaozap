const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const { eq, and, sql } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { conversations, messages, campaigns, quickReplies } = require('../db/schema');
const conversationService = require('../services/conversation.service');
const whatsapp = require('../services/whatsapp.service');
const { requireWAConnected } = require('../middleware/featureGate');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');
const { getIo } = require('../config/registry');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

function isValidUUID(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
}

// Upload para anexos de chat
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '../../uploads'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      cb(null, `chat-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 32 * 1024 * 1024 }, // 32MB
  fileFilter: (req, file, cb) => {
    // Aceita: imagem, áudio, vídeo, PDF, planilha, documento, texto comum
    const ok = /^(image\/|audio\/|video\/|application\/(pdf|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel|zip)|text\/(plain|csv))/i.test(file.mimetype);
    cb(ok ? null : new Error('Tipo de arquivo não suportado'), ok);
  },
});

async function findConversation(tenantId, conversationId) {
  if (!isValidUUID(conversationId)) return null;
  const db = getDb();
  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)));
  return conv || null;
}

/* GET /api/chats — lista paginada */
router.get('/', async (req, res) => {
  try {
    const result = await conversationService.paginateConversations(getTenantId(req), {
      search: req.query.search || req.query.q,
      tag: req.query.tag,
      onlyUnread: req.query.unread === '1' || req.query.unread === 'true',
      cursor: req.query.cursor,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    console.error('chats list:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/chats/by-phone — abre/resolve conversa por número */
router.post('/by-phone', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const phone = normalizePhoneForWhatsApp(req.body?.phone);
    if (!phone) return res.status(400).json({ error: 'Número inválido' });
    const waChatId = `${phone}@c.us`;
    const { id } = await conversationService.upsertConversationFromWaChat(tenantId, waChatId, {});
    const conv = await findConversation(tenantId, id);
    res.json(conv);
  } catch (err) {
    console.error('chats by-phone:', err);
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/chats/:chatId */
router.get('/:chatId', async (req, res) => {
  const conv = await findConversation(getTenantId(req), req.params.chatId);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  res.json(conv);
});

/* GET /api/chats/:chatId/messages */
router.get('/:chatId/messages', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const conv = await findConversation(tenantId, req.params.chatId);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    const result = await conversationService.paginateMessages(tenantId, req.params.chatId, {
      before: req.query.before,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    console.error('chats messages:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/chats/:chatId/messages — envia texto, foto, áudio, vídeo ou documento */
router.post('/:chatId/messages', requireWAConnected, upload.single('file'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const conv = await findConversation(tenantId, req.params.chatId);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    const body = (req.body.body || '').toString();
    const file = req.file;
    if (!body.trim() && !file) {
      return res.status(400).json({ error: 'Mensagem vazia — escreva algo ou anexe um arquivo' });
    }
    if (body.length > 4096) {
      return res.status(400).json({ error: 'Mensagem muito longa (máximo 4096 caracteres)' });
    }

    const mediaPath = file ? path.join('uploads', file.filename) : null;
    const io = req.app.get('io') || getIo();

    // Detecta o tipo da mídia para informar o serviço
    let mediaType = null;
    if (file) {
      const m = file.mimetype || '';
      if (m.startsWith('image/'))      mediaType = 'image';
      else if (m.startsWith('audio/')) mediaType = 'audio';
      else if (m.startsWith('video/')) mediaType = 'video';
      else                              mediaType = 'document';
    }

    const { sent, message } = await conversationService.sendMessageAndPersist(
      tenantId, io, conv.phone, body,
      mediaPath ? path.join(__dirname, '../../', mediaPath) : null,
      {
        waChatId: conv.waChatId || conv.wa_chat_id || null,
        mediaType,
        mediaMime: file?.mimetype || null,
        originalName: file?.originalname || null,
      },
    );

    res.json({ message, waMessageId: sent?.messageId });
  } catch (err) {
    console.error('chats send:', err);
    res.status(500).json({ error: err.message || 'Erro ao enviar' });
  }
});

/* Backward compat: aceita upload.single('image') também */
router.post('/:chatId/messages-image', requireWAConnected, upload.single('image'), (req, res, next) => {
  if (req.file) req.body._upload_field = 'image';
  next();
});

/* POST /api/chats/:chatId/read */
router.post('/:chatId/read', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const io = req.app.get('io') || getIo();
    const ok = await conversationService.markRead(tenantId, io, req.params.chatId);
    if (!ok) return res.status(404).json({ error: 'Conversa não encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('chats read:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/chats/:chatId/notes */
router.post('/:chatId/notes', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const body = (req.body?.body || '').toString().trim();
    if (!body) return res.status(400).json({ error: 'Escreva algo antes de salvar a nota' });
    if (body.length > 2000) return res.status(400).json({ error: 'Nota muito longa' });

    const io = req.app.get('io') || getIo();
    const note = await conversationService.addInternalNote(tenantId, io, req.params.chatId, body);
    if (!note) return res.status(404).json({ error: 'Conversa não encontrada' });
    res.json(note);
  } catch (err) {
    console.error('chats notes:', err);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/chats/:chatId/tags */
router.put('/:chatId/tags', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const io = req.app.get('io') || getIo();
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const updated = await conversationService.updateTags(tenantId, io, req.params.chatId, tags);
    if (!updated) return res.status(404).json({ error: 'Conversa não encontrada' });
    res.json(updated);
  } catch (err) {
    console.error('chats tags:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/chats/:chatId/send-template — envia campaign existente para esse contato */
router.post('/:chatId/send-template', requireWAConnected, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const conv = await findConversation(tenantId, req.params.chatId);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    const { campaignId, variables = {} } = req.body || {};
    if (!isValidUUID(campaignId)) return res.status(400).json({ error: 'campaignId inválido' });

    const db = getDb();
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, tenantId)));
    if (!campaign) return res.status(404).json({ error: 'Template não encontrado' });

    // Renderiza variáveis
    let text = String(campaign.text || '')
      .replace(/\{nome\}/gi, conv.contactName || variables.nome || '')
      .replace(/\{evento\}/gi, variables.evento || '')
      .replace(/\{data\}/gi, variables.data || '')
      .replace(/\{horario\}/gi, variables.horario || '')
      .replace(/\{local\}/gi, variables.local || '');
    if (campaign.appendOptOut && campaign.optOutText) {
      text = `${text}\n\n${campaign.optOutText}`;
    }

    const io = req.app.get('io') || getIo();
    const storageService = require('../services/storage.service');
    const imagePath = campaign.imagePath
      ? await storageService.resolveMediaPathForSend(campaign.imagePath)
      : null;

    const { message } = await conversationService.sendMessageAndPersist(
      tenantId, io, conv.phone, text, imagePath,
      { waChatId: conv.waChatId || conv.wa_chat_id || null },
    );

    res.json({ message, campaignName: campaign.name });
  } catch (err) {
    console.error('chats send-template:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/chats/sync — re-dispara backfill manualmente */
router.post('/sync', requireWAConnected, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const io = req.app.get('io') || getIo();
    // Dispara em background
    conversationService.syncFromWwebjs(tenantId, io).catch((e) =>
      console.warn('[chat] manual sync error:', e.message));
    res.json({ ok: true, started: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
