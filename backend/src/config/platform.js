const { getDb } = require('../db');
const { platformConfig } = require('../db/schema');

const _cache = new Map();
let _pollerTimer = null;

async function refreshConfig() {
  try {
    const db = getDb();
    const rows = await db.select({ key: platformConfig.key, value: platformConfig.value })
      .from(platformConfig);
    for (const row of rows) {
      _cache.set(row.key, row.value);
    }
  } catch (err) {
    console.error('[platform] falha ao recarregar config:', err.message);
  }
}

function getConfig(key, fallback = null) {
  const v = _cache.get(key);
  return v !== undefined ? v : fallback;
}

function getConfigInt(key, fallback) {
  const v = _cache.get(key);
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function startConfigPoller(intervalMs = 60_000) {
  refreshConfig();
  if (_pollerTimer) clearInterval(_pollerTimer);
  _pollerTimer = setInterval(refreshConfig, intervalMs);
  _pollerTimer.unref?.(); // não impede process.exit
  console.log('[platform] config poller iniciado (intervalo:', intervalMs / 1000, 's)');
}

module.exports = { getConfig, getConfigInt, refreshConfig, startConfigPoller };
