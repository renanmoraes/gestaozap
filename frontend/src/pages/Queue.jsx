import React, { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, XCircle, CheckCircle2, AlertCircle, Loader2, Inbox, Pause, Play } from 'lucide-react';
import api from '../api';
import { formatDateTimeBr } from '../utils/timezone';
import { dialog } from '../utils/dialog';
import { apiErrorMessage, MSG } from '../utils/messages';

function fmtTs(ts) {
  if (ts == null) return '—';
  return formatDateTimeBr(ts, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function resultSummary(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.skippedForHours) return { text: 'Fora do horário', color: 'yellow' };
  if (r.cancelled) return { text: `Cancelado · ${r.sentCount ?? 0} enviados`, color: 'yellow' };
  const s = r.sentCount ?? 0, f = r.failedCount ?? 0;
  if (f > 0) return { text: `${s} enviados · ${f} falha(s)`, color: 'red' };
  if (s > 0) return { text: `${s} enviado(s)`, color: 'green' };
  return null;
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
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/queue/jobs');
      setJobs(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const cancel = async (id) => {
    setActing(id);
    try { await api.post(`/api/queue/jobs/${id}/cancel`); await load(); } finally { setActing(null); }
  };

  const retry = async (id) => {
    setActing(id);
    try {
      await api.post(`/api/queue/jobs/${id}/retry`);
      dialog.toast.success('Job reenfileirado para nova tentativa.');
      await load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.retryFailed));
    } finally { setActing(null); }
  };

  const pause = async (id) => {
    setActing(id);
    try { await api.post(`/api/queue/jobs/${id}/pause`); await load(); } finally { setActing(null); }
  };

  const resume = async (id) => {
    setActing(id);
    try { await api.post(`/api/queue/jobs/${id}/resume`); await load(); } finally { setActing(null); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Fila de envios</h1>
          <p className="text-sm text-slate-500 mt-0.5">{jobs.length} job(s) encontrado(s)</p>
        </div>
        <button onClick={load} className="btn-secondary">
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
                const res = resultSummary(job.result);
                return (
                  <div key={job.id} className="p-5 flex flex-col gap-3 border-b border-slate-100 last:border-b-0">
                    {/* Topo: nome da campanha + status badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {job.campaignName || `Job #${job.id}`}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Job #{job.id} · {fmtTs(job.timestamp)}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                        <StatusBadge state={job.state} paused={job.paused} />
                        {res && <span className={`badge-${res.color}`}>{res.text}</span>}
                      </div>
                    </div>

                    {/* Progresso — só quando active */}
                    {job.state === 'active' && job.progress != null && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2">
                            <div
                              className="bg-brand-600 h-2 rounded-full transition-all"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-brand-700 w-9 text-right shrink-0">
                            {job.progress}%
                          </span>
                        </div>
                        {job.contactsTotal > 0 && (
                          <p className="text-xs text-slate-400">
                            {Math.round((job.progress / 100) * job.contactsTotal)} de {job.contactsTotal} contatos enviados
                          </p>
                        )}
                      </div>
                    )}

                    {/* Ações */}
                    {(job.state === 'active' || job.state === 'waiting' || job.state === 'failed') && (
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
                        {(job.state === 'active' || job.state === 'waiting') && (
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
