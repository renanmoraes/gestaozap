const router = require('express').Router();
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const requireFeature = require('../middleware/requireFeature');
const {
  listTenantRules,
  createRule,
  updateRule,
  deleteRule,
  getContactIntents,
  createSupportRequest,
  ensureTenantRules,
} = require('../services/intent.service');

const gate = requireFeature('intencoes');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

router.use(gate);

// Lista regras do tenant (provisiona padrões na primeira visita, se faltarem).
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const tenantId = getTenantId(req);
    let rows = await listTenantRules(db, tenantId);
    if (!rows.length) {
      await ensureTenantRules(tenantId);
      rows = await listTenantRules(db, tenantId);
    }
    res.json(rows);
  } catch (err) {
    console.error('[intent-rules] list:', err.message);
    res.status(500).json({ error: 'Erro ao listar intenções' });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const row = await createRule(db, getTenantId(req), req.body || {});
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const row = await updateRule(db, getTenantId(req), req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Intenção não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const ok = await deleteRule(db, getTenantId(req), req.params.id);
    if (!ok) return res.status(404).json({ error: 'Intenção não encontrada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Intenções/tags de um contato (para a UI de contato/conversa).
router.get('/contact/:contactId', async (req, res) => {
  try {
    const db = getDb();
    const data = await getContactIntents(db, getTenantId(req), req.params.contactId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar intenções do contato' });
  }
});

// Reprocessar histórico interno de intenções (Bull). window: 7d|30d|90d|all
router.post('/reprocess', async (req, res) => {
  try {
    const { enqueueReprocess, WINDOW_DAYS } = require('../services/intent-history.service');
    const window = String(req.body?.window || '30d');
    if (!(window in WINDOW_DAYS)) {
      return res.status(400).json({ error: 'Janela inválida. Use 7d, 30d, 90d ou all.' });
    }
    const io = req.app.get('io');
    const job = await enqueueReprocess(io, getTenantId(req), window);
    res.status(202).json({ ok: true, jobId: String(job.id), window });
  } catch (err) {
    console.error('[intent-rules] reprocess:', err.message);
    res.status(500).json({ error: 'Erro ao iniciar reprocessamento' });
  }
});

// Pedido de apoio ao suporte para criação de regras.
router.post('/support-request', async (req, res) => {
  try {
    const db = getDb();
    const row = await createSupportRequest(db, getTenantId(req), req.body?.note);
    res.status(201).json(row || { ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
