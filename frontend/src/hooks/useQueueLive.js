import { useCallback } from 'react';
import { useSocket } from './useSocket';

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

/** Patch incremental de um job na lista (sem refetch). */
export function patchJob(jobs, update) {
  const jobId = String(update.jobId);
  const idx = jobs.findIndex((j) => String(j.id) === jobId);
  if (idx < 0) {
    if (update.type === 'progress' || update.type === 'done') {
      return [{
        id: jobId,
        state: update.state || 'active',
        paused: Boolean(update.paused),
        campaignId: update.campaignId,
        campaignName: null,
        contactsTotal: update.total ?? 0,
        progress: update.progress ?? 0,
        createdAt: Date.now(),
        result: update.type === 'done' ? {
          sentCount: update.sentCount,
          failedCount: update.failedCount,
          cancelled: update.cancelled,
        } : null,
      }, ...jobs];
    }
    return jobs;
  }
  const cur = jobs[idx];
  const next = { ...cur };
  if (update.progress != null) next.progress = update.progress;
  if (update.sentCount != null || update.failedCount != null) {
    next.result = {
      ...(cur.result || {}),
      sentCount: update.sentCount ?? cur.result?.sentCount,
      failedCount: update.failedCount ?? cur.result?.failedCount,
      cancelled: update.cancelled ?? cur.result?.cancelled,
    };
  }
  if (update.state) next.state = update.state;
  if (update.paused != null) next.paused = update.paused;
  if (update.type === 'done') {
    next.state = update.cancelled ? 'completed' : (next.state === 'active' ? 'completed' : next.state);
    next.progress = update.progress ?? 100;
    next.result = {
      sentCount: update.sentCount ?? 0,
      failedCount: update.failedCount ?? 0,
      cancelled: Boolean(update.cancelled),
    };
  }
  if (update.type === 'cancelling') {
    next.state = 'active';
    next.result = { ...(next.result || {}), cancelled: true };
  }
  const out = [...jobs];
  out[idx] = next;
  return out;
}

/** Patch de um destinatário na lista do histórico. */
export function patchRecipientRows(rows, recipient) {
  if (!recipient?.phone || !Array.isArray(rows)) return rows;
  const key = normalizePhone(recipient.phone);
  let changed = false;
  const out = rows.map((row) => {
    if (normalizePhone(row.phone) !== key) return row;
    changed = true;
    return {
      ...row,
      status: recipient.status || row.status,
      error: recipient.error ?? row.error,
    };
  });
  return changed ? out : rows;
}

/**
 * Socket ao vivo para Fila e Histórico — substitui polling agressivo.
 */
export function useQueueLive({ tenantId, onJobUpdate, onRecipientUpdate }) {
  const handleUpdate = useCallback((payload) => {
    if (!payload?.jobId) return;
    onJobUpdate?.(payload);
    if (payload.recipient && onRecipientUpdate) {
      onRecipientUpdate(payload);
    }
  }, [onJobUpdate, onRecipientUpdate]);

  useSocket({ 'queue:update': handleUpdate }, tenantId);
}
