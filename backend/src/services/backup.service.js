const fs = require('fs');
const path = require('path');
const { getPool } = require('../db');
const { getConfigInt } = require('../config/platform');

const BACKUP_DIR = path.join(__dirname, '../../backups');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

function getRetention() { return getConfigInt('backup_retention', 7); }
function getAutoHour() { return getConfigInt('backup_auto_hour', 3); }

// Compatibilidade com backup.routes.js
const RETENTION = 7;
const AUTO_HOUR = 3;
const BACKUP_VERSION = 2;
const NAME_RE = /^backup-[0-9A-Za-z._-]+\.json$/;

// Tabelas globais (admin-only backup) + tabelas com tenant_id
const GLOBAL_TABLES = ['tenants', 'platform_config', 'plans'];
const TENANT_TABLES = ['campaigns', 'contacts', 'send_logs', 'feedback_analyses'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function readUploads(imagePathSet = null) {
  if (!fs.existsSync(UPLOADS_DIR)) return [];
  return fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile())
    .filter((e) => !imagePathSet || imagePathSet.has(e.name))
    .map((e) => ({
      name: e.name,
      data: fs.readFileSync(path.join(UPLOADS_DIR, e.name)).toString('base64'),
    }));
}

/* ─── Backup admin (todos os dados) ─────────────────────────── */

async function createBackup(trigger = 'manual') {
  ensureDir(BACKUP_DIR);
  const pool = getPool();
  const client = await pool.connect();
  try {
    const collections = {};
    const counts = {};
    const allTables = [...GLOBAL_TABLES, ...TENANT_TABLES];
    for (const table of allTables) {
      const { rows } = await client.query(`SELECT * FROM ${table}`);
      collections[table] = rows;
      counts[table] = rows.length;
    }

    const uploads = readUploads();
    const payload = {
      meta: { app: 'gestaozap', version: BACKUP_VERSION, createdAt: new Date(), trigger, counts, uploadsCount: uploads.length, scope: 'admin' },
      collections,
      uploads,
    };

    const filename = `backup-${stamp()}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    applyRetention();

    const { size } = fs.statSync(filePath);
    return { name: filename, size, createdAt: payload.meta.createdAt, counts, uploadsCount: uploads.length, trigger };
  } finally {
    client.release();
  }
}

/* ─── Backup tenant (apenas dados deste tenant) ──────────────── */

async function createTenantBackup(tenantId, trigger = 'manual') {
  ensureDir(BACKUP_DIR);
  const pool = getPool();
  const client = await pool.connect();
  try {
    const collections = {};
    const counts = {};

    for (const table of TENANT_TABLES) {
      const { rows } = await client.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      collections[table] = rows;
      counts[table] = rows.length;
    }

    // Inclui só os uploads referenciados pelas campanhas deste tenant
    const imagePathSet = new Set(
      (collections.campaigns || [])
        .filter((c) => c.image_path)
        .map((c) => path.basename(String(c.image_path))),
    );
    const uploads = readUploads(imagePathSet.size > 0 ? imagePathSet : null);

    const payload = {
      meta: { app: 'gestaozap', version: BACKUP_VERSION, createdAt: new Date(), trigger, tenantId, counts, uploadsCount: uploads.length, scope: 'tenant' },
      collections,
      uploads,
    };

    const filename = `backup-${tenantId.slice(0, 8)}-${stamp()}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));

    // Retenção separada por tenant
    applyTenantRetention(tenantId);

    const { size } = fs.statSync(filePath);
    return { name: filename, size, createdAt: payload.meta.createdAt, counts, uploadsCount: uploads.length, trigger };
  } finally {
    client.release();
  }
}

/* ─── Restore admin ──────────────────────────────────────────── */

