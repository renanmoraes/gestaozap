const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { randomUUID } = require('crypto');
const { getDb } = require('../db');
const {
  getProfile,
  updateProfile,
  updateEmail,
  setLogo,
  removeLogo,
} = require('../services/tenant-profile.service');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/i.test(file.mimetype || '');
    cb(ok ? null : new Error('Use JPG, PNG ou WebP (máx. 2 MB)'), ok);
  },
});

function getTenantId(req) {
  return req.tenant?.id || req.authTenant?.id;
}

router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant não identificado' });
    const db = getDb();
    const data = await getProfile(db, tenantId, req.user.id);
    res.json(data);
  } catch (err) {
    console.error('tenant profile get:', err);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant não identificado' });
    const db = getDb();
    const data = await updateProfile(db, tenantId, {
      ...req.body,
      _userId: req.user.id,
    });
    res.json(data);
  } catch (err) {
    console.error('tenant profile patch:', err);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/email', async (req, res) => {
  try {
    const db = getDb();
    const { email, currentPassword } = req.body || {};
    const result = await updateEmail(db, req.user.id, { email, currentPassword });
    res.json(result);
  } catch (err) {
    console.error('tenant profile email:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/logo', upload.single('logo'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant não identificado' });
    const db = getDb();
    const result = await setLogo(db, tenantId, req.file);
    res.json(result);
  } catch (err) {
    console.error('tenant profile logo:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/logo', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant não identificado' });
    const db = getDb();
    await removeLogo(db, tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error('tenant profile logo delete:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
