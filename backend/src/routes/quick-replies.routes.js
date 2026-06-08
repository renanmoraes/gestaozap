const router = require('express').Router();
const { eq, and, asc, desc } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { quickReplies } = require('../db/schema');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

const SHORTCUT_REGEX = /^\/[a-z0-9_-]{1,30}$/i;

function isValidUUID(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
}

function normalizeShortcut(s) {
  let v = String(s || '').trim().toLowerCase();
  if (v && !v.startsWith('/')) v = `/${v}`;
  return v;
}

/* GET /api/quick-replies — lista todos */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const rows = await db.select().from(quickReplies)
      .where(eq(quickReplies.tenantId, tenantId))
      .orderBy(desc(quickReplies.usageCount), asc(quickReplies.shortcut));
    res.json(rows);
  } catch (err) {
    console.error('quick-replies list:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/quick-replies — cria */
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const shortcut = normalizeShortcut(req.body?.shortcut);
    const title = (req.body?.title || '').trim();
    const body = (req.body?.body || '').trim();

    if (!SHORTCUT_REGEX.test(shortcut)) {
      return res.status(400).json({ error: 'Atalho inválido — use /nome (letras, números, _, -)' });
    }
    if (!title) return res.status(400).json({ error: 'Dê um título para esse atalho' });
    if (!body) return res.status(400).json({ error: 'A mensagem não pode ficar vazia' });
    if (body.length > 4000) return res.status(400).json({ error: 'Mensagem muito longa' });

    const [row] = await db.insert(quickReplies).values({
      tenantId, shortcut, title, body,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esse atalho já existe — escolha outro' });
    console.error('quick-replies post:', err);
    res.status(500).json({ error: err.message });
  }
});

/* PUT /api/quick-replies/:id */
router.put('/:id', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const db = getDb();
    const tenantId = getTenantId(req);

    const update = { updatedAt: new Date() };
    if (req.body?.shortcut !== undefined) {
      const s = normalizeShortcut(req.body.shortcut);
      if (!SHORTCUT_REGEX.test(s)) return res.status(400).json({ error: 'Atalho inválido' });
      update.shortcut = s;
    }
    if (req.body?.title !== undefined) update.title = String(req.body.title).trim();
    if (req.body?.body  !== undefined) update.body  = String(req.body.body).trim();

    const [row] = await db.update(quickReplies).set(update)
      .where(and(eq(quickReplies.id, req.params.id), eq(quickReplies.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Atalho não encontrado' });
    res.json(row);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esse atalho já existe' });
    console.error('quick-replies put:', err);
    res.status(500).json({ error: err.message });
  }
});

/* DELETE /api/quick-replies/:id */
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const db = getDb();
    const tenantId = getTenantId(req);
    await db.delete(quickReplies)
      .where(and(eq(quickReplies.id, req.params.id), eq(quickReplies.tenantId, tenantId)));
    res.json({ ok: true });
  } catch (err) {
    console.error('quick-replies delete:', err);
    res.status(500).json({ error: err.message });
  }
});

/* POST /api/quick-replies/:id/use — incrementa contador de uso */
router.post('/:id/use', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const db = getDb();
    const tenantId = getTenantId(req);
    const { sql } = require('drizzle-orm');
    await db.update(quickReplies)
      .set({ usageCount: sql`${quickReplies.usageCount} + 1` })
      .where(and(eq(quickReplies.id, req.params.id), eq(quickReplies.tenantId, tenantId)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