async function restoreBackup(name) {
  const filePath = resolveBackupFile(name);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const collections = payload.collections || {};

    const deleteOrder = ['feedback_analyses', 'send_logs', 'contacts', 'campaigns', 'platform_config', 'tenants'];
    for (const table of deleteOrder) {
      if (collections[table]) await client.query(`DELETE FROM ${table}`);
    }

    const insertOrder = ['tenants', 'campaigns', 'contacts', 'send_logs', 'feedback_analyses', 'platform_config'];
    const restored = {};
    for (const table of insertOrder) {
      const rows = Array.isArray(collections[table]) ? collections[table] : [];
      for (const row of rows) {
        const keys = Object.keys(row);
        if (!keys.length) continue;
        const cols = keys.join(', ');
        const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING`, keys.map((k) => row[k]));
      }
      restored[table] = rows.length;
    }

    await client.query('COMMIT');

    ensureDir(UPLOADS_DIR);
    let uploadsRestored = 0;
    for (const file of payload.uploads || []) {
      const safe = path.basename(String(file.name || ''));
      if (!safe) continue;
      fs.writeFileSync(path.join(UPLOADS_DIR, safe), Buffer.from(file.data, 'base64'));
      uploadsRestored++;
    }

    return { collections: restored, uploadsRestored };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ─── Restore tenant (apenas dados deste tenant) ──────────────── */

async function restoreTenantBackup(tenantId, name) {
  const filePath = resolveBackupFile(name);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Segurança: só restaura backup do mesmo tenant
  if (payload.meta?.tenantId && payload.meta.tenantId !== tenantId) {
    throw new Error('Backup não pertence a esta conta');
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const collections = payload.collections || {};

    // Deleta apenas dados deste tenant (não afeta outros)
    for (const table of ['feedback_analyses', 'send_logs', 'contacts', 'campaigns']) {
      if (collections[table]) {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
      }
    }

    const restored = {};
    for (const table of TENANT_TABLES) {
      const rows = Array.isArray(collections[table]) ? collections[table] : [];
      for (const row of rows) {
        const keys = Object.keys(row);
        if (!keys.length) continue;
        const cols = keys.join(', ');
        const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING`, keys.map((k) => row[k]));
      }
      restored[table] = rows.length;
    }

    await client.query('COMMIT');

    ensureDir(UPLOADS_DIR);
    let uploadsRestored = 0;
    for (const file of payload.uploads || []) {
      const safe = path.basename(String(file.name || ''));
      if (!safe) continue;
      fs.writeFileSync(path.join(UPLOADS_DIR, safe), Buffer.from(file.data, 'base64'));
      uploadsRestored++;
    }

    return { collections: restored, uploadsRestored };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ─── Listagem e remoção ──────────────────────────────────────── */

function listBackups(tenantId = null) {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const prefix = tenantId ? `backup-${tenantId.slice(0, 8)}-` : null;
  return fs.readdirSync(BACKUP_DIR)
    .filter((n) => NAME_RE.test(n) && (!prefix || n.startsWith(prefix)))
    .map((n) => {
      const st = fs.statSync(path.join(BACKUP_DIR, n));
      return { name: n, size: st.size, createdAt: st.mtime };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function applyRetention() {
  const all = listBackups();
  for (const b of all.slice(getRetention())) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch (_) {}
  }
}

function applyTenantRetention(tenantId) {
  const all = listBackups(tenantId);
  for (const b of all.slice(getRetention())) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch (_) {}
  }
}

function resolveBackupFile(name) {
  if (!NAME_RE.test(String(name || ''))) throw new Error('Nome de backup inválido');
  const filePath = path.join(BACKUP_DIR, name);
  if (path.dirname(filePath) !== BACKUP_DIR || !fs.existsSync(filePath)) throw new Error('Backup não encontrado');
  return filePath;
}

function deleteBackup(name) {
  const filePath = resolveBackupFile(name);
  fs.unlinkSync(filePath);
  return { deleted: name };
}

function msUntilNextHour(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function scheduleAutoBackup() {
  const run = async () => {
    try {
      const r = await createBackup('auto');
      console.log(`[backup] automático criado: ${r.name}`);
    } catch (err) {
      console.error('[backup] automático falhou:', err.message);
    } finally {
      setTimeout(run, msUntilNextHour(getAutoHour()));
    }
  };
  const autoHour = getAutoHour();
  setTimeout(run, msUntilNextHour(autoHour));
  console.log(`[backup] agendado: diário às ${autoHour}h, retenção ${getRetention()}`);
}

module.exports = {
  createBackup,
  createTenantBackup,
  listBackups,
  restoreBackup,
  restoreTenantBackup,
  deleteBackup,
  resolveBackupFile,
  scheduleAutoBackup,
  BACKUP_DIR,
  RETENTION,
  AUTO_HOUR,
};
