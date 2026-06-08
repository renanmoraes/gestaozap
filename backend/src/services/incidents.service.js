/**
 * Sistema de eventos críticos.
 * Registra em system_events + emite via Socket.IO + métricas.
 *
 * Tipos esperados (kind):
 *   wa_ready          (info)
 *   wa_disconnected   (warning)
 *   wa_auth_failure   (critical)
 *   wrong_phone       (warning)
 *   quality_gate      (warning)
 *   kill_switch       (warning)
 *   dlq_spike         (warning)  — auto-detectado quando muitos DLQs em curto prazo
 *   policy_violation  (critical)
 *
 * Severidades: info | warning | critical
 */

const { getPool } = require('../db');
const metrics = require('./metrics.service');

const DLQ_SPIKE_THRESHOLD = 10;   // 10 DLQs
const DLQ_SPIKE_WINDOW_SEC = 300; // em 5 minutos
const dlqCounters = new Map();    // tenantId → [{ at }]

async function record(tenantId, io, kind, severity = 'info', payload = {}) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO system_events (tenant_id, kind, severity, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING id, kind, severity, payload, created_at`,
      [tenantId || null, kind, severity, JSON.stringify(payload || {})],
    );
    const event = rows[0];

    // Emite via Socket.IO para o tenant e para a sala 'admin' (todos os admins veem tudo)
    if (io) {
      io.to(tenantId).emit('incident', event);
      io.to('admin').emit('admin:incident', { ...event, tenantId });
    }

    metrics.recordIncident(tenantId, kind, severity);

    // Log local — útil para captura por agregador de logs
    console.log(`[incident] tenant=${tenantId} kind=${kind} severity=${severity}`);

    return event;
  } catch (err) {
    console.warn('[incidents] record falhou:', err.message);
    return null;
  }
}

/**
 * Conta DLQ para detectar spike automático.
 * Chamado pelo processor quando uma msg cai em DLQ.
 */
function bumpDlqCounter(tenantId, io, reason) {
  const now = Date.now();
  const list = dlqCounters.get(tenantId) || [];
  const filtered = list.filter((e) => (now - e.at) / 1000 < DLQ_SPIKE_WINDOW_SEC);
  filtered.push({ at: now, reason });
  dlqCounters.set(tenantId, filtered);

  if (filtered.length >= DLQ_SPIKE_THRESHOLD) {
    // Dispara incidente apenas uma vez por janela
    const lastSpike = dlqCounters.get(`${tenantId}:lastSpike`) || 0;
    if (now - lastSpike > DLQ_SPIKE_WINDOW_SEC * 1000) {
      dlqCounters.set(`${tenantId}:lastSpike`, now);
      record(tenantId, io, 'dlq_spike', 'warning', {
        count: filtered.length,
        windowSec: DLQ_SPIKE_WINDOW_SEC,
        topReasons: topReasons(filtered),
      });
    }
  }
}

function topReasons(events) {
  const counts = {};
  for (const e of events) counts[e.reason] = (counts[e.reason] || 0) + 1;
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([reason, n]) => ({ reason, n }));
}

async function list(tenantId = null, { limit = 50, severity = null, unresolvedOnly = false } = {}) {
  const pool = getPool();
  const params = [];
  const conds = [];
  if (tenantId) { params.push(tenantId); conds.push(`tenant_id = $${params.length}`); }
  if (severity) { params.push(severity); conds.push(`severity = $${params.length}`); }
  if (unresolvedOnly) conds.push('resolved = false');

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT id, tenant_id, kind, severity, payload, resolved, resolved_at, created_at
     FROM system_events ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}

async function resolve(eventId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE system_events SET resolved = true, resolved_at = now()
     WHERE id = $1 RETURNING *`,
    [eventId],
  );
  return rows[0] || null;
}

module.exports = { record, bumpDlqCounter, list, resolve };
