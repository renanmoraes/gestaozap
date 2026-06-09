const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const requireFeature = require('../middleware/requireFeature');
const storageService = require('../services/storage.service');
const {
  listLayouts,
  listPromotions,
  getPromotionWithLayout,
  createPromotion,
  updatePromotion,
  deletePromotion,
  getAnalytics,
} = require('../services/promotion.service');

const gate = requireFeature('vitrine-promocoes');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Arquivo inválido — use imagem ou vídeo (máx. 32 MB)'), ok);
  },
});

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

async function handleMediaUpload(file, tenantId) {
  if (!file) return null;
  const localPath = path.join(__dirname, '../../uploads', file.filename);
  const keyHint = `promotions/${tenantId}`;
  const isVideo = /^video\//i.test(file.mimetype || '');
  try {
    const up = await storageService.uploadFromPath(localPath, keyHint);
    if (up.provider === 'r2') {
      try { fs.unlinkSync(localPath); } catch (_) {}
      return { url: up.url, mediaType: isVideo ? 'video' : 'image' };
    }
    return { url: `uploads/${file.filename}`, mediaType: isVideo ? 'video' : 'image' };
  } catch (e) {
    console.warn('[promotions] R2 upload falhou — mantém local:', e.message);
    return { url: `uploads/${file.filename}`, mediaType: isVideo ? 'video' : 'image' };
  }
}

router.use(gate);

router.get('/layouts', async (req, res) => {
  try {
    const db = getDb();
    const rows = await listLayouts(db);
    res.json(rows);
  } catch (err) {
    console.error('promotions layouts:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const days = Number(req.query.days) || 30;
    const data = await getAnalytics(db, tenantId, { days });
    res.json(data);
  } catch (err) {
    console.error('promotions analytics:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const rows = await listPromotions(db, getTenantId(req));
    res.json(rows);
  } catch (err) {
    console.error('promotions list:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const row = await getPromotionWithLayout(db, req.params.id, getTenantId(req));
    if (!row) return res.status(404).json({ error: 'Promoção não encontrada' });
    res.json(row);
  } catch (err) {
    console.error('promotions get:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const row = await createPromotion(db, getTenantId(req), req.body);
    res.status(201).json(row);
  } catch (err) {
    console.error('promotions create:', err);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const db = getDb();
    const row = await updatePromotion(db, getTenantId(req), req.params.id, req.body);
    res.json(row);
  } catch (err) {
    console.error('promotions update:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    await deletePromotion(db, getTenantId(req), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('promotions delete:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const result = await handleMediaUpload(req.file, tenantId);
    if (!result) return res.status(400).json({ error: 'Arquivo obrigatório' });
    res.json(result);
  } catch (err) {
    console.error('promotions upload:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
