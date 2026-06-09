import { useCallback } from 'react';
import { useSocket } from './useSocket';

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

function jobSortPriority(job) {
  if (job.state === 'active' && !job.paused) return 0;
  if (job.state === 'active' && job.paused) return 1;
  if (job.state === 'delayed') return 2;
  if (job.state === 'waiting') return 3;
  if (job.state === 'failed') return 4;
  if (job.state === 'completed') return 5;
  return 6;
}

/** Jobs em execução no topo; dentro do grupo, mais recente primeiro. */
export function sortQueueJobs(jobs) {
  if (!Array.isArray(jobs)) return [];
  return [...jobs].sort((a, b) => {
    const pa = jobSortPriority(a);
    const pb = jobSortPriority(b);
    if (pa !== pb) return pa - pb;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/** Patch incremental de um job na lista (sem refetch). */
export function patchJob(jobs, update) {
  const jobId = String(update.jobId);
  const idx = jobs.findIndex((j) => String(j.id) === jobId);
  if (idx < 0) {
    if (update.type === 'progress' || update.type === 'done') {
      const created = {
        id: jobId,
        state: update.state || 'active',
        paused: Boolean(update.paused),
        campaignId: update.campaignId,
        campaignName: null,
        contactsTotal: update.total ?? 0,
        progress: update.progress ?? 0,
        createdAt: Date.now(),
        processedOn: Date.now(),
        finishedOn: update.type === 'done' ? Date.now() : null,
        failedReason: null,
        result: update.type === 'done' ? {
          sentCount: update.sentCount,
          failedCount: update.failedCount,
          cancelled: update.cancelled,
        } : null,
      };
      return sortQueueJobs([created, ...jobs]);
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
      rescheduled: update.rescheduled ?? cur.result?.rescheduled,
      resumesAt: update.resumesAt ?? cur.result?.resumesAt,
    };
  }
  if (update.state) next.state = update.state;
  if (update.paused != null) next.paused = update.paused;
  if (update.resumesAt) next.resumesAt = update.resumesAt;
  if (update.type === 'done') {
    next.finishedOn = Date.now();
    next.progress = update.progress ?? 100;
    next.result = {
      sentCount: update.sentCount ?? 0,
      failedCount: update.failedCount ?? 0,
      cancelled: Boolean(update.cancelled),
      rescheduled: Boolean(update.rescheduled),
      resumesAt: update.resumesAt ?? null,
    };
    if (update.rescheduled) {
      next.state = 'delayed';
      next.resumesAt = update.resumesAt ?? next.resumesAt;
    } else if (update.state) {
      next.state = update.state;
    } else if (update.cancelled) {
      next.state = 'completed';
    } else {
      next.state = 'completed';
    }
  }
  if (update.type === 'paused' && update.reason === 'outside_hours') {
    next.state = 'delayed';
    next.paused = true;
    if (update.resumesAt) next.resumesAt = update.resumesAt;
  }
  if (update.type === 'cancelling') {
    next.state = 'active';
    next.result = { ...(next.result || {}), cancelled: true };
  }
  const out = [...jobs];
  out[idx] = next;
  return sortQueueJobs(out);
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
