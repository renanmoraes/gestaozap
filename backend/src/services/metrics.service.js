/**
 * Coletor de métricas Prometheus in-memory.
 * Suporta counters, gauges e histogramas simples com labels.
 *
 * Nomes seguem convenção Prometheus: snake_case + sufixo semântico
 * (_total para counters, _seconds para histograms de tempo).
 *
 * Endpoint: GET /api/metrics (admin-only) → formato exposition text/plain
 */

const counters = new Map(); // name → Map<labelKey, value>
const gauges = new Map();   // name → Map<labelKey, value>

function labelKey(labels) {
  if (!labels) return '';
  return Object.keys(labels).sort().map((k) => `${k}="${escape(labels[k])}"`).join(',');
}

function escape(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Incrementa counter. Counters só vão para cima.
 */
function inc(name, labels = null, by = 1) {
  if (!counters.has(name)) counters.set(name, new Map());
  const series = counters.get(name);
  const key = labelKey(labels);
  series.set(key, (series.get(key) || 0) + by);
}

/**
 * Define valor absoluto de gauge.
 */
function set(name, value, labels = null) {
  if (!gauges.has(name)) gauges.set(name, new Map());
  gauges.get(name).set(labelKey(labels), Number(value) || 0);
}

/**
 * Render formato Prometheus exposition.
 */
function render() {
  const lines = [];

  // Counters
  for (const [name, series] of counters) {
    lines.push(`# TYPE ${name} counter`);
    for (const [key, value] of series) {
      lines.push(key ? `${name}{${key}} ${value}` : `${name} ${value}`);
    }
  }

  // Gauges
  for (const [name, series] of gauges) {
    lines.push(`# TYPE ${name} gauge`);
    for (const [key, value] of series) {
      lines.push(key ? `${name}{${key}} ${value}` : `${name} ${value}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Coleta gauges dinâmicas que precisam ser calculadas no momento do scrape.
 * Chamada antes do render().
 */
async function collectDynamic() {
  try {
    const { getDb } = require('../db');
    const { sql } = require('drizzle-orm');
    const db = getDb();

    // gestaozap_send_logs_by_status — quantos send_logs por status (todos tenants)
    const rows = await db.execute(sql`
      SELECT status, COUNT(*)::bigint AS n
      FROM send_logs
      WHERE created_at > now() - interval '24 hours'
      GROUP BY status
    `).then((r) => r.rows);

    for (const r of rows) {
      set('gestaozap_send_logs_last_24h', Number(r.n), { status: r.status });
    }

    // gestaozap_active_tenants
    const at = await db.execute(sql`SELECT COUNT(*)::int AS n FROM tenants WHERE active = true`).then((r) => r.rows[0]);
    set('gestaozap_active_tenants', at?.n || 0);

    // gestaozap_active_contracts
    const ac = await db.execute(sql`SELECT COUNT(*)::int AS n FROM contracts WHERE status = 'active'`).then((r) => r.rows[0]);
    set('gestaozap_active_contracts', ac?.n || 0);

    // Tenant clients em memória (sessões wwebjs vivas)
    try {
      const whatsapp = require('./whatsapp.service');
      // Não temos um getter pro Map. Vamos contar via DB (whatsapp_sessions ativas)
      const wa = await db.execute(sql`
        SELECT status, COUNT(*)::int AS n FROM whatsapp_sessions GROUP BY status
      `).then((r) => r.rows);
      for (const r of wa) {
        set('gestaozap_wa_sessions', r.n, { status: r.status });
      }
    } catch (_) {}
  } catch (e) {
    console.warn('[metrics] collectDynamic:', e.message);
  }
}

/**
 * Helper que mescla bem com o guard.recordAckResult — chame de lá quando registrar ACK
 */
function recordSendOutcome(tenantId, outcome) {
  // outcome: 'sent' | 'failed' | 'dlq' | 'retry' | 'skipped'
  inc('gestaozap_send_attempts_total', { tenant: tenantId, outcome });
}

function recordAck(tenantId, ack) {
  inc('gestaozap_send_ack_total', { tenant: tenantId, ack: String(ack) });
}

function recordClientEvent(tenantId, event) {
  // event: 'authenticated' | 'ready' | 'auth_failure' | 'disconnected'
  inc(`gestaozap_client_${event}_total`, { tenant: tenantId });
}

function recordRetry(tenantId, attempt, reason) {
  inc('gestaozap_retry_scheduled_total', { tenant: tenantId, attempt: String(attempt), reason });
}

function recordDlq(tenantId, reason) {
  inc('gestaozap_dlq_messages_total', { tenant: tenantId, reason });
}

function recordDedupeHit(tenantId, kind) {
  // kind: 'recipient_24h' | 'idempotency'
  inc('gestaozap_dedupe_hits_total', { tenant: tenantId, kind });
}

function recordIncident(tenantId, kind, severity = 'warning') {
  inc('gestaozap_incidents_total', { tenant: tenantId, kind, severity });
}

module.exports = {
  inc,
  set,
  render,
  collectDynamic,
  recordSendOutcome,
  recordAck,
  recordClientEvent,
  recordRetry,
  recordDlq,
  recordDedupeHit,
  recordIncident,
};
