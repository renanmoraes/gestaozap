import React, { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, XCircle, CheckCircle2, AlertCircle, Loader2, Inbox, Pause, Play } from 'lucide-react';
import { estimateCampaignDuration } from '../utils/sendEstimate';
import api from '../api';
import { formatDateTimeBr } from '../utils/timezone';
import { formatDuration } from '../utils/duration';
import { dialog } from '../utils/dialog';
import { apiErrorMessage, MSG } from '../utils/messages';
import { useTenant } from '../context/TenantContext';
import { useQueueLive, patchJob, sortQueueJobs } from '../hooks/useQueueLive';

const POLL_INTERVAL_MS = 20_000;
const TICK_INTERVAL_MS = 30_000;

function fmtTs(ts) {
  if (ts == null) return '—';
  return formatDateTimeBr(ts, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function humanizeFailedReason(reason) {
  if (!reason) return null;
  const s = String(reason).toLowerCase();
  if (s.includes('stalled')) return 'Job interrompido por timeout interno da fila — use Retentar para continuar.';
  if (s.includes('cancel')) return 'Cancelado pelo usuário.';
  return String(reason);
}

function JobResultBadges({ result }) {
  if (!result || typeof result !== 'object') return null;
  if (result.skippedForHours) {
    return <span className="badge-yellow">Fora do horário</span>;
  }
  const sent = result.sentCount ?? 0;
  const failed = result.failedCount ?? 0;
  const cancelled = result.cancelled;
  const rescheduled = result.rescheduled;
  return (
    <div className="flex flex-wrap gap-1.5 justify-end">
      {sent > 0 && (
        <span className="badge-green">
          <CheckCircle2 className="w-3 h-3" />
          {sent} enviado{sent !== 1 ? 's' : ''}
        </span>
      )}
      {failed > 0 && (
        <span className="badge-red">
          <AlertCircle className="w-3 h-3" />
          {failed} falha{failed !== 1 ? 's' : ''}
        </span>
      )}
      {cancelled && (
        <span className="badge-yellow">Cancelado</span>
      )}
      {rescheduled && (
        <span className="badge-yellow">Agendado para retomar</span>
      )}
    </div>
  );
}

function JobTimingMeta({ job, now }) {
  const startTs = job.processedOn || job.createdAt;
  const endTs = job.finishedOn;
  const isRunning = job.state === 'active' || job.state === 'waiting';
  const isDelayed = job.state === 'delayed';
  const isDone = job.state === 'completed' || job.state === 'failed';

  const runningMs = startTs && (isRunning || isDelayed)
    ? now - (typeof startTs === 'number' ? startTs : new Date(startTs).getTime())
    : null;
  const totalMs = startTs && endTs
    ? (typeof endTs === 'number' ? endTs : new Date(endTs).getTime())
      - (typeof startTs === 'number' ? startTs : new Date(startTs).getTime())
    : null;

  return (
    <div className="text-xs text-slate-500 space-y-0.5">
      <p>
        <span className="text-slate-400">Início:</span>{' '}
        {fmtTs(startTs)}
      </p>
      {isRunning && runningMs != null && runningMs >= 0 && (
        <p>
          <span className="text-slate-400">Rodando há:</span>{' '}
          <span className="font-medium text-slate-700">{formatDuration(runningMs)}</span>
        </p>
      )}
      {isDelayed && job.resumesAt && (
        <p>
          <span className="text-slate-400">Retoma em:</span>{' '}
          <span className="font-medium text-amber-700">{fmtTs(job.resumesAt)}</span>
        </p>
      )}
      {isDone && endTs && (
        <p>
          <span className="text-slate-400">Finalizado em:</span>{' '}
          {fmtTs(endTs)}
        </p>
      )}
      {isDone && totalMs != null && totalMs >= 0 && (
        <p>
          <span className="text-slate-400">Duração:</span>{' '}
          {formatDuration(totalMs)}
        </p>
      )}
      {job.state === 'failed' && job.failedReason && (
        <p className="text-red-600">
          <span className="text-red-400">Motivo:</span>{' '}
          {humanizeFailedReason(job.failedReason)}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ state, paused }) {
  if (paused) {
    return (
      <span className="badge-yellow">
        <Pause className="w-3 h-3" />
        Pausado
      </span>
    );
  }
  const map = {
    completed: { label: 'Concluído', cls: 'badge-green', Icon: CheckCircle2 },
    active: { label: 'Em andamento', cls: 'badge-blue', Icon: Loader2 },
    waiting: { label: 'Aguardando', cls: 'badge-yellow', Icon: Clock },
    failed: { label: 'Falhou', cls: 'badge-red', Icon: AlertCircle },
    delayed: { label: 'Agendado', cls: 'badge-gray', Icon: Clock },
  };
  const { label, cls, Icon } = map[state] || { label: state, cls: 'badge-gray', Icon: Clock };
  return (
    <span className={cls}>
      <Icon className={`w-3 h-3 ${state === 'active' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

export default function Queue() {
  const { tenant } = useTenant();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [sendConfig, setSendConfig] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/api/queue/jobs');
      setJobs(sortQueueJobs(res.data));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tenant?.id) return;
    load();
  }, [load, tenant?.id]);

  useEffect(() => {
    api.get('/api/send/config').then((r) => setSendConfig(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tenant?.id) return undefined;
    const poll = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [load, tenant?.id]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && tenant?.id) load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, tenant?.id]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(tick);
  }, []);

  const handleLiveJob = useCallback((update) => {
    setJobs((prev) => patchJob(prev, update));
  }, []);

  useQueueLive({ tenantId: tenant?.id, onJobUpdate: handleLiveJob });

  const cancel = async (id) => {
    setActing(id);
    try {
      await api.post(`/api/queue/jobs/${id}/cancel`);
      await load(true);
    } finally {
      setActing(null);
    }
  };

  const retry = async (id) => {
    setActing(id);
    try {
      await api.post(`/api/queue/jobs/${id}/retry`);
      dialog.toast.success('Job reenfileirado para nova tentativa.');
      await load(true);
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.retryFailed));
    } finally {
      setActing(null);
    }
  };

  const pause = async (id) => {
    setActing(id);
    try {
      await api.post(`/api/queue/jobs/${id}/pause`);
      setJobs((prev) => patchJob(prev, { type: 'paused', jobId: id, paused: true, state: 'active' }));
    } finally {
      setActing(null);
    }
  };

  const resume = async (id) => {
    setActing(id);
    try {
      await api.post(`/api/queue/jobs/${id}/resume`);
      setJobs((prev) => patchJob(prev, { type: 'resumed', jobId: id, paused: false, state: 'active' }));
    } finally {
      setActing(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Fila de envios</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {jobs.length} job(s) · atualização automática a cada 20s
          </p>
        </div>
        <button onClick={() => load()} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />Atualizar
        </button>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando…
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Inbox className="w-8 h-8 mb-2" />
            <p className="text-sm">Nenhum job na fila</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div>
              {jobs.map((job) => {
                const liveSent = job.result?.sentCount ?? 0;
                const liveFailed = job.result?.failedCount ?? 0;
                const showProgress = (job.state === 'active' || job.state === 'delayed') && job.progress != null;
                return (
                  <div key={job.id} className="p-5 flex flex-col gap-3 border-b border-slate-100 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {job.campaignName || `Job #${job.id}`}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Job #{job.id}
                        </p>
                        <div className="mt-2">
                          <JobTimingMeta job={job} now={now} />
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <StatusBadge state={job.state} paused={job.paused} />
                        <JobResultBadges result={job.result} />
                      </div>
                    </div>

                    {showProgress && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div
                              className="bg-brand-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, job.progress)}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-brand-700 w-9 text-right shrink-0">
                            {job.progress}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {liveSent > 0 && (
                            <span className="text-emerald-600 font-medium">{liveSent} enviados</span>
                          )}
                          {liveSent > 0 && liveFailed > 0 && ' · '}
                          {liveFailed > 0 && (
                            <span className="text-red-600 font-medium">{liveFailed} falha(s)</span>
                          )}
                          {job.contactsTotal > 0 && (
                            <span>
                              {(liveSent > 0 || liveFailed > 0) ? ' · ' : ''}
                              {job.contactsTotal} contatos
                            </span>
                          )}
                        </p>
                        {sendConfig && job.contactsTotal > 0 && (() => {
                          const remaining = job.contactsTotal - (job.result?.sentCount ?? 0);
                          const { contactsPerDay, days } = estimateCampaignDuration(remaining, sendConfig, 1);
                          const daysLabel = days < 1 ? `~${Math.ceil(days * 24)}h` : `~${Math.ceil(days)} dias`;
                          return (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" />
                              {remaining.toLocaleString('pt-BR')} restantes · conclusão estimada:{' '}
                              <span className="font-medium text-slate-600">{daysLabel}</span>
                              &nbsp;({contactsPerDay.toLocaleString('pt-BR')}/dia)
                            </p>
                          );
                        })()}
                      </div>
                    )}

                    {(job.state === 'active' || job.state === 'waiting' || job.state === 'failed' || job.state === 'delayed') && (
                      <div className="flex gap-2 justify-end">
                        {job.state === 'active' && !job.paused && (
                          <button
                            onClick={() => pause(job.id)}
                            disabled={acting === job.id}
                            className="btn-secondary py-1.5 px-3 text-xs"
                          >
                            {acting === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                            Pausar
                          </button>
                        )}
                        {job.state === 'active' && job.paused && (
                          <button
                            onClick={() => resume(job.id)}
                            disabled={acting === job.id}
                            className="btn-primary py-1.5 px-3 text-xs"
                          >
                            {acting === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            Retomar
                          </button>
                        )}
                        {(job.state === 'active' || job.state === 'waiting' || job.state === 'delayed') && (
                          <button
                            onClick={() => cancel(job.id)}
                            disabled={acting === job.id}
                            className="btn-danger py-1.5 px-3 text-xs"
                          >
                            {acting === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Cancelar
                          </button>
                        )}
                        {job.state === 'failed' && (
                          <button
                            onClick={() => retry(job.id)}
                            disabled={acting === job.id}
                            className="btn-secondary py-1.5 px-3 text-xs"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />Retentar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
