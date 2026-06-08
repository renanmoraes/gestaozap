const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { eq, and, desc } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { campaigns } = require('../db/schema');
const storageService = require('../services/storage.service');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  // UUID garante nomes únicos globalmente — sem colisão entre tenants
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});
const upload = multer({ storage });

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

function normalizeDoc(c) {
  if (!c) return c;
  return { ...c, _id: c.id };
}

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const rows = await db.select().from(campaigns)
      .where(eq(campaigns.tenantId, tenantId))
      .orderBy(desc(campaigns.createdAt));
    res.json(rows.map(normalizeDoc));
  } catch (err) {
    console.error('campaigns get:', err);
    res.status(500).json({ error: err.message });
  }
});

async function handleImageUpload(file, tenantId) {
  if (!file) return null;
  const localPath = path.join(__dirname, '../../uploads', file.filename);
  const keyHint = `campaigns/${tenantId}`;
  try {
    const up = await storageService.uploadFromPath(localPath, keyHint);
    if (up.provider === 'r2') {
      try { fs.unlinkSync(localPath); } catch (_) {}
      return up.url; // URL pública absoluta do R2
    }
    return `uploads/${file.filename}`; // fallback local
  } catch (e) {
    console.warn('[campaigns] R2 upload falhou — mantém local:', e.message);
    return `uploads/${file.filename}`;
  }
}

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const data = { ...req.body, tenantId };
    const url = await handleImageUpload(req.file, tenantId);
    if (url) data.imagePath = url;
    if (data.appendOptOut !== undefined) data.appendOptOut = data.appendOptOut === 'true' || data.appendOptOut === true;
    const [campaign] = await db.insert(campaigns).values(data).returning();
    res.status(201).json(normalizeDoc(campaign));
  } catch (err) {
    console.error('campaigns post:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const data = { ...req.body, updatedAt: new Date() };
    const url = await handleImageUpload(req.file, tenantId);
    if (url) data.imagePath = url;
    if (data.appendOptOut !== undefined) data.appendOptOut = data.appendOptOut === 'true' || data.appendOptOut === true;
    const [campaign] = await db.update(campaigns)
      .set(data)
      .where(and(eq(campaigns.id, req.params.id), eq(campaigns.tenantId, tenantId)))
      .returning();
    res.json(normalizeDoc(campaign));
  } catch (err) {
    console.error('campaigns put:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    await db.delete(campaigns)
      .where(and(eq(campaigns.id, req.params.id), eq(campaigns.tenantId, tenantId)));
    res.json({ deleted: true });
  } catch (err) {
    console.error('campaigns delete:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
