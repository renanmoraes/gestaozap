/**
 * Eventos socket unificados para Fila, Histórico e tela de Envio.
 * Payload compacto — o cliente faz patch local sem refetch completo.
 */

function emitQueueUpdate(io, tenantId, payload) {
  if (!io || !tenantId) return;
  io.to(tenantId).emit('queue:update', payload);
}

function emitProgress(io, tenantId, legacy, extra = {}) {
  if (!io || !tenantId) return;
  const total = legacy.total ?? 0;
  const index = legacy.index ?? 0;
  const progress = total > 0 ? Math.round((index / total) * 100) : 0;
  io.to(tenantId).emit('send:progress', legacy);
  emitQueueUpdate(io, tenantId, {
    type: 'progress',
    jobId: String(legacy.jobId),
    campaignId: legacy.campaignId ? String(legacy.campaignId) : null,
    runId: String(extra.runId || legacy.jobId),
    sentCount: legacy.sentCount ?? 0,
    failedCount: extra.failedCount ?? 0,
    total,
    progress,
    index,
    state: 'active',
    paused: false,
    recipient: legacy.phone
      ? { phone: legacy.phone, status: legacy.status, error: legacy.error ?? null }
      : null,
  });
}

function emitJobState(io, tenantId, payload) {
  if (!io || !tenantId) return;
  emitQueueUpdate(io, tenantId, payload);
  const base = {
    campaignId: payload.campaignId,
    jobId: payload.jobId,
    sentCount: payload.sentCount,
    failedCount: payload.failedCount,
    total: payload.total,
  };
  if (payload.type === 'done') {
    io.to(tenantId).emit('send:done', {
      ...base,
      cancelled: Boolean(payload.cancelled),
      rescheduled: Boolean(payload.rescheduled),
      resumesAt: payload.resumesAt,
    });
  } else if (payload.type === 'cancelled') {
    io.to(tenantId).emit('send:cancelled', base);
  } else if (payload.type === 'paused') {
    io.to(tenantId).emit('send:paused', { ...base, reason: payload.reason, resumesAt: payload.resumesAt });
  } else if (payload.type === 'resumed') {
    io.to(tenantId).emit('send:resumed', base);
  }
}

module.exports = { emitProgress, emitJobState, emitQueueUpdate };
