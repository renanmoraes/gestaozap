const router = require('express').Router();
const { eq, and, inArray, sql } = require('drizzle-orm');
const { getDb, getPool, DEFAULT_TENANT_ID } = require('../db');
const { contacts } = require('../db/schema');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');
const { formatStampBr } = require('../utils/timezone.util');
const { buildListConditions } = require('../utils/contacts-query.util');
const { requireWAConnected } = require('../middleware/featureGate');
const whatsapp = require('../services/whatsapp.service');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

async function fetchContactTags(tenantId) {
  const { rows } = await getPool().query(
    `SELECT DISTINCT unnest(tags) AS tag
     FROM contacts
     WHERE tenant_id = $1 AND active = true
     ORDER BY tag`,
    [tenantId],
  );
  return rows.map((r) => r.tag).filter(Boolean);
}

async function fetchOptedOutCount(tenantId) {
  const db = getDb();
  const [row] = await db.select({ count: sql`count(*)::int` })
    .from(contacts)
    .where(and(
      eq(contacts.tenantId, tenantId),
      eq(contacts.active, true),
      eq(contacts.optedOut, true),
    ));
  return row?.count ?? 0;
}

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const { conditions } = buildListConditions(tenantId, req.query);
    const where = and(...conditions);

    const [[countRow], rows, tags, optedOutCount] = await Promise.all([
      db.select({ count: sql`count(*)::int` }).from(contacts).where(where),
      db.select().from(contacts)
        .where(where)
        .orderBy(contacts.createdAt)
        .limit(limit)
        .offset(offset),
      fetchContactTags(tenantId),
      fetchOptedOutCount(tenantId),
    ]);

    const total = countRow?.count ?? 0;

    res.json({
      items: rows.map(normalizeDoc),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      optedOutCount,
      tags,
    });
  } catch (err) {
    console.error('contacts get:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const { name, phone, tags } = req.body;
    const normalized = normalizePhoneForWhatsApp(phone);
    if (!normalized) {
      return res.status(400).json({ error: 'Telefone inválido ou vazio' });
    }
    const [contact] = await db.insert(contacts).values({
      tenantId,
      name,
      phone: normalized,
      tags: Array.isArray(tags) ? tags : [],
    }).returning();
    res.status(201).json(normalizeDoc(contact));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Contato com este número já existe' });
    }
    console.error('contacts post:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const { contacts: inputContacts } = req.body;
    if (!Array.isArray(inputContacts)) {
      return res.status(400).json({ error: 'contacts deve ser um array' });
    }
    const docsPayload = inputContacts
      .map((c) => {
        const phone = normalizePhoneForWhatsApp(c.phone);
        if (!phone) return null;
        return {
          tenantId,
          name: c.name,
          phone,
          tags: Array.isArray(c.tags) ? c.tags : [],
        };
      })
      .filter(Boolean);

    if (!docsPayload.length) {
      return res.status(201).json({ imported: 0 });
    }

    await db.insert(contacts).values(docsPayload).onConflictDoNothing();
    res.status(201).json({ imported: docsPayload.length });
  } catch (err) {
    console.error('contacts import:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const { name, phone, tags } = req.body;
    const update = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (phone !== undefined) {
      const normalized = normalizePhoneForWhatsApp(phone);
      if (!normalized) {
        return res.status(400).json({ error: 'Telefone inválido ou vazio' });
      }
      update.phone = normalized;
    }
    if (tags !== undefined) {
      update.tags = Array.isArray(tags) ? tags : [];
    }
    const [contact] = await db.update(contacts)
      .set(update)
      .where(and(eq(contacts.id, req.params.id), eq(contacts.tenantId, tenantId), eq(contacts.active, true)))
      .returning();
    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }
    res.json(normalizeDoc(contact));
  } catch (err) {
    console.error('contacts put:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const [contact] = await db.update(contacts)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(contacts.id, req.params.id), eq(contacts.tenantId, tenantId)))
      .returning();
    res.json(normalizeDoc(contact));
  } catch (err) {
    console.error('contacts delete:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/contacts/:id/consent
 * Body: { marketing?: bool, transactional?: bool, support?: bool, billing?: bool }
 * Atualiza só as categorias informadas.
 */
router.patch('/:id/consent', async (req, res) => {
  try {
    const { getPool } = require('../db');
    const tenantId = getTenantId(req);
    const allowed = ['marketing', 'transactional', 'support', 'billing'];
    const sets = [];
    const values = [];
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) {
        values.push(Boolean(req.body[k]));
        sets.push(`consent_${k} = $${values.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nenhuma categoria enviada' });
    sets.push(`consent_updated_at = now()`);
    sets.push(`updated_at = now()`);
    values.push(req.params.id, tenantId);
    const { rows } = await getPool().query(
      `UPDATE contacts SET ${sets.join(', ')}
       WHERE id = $${values.length - 1} AND tenant_id = $${values.length}
       RETURNING *`,
      values,
    );
    if (!rows[0]) return res.status(404).json({ error: 'Contato não encontrado' });
    res.json({ ...rows[0], _id: rows[0].id });
  } catch (err) {
    console.error('contacts consent:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/opt-out', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const [contact] = await db.update(contacts)
      .set({ optedOut: true, optedOutAt: new Date(), updatedAt: new Date() })
      .where(and(eq(contacts.id, req.params.id), eq(contacts.tenantId, tenantId)))
      .returning();
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
    res.json(normalizeDoc(contact));
  } catch (err) {
    console.error('contacts opt-out:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/opt-in', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const [contact] = await db.update(contacts)
      .set({ optedOut: false, optedOutAt: null, updatedAt: new Date() })
      .where(and(eq(contacts.id, req.params.id), eq(contacts.tenantId, tenantId)))
      .returning();
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
    res.json(normalizeDoc(contact));
  } catch (err) {
    console.error('contacts opt-in:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Importação inteligente (preview + apply com detecção de conflitos) ─── */

async function collectFromAgenda(client) {
  const waContacts = await client.getContacts().catch(() => []);
  return waContacts
    .filter((c) => !c.isGroup && c.number && (c.name || c.pushname))
    .map((c) => ({
      name: (c.name || c.pushname || c.number || '').trim(),
      phone: normalizePhoneForWhatsApp(c.number),
      origin: 'agenda',
    }))
    .filter((c) => c.phone && c.name);
}

async function collectFromChats(client) {
  const chats = await client.getChats().catch(() => []);
  const out = [];
  for (const chat of chats) {
    if (chat.isGroup) continue;
    try {
      const c = await chat.getContact();
      if (!c || !c.number) continue;
      const phone = normalizePhoneForWhatsApp(c.number);
      const name = (c.name || c.pushname || chat.name || c.number || '').trim();
      if (phone && name) out.push({ name, phone, origin: 'chats' });
    } catch (_) {}
  }
  return out;
}

/**
 * GET /api/contacts/import/preview?source=agenda|chats|both
 * Lista contatos do WhatsApp com diagnóstico de conflito vs base atual.
 * Não persiste nada — só prepara para o cliente revisar.
 */
router.get('/import/preview', requireWAConnected, async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const client = whatsapp.getClientFor(tenantId);
    if (!client) return res.status(423).json({ error: 'WhatsApp não conectado', code: 'WA_DISCONNECTED' });

    const source = ['agenda', 'chats', 'both'].includes(req.query.source) ? req.query.source : 'agenda';
    let raw = [];
    if (source === 'agenda' || source === 'both') raw = raw.concat(await collectFromAgenda(client));
    if (source === 'chats' || source === 'both') raw = raw.concat(await collectFromChats(client));

    // Dedup por phone, preferindo registros com origem 'agenda'
    const dedup = new Map();
    for (const item of raw) {
      const prev = dedup.get(item.phone);
      if (!prev || (prev.origin === 'chats' && item.origin === 'agenda')) {
        dedup.set(item.phone, item);
      }
    }

    const phones = [...dedup.keys()];
    if (!phones.length) {
      return res.json({ source, summary: { total: 0, new: 0, duplicates: 0, conflicts: 0 }, items: [] });
    }

    // Busca os contatos já cadastrados para esses telefones
    const existing = await db.select().from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), inArray(contacts.phone, phones)));
    const existingByPhone = new Map(existing.map((c) => [c.phone, c]));

    const items = [...dedup.values()].map((it) => {
      const exist = existingByPhone.get(it.phone);
      if (!exist) {
        return { ...it, status: 'new', defaultAction: 'create' };
      }
      const sameName = (exist.name || '').trim().toLowerCase() === it.name.trim().toLowerCase();
      if (!sameName) {
        return {
          ...it,
          status: 'conflict',
          defaultAction: 'skip',
          existing: { id: exist.id, name: exist.name, active: exist.active },
        };
      }
      return {
        ...it,
        status: 'duplicate',
        defaultAction: 'skip',
        existing: { id: exist.id, name: exist.name },
      };
    });

    res.json({
      source,
      summary: {
        total: items.length,
        new: items.filter((i) => i.status === 'new').length,
        duplicates: items.filter((i) => i.status === 'duplicate').length,
        conflicts: items.filter((i) => i.status === 'conflict').length,
      },
      items,
    });
  } catch (err) {
    console.error('contacts import preview:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/contacts/import/apply
 * Aplica decisões revisadas pelo cliente.
 * Body: { items: [{ phone, name, action: 'create'|'skip'|'overwrite_name' }] }
 */
router.post('/import/apply', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const inputItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!inputItems.length) {
      return res.status(400).json({ error: 'Nenhum contato enviado para importar' });
    }

    let created = 0, updated = 0, skipped = 0, errors = 0;

    for (const it of inputItems) {
      try {
        const phone = normalizePhoneForWhatsApp(it.phone);
        const name = (it.name || '').trim();
        const action = it.action || 'skip';

        if (!phone || !name || action === 'skip') { skipped++; continue; }

        if (action === 'create') {
          const inserted = await db.insert(contacts).values({
            tenantId, name, phone, tags: [],
          }).onConflictDoNothing().returning({ id: contacts.id });
          if (inserted.length) created++; else skipped++;
        } else if (action === 'overwrite_name') {
          const upd = await db.update(contacts)
            .set({ name, updatedAt: new Date() })
            .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, phone)))
            .returning({ id: contacts.id });
          if (upd.length) updated++; else skipped++;
        }
      } catch (e) {
        errors++;
      }
    }

    res.json({ created, updated, skipped, errors, total: inputItems.length });
  } catch (err) {
    console.error('contacts import apply:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ─── Compatibilidade com endpoint antigo (cria todos sem conflito) ─── */
router.post('/import-from-phone', requireWAConnected, async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    const client = whatsapp.getClientFor(tenantId);
    if (!client) return res.status(423).json({ error: 'WhatsApp não conectado', code: 'WA_DISCONNECTED' });

    const items = await collectFromAgenda(client);
    if (!items.length) return res.json({ imported: 0, message: 'Nenhum contato encontrado na agenda' });

    const values = items.map((c) => ({ tenantId, name: c.name, phone: c.phone, tags: [] }));
    await db.insert(contacts).values(values).onConflictDoNothing();
    res.json({ imported: values.length });
  } catch (err) {
    console.error('contacts import-from-phone:', err);
    res.status(500).json({ error: err.message });
  }
});

function normalizeDoc(c) {
  if (!c) return c;
  return { ...c, _id: c.id };
}

/**
 * GET /api/contacts/export — exporta todos os contatos do tenant como JSON.
 * Formato compatível com a importação (name + phone), com extras úteis.
 */
router.get('/export', async (req, res) => {
  try {
    const { getPool } = require('../db');
    const tenantId = getTenantId(req);
    const pool = getPool();

    const ts = formatStampBr();
    const filename = `contatos-${ts}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const { rows } = await pool.query(`
      SELECT json_agg(json_build_object(
        'name', name,
        'phone', phone,
        'tags', tags,
        'optedOut', opted_out,
        'createdAt', created_at
      ))::text AS payload
      FROM contacts
      WHERE tenant_id = $1
    `, [tenantId]);

    res.end(rows[0]?.payload || '[]');
  } catch (err) {
    console.error('contacts export:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
