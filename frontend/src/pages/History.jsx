import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../api';
import { RefreshCw, Loader2 } from 'lucide-react';
import {
  DEFAULT_HOUR_START,
  DEFAULT_HOUR_END,
  getCurrentHourBr,
  isOutsideRecommendedHours,
  confirmSendOutsideHours,
} from '../utils/hours';
import { formatDateTimeBr } from '../utils/timezone';
import { dialog } from '../utils/dialog';
import { apiErrorMessage, MSG } from '../utils/messages';

async function buildHoursPayload() {
  const hourStart = DEFAULT_HOUR_START;
  const hourEnd = DEFAULT_HOUR_END;
  const h = getCurrentHourBr();
  let ignoreHours = false;
  if (isOutsideRecommendedHours(h, hourStart, hourEnd)) {
    if (!(await confirmSendOutsideHours(hourStart, hourEnd))) return null;
    ignoreHours = true;
  }
  return { hourStart, hourEnd, ignoreHours };
}

function normalizeCampaignId(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object') {
    if (raw.$oid) return String(raw.$oid);
    if (raw._id != null) return String(raw._id);
    return '';
  }
  return String(raw).trim();
}

function runKey(campaignId, runId) {
  return `${normalizeCampaignId(campaignId)}:${String(runId)}`;
}

function fmtDateTime(date) {
  if (date == null) return '—';
  return formatDateTimeBr(date, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusLabel(status) {
  if (status === 'sent') return 'Enviado';
  if (status === 'failed') return 'Falhou';
  if (status === 'pending') return 'Pendente';
  if (status === 'unknown') return 'Sem registro';
  return 'Pendente';
}

function SentimentPieChart({ positive, negative, neutral, size = 148 }) {
  const total = positive + negative + neutral;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-sm text-gray-400 border border-dashed rounded-lg bg-gray-50">
        Sem respostas classificadas
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 5;
  let angleDeg = -90;

  const segments = [
    { value: positive, color: '#16a34a', label: 'Positivas' },
    { value: negative, color: '#dc2626', label: 'Negativas' },
    { value: neutral, color: '#9ca3af', label: 'Neutras' },
  ];

  const polar = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const paths = [];
  segments.forEach(({ value, color }) => {
    if (value <= 0) return;
    const sweep = (value / total) * 360;
    const start = polar(angleDeg);
    const end = polar(angleDeg + sweep);
    const largeArc = sweep > 180 ? 1 : 0;
    const d = [
      `M ${cx} ${cy}`,
      `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
      'Z',
    ].join(' ');
    paths.push(<path key={color} d={d} fill={color} stroke="#fff" strokeWidth="1.5" />);
    angleDeg += sweep;
  });

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
        {paths}
      </svg>
      <ul className="text-sm space-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-700">
              {s.label}: <b>{s.value}</b>{' '}
              <span className="text-gray-400">({Math.round((s.value / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function matchesSelection(sel, campaignId, runId) {
  return normalizeCampaignId(sel.campaignId) === normalizeCampaignId(campaignId)
    && String(sel.runId) === String(runId);
}

function DocIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden>
      <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
      <path d="M12.971 1.816A5.25 5.25 0 0118 7.068v4.993a.75.75 0 01-.75.75h-4.5A5.25 5.25 0 0112.971 1.816z" />
    </svg>
  );
}

export default function History() {
  const [jobs, setJobs] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [logsByRun, setLogsByRun] = useState({});
  /** Por job (runKey): true enquanto GET /logs/:campaignId?runId= está em voo */
  const [logsLoadingByKey, setLogsLoadingByKey] = useState({});
  const [logsFetchErrorByKey, setLogsFetchErrorByKey] = useState({});
  const [analysisByRun, setAnalysisByRun] = useState({});
  const [analyzingKey, setAnalyzingKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const logsReqSeq = useRef(0);
  /** Log da linha com falha — mostra campo `error` para ajustar template / WhatsApp */
  const [failureModal, setFailureModal] = useState(null);

  /** Igual à Fila: um card por Job ID na fila Redis/Bull — sem legacy por contato. */
  const sidebarItems = useMemo(() => jobs
    .filter((j) => j.campaignId)
    .map((j) => ({
      key: `job-${j.id}`,
      sortTs: j.createdAt || 0,
      job: j,
    }))
    .sort((a, b) => b.sortTs - a.sortTs), [jobs]);

  const loadHistoryIndex = async () => {
    setLoading(true);
    try {
      const { data: jobList } = await api.get('/api/queue/jobs');
      setJobs(jobList);
      const valid = jobList.filter((j) => j.campaignId);
      setSelectedRun((prev) => {
        if (valid.length === 0) return null;
        const pickFirst = () => ({
          campaignId: normalizeCampaignId(valid[0].campaignId),
          runId: String(valid[0].id),
        });
        if (!prev) return pickFirst();
        const ok = valid.some((j) => matchesSelection(prev, j.campaignId, j.id));
        return ok ? { ...prev, campaignId: normalizeCampaignId(prev.campaignId) } : pickFirst();
      });
    } catch (e) {
      dialog.toast.error(apiErrorMessage(e, MSG.historyLoadFailed));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistoryIndex();
  }, []);

  /** 1) GET fila: merge job.data.contacts + Logs; 2) se job sumiu do Redis → só Logs. */
  const loadRecipients = async (campaignId, runId) => {
    const cid = normalizeCampaignId(campaignId);
    const rid = String(runId);
    const key = runKey(cid, rid);
    if (!cid) return;

    const seq = ++logsReqSeq.current;

    setLogsLoadingByKey((prev) => ({ ...prev, [key]: true }));
    setLogsFetchErrorByKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const mergedRes = await api.get('/api/queue/job-recipients', {
        params: { jobId: rid },
        validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
      });
      if (seq !== logsReqSeq.current) return;

      let rows;
      if (mergedRes.status === 200 && mergedRes.data?.recipients !== undefined) {
        const payload = mergedRes.data;
        /** Evita corrida ao trocar de job: só aplica se for o mesmo job da seleção atual. */
        if (String(payload.jobId) !== rid) return;
        if (payload.campaignId != null && normalizeCampaignId(payload.campaignId) !== cid) return;
        rows = Array.isArray(payload.recipients) ? payload.recipients : [];
      } else {
        const { data } = await api.get(`/api/logs/${encodeURIComponent(cid)}`, { params: { runId: rid } });
        if (seq !== logsReqSeq.current) return;
        rows = Array.isArray(data) ? data : [];
      }
      setLogsByRun((prev) => ({ ...prev, [key]: rows }));
    } catch (e) {
      if (seq !== logsReqSeq.current) return;
      try {
        const { data } = await api.get(`/api/logs/${encodeURIComponent(cid)}`, { params: { runId: rid } });
        if (seq !== logsReqSeq.current) return;
        setLogsByRun((prev) => ({ ...prev, [key]: Array.isArray(data) ? data : [] }));
      } catch (e2) {
        const msg = e2.response?.data?.error || e2.message || 'Falha ao carregar contatos';
        setLogsFetchErrorByKey((prev) => ({ ...prev, [key]: msg }));
        setLogsByRun((prev) => ({ ...prev, [key]: [] }));
      }
    } finally {
      setLogsLoadingByKey((prev) => ({ ...prev, [key]: false }));
    }
  };

  const loadCachedAnalysis = async (campaignId, runId) => {
    const key = runKey(campaignId, runId);
    try {
      const res = await api.get('/api/logs/reply-analysis', {
        params: { campaignId, runId },
        validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
      });
      if (res.status === 404) {
        setAnalysisByRun((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }
      const data = res.data;
      if (data) {
        setAnalysisByRun((prev) => ({ ...prev, [key]: data }));
      } else {
        setAnalysisByRun((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    } catch {
      setAnalysisByRun((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  useEffect(() => {
    if (!selectedRun) return;
    loadRecipients(selectedRun.campaignId, selectedRun.runId);
    loadCachedAnalysis(selectedRun.campaignId, selectedRun.runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRun?.campaignId, selectedRun?.runId]);

  const retryFailed = async (campaignId, runId) => {
    const hours = await buildHoursPayload();
    if (!hours) return;
    try {
      const { data } = await api.post(`/api/logs/${campaignId}/retry-failed`, { ...hours, runId });
      if (!data.jobId) { dialog.toast.info(data.message || 'Nenhuma falha para reenviar.'); return; }
      const k = runKey(campaignId, runId);
      setLogsByRun((prev) => { const next = { ...prev }; delete next[k]; return next; });
      setLogsFetchErrorByKey((prev) => { const next = { ...prev }; delete next[k]; return next; });
      await loadHistoryIndex();
      await loadRecipients(campaignId, runId);
    } catch (e) {
      dialog.toast.error(apiErrorMessage(e, MSG.retryEnqueueFailed));
    }
  };

  const retryOne = async (campaignId, runId, logId) => {
    const hours = await buildHoursPayload();
    if (!hours) return;
    try {
      await api.post(`/api/logs/${campaignId}/retry/${logId}`, hours);
      const k = runKey(campaignId, runId);
      setLogsByRun((prev) => { const next = { ...prev }; delete next[k]; return next; });
      setLogsFetchErrorByKey((prev) => { const next = { ...prev }; delete next[k]; return next; });
      await loadHistoryIndex();
      await loadRecipients(campaignId, runId);
    } catch (e) {
      dialog.toast.error(apiErrorMessage(e, MSG.retryFailed));
    }
  };

  const getFeedback = async (campaignId, runId) => {
    const k = runKey(campaignId, runId);
    setAnalyzingKey(k);
    try {
      const { data } = await api.post(`/api/logs/${campaignId}/analyze-replies`, { runId });
      setAnalysisByRun((prev) => ({
        ...prev,
        [k]: { ...data, snapshotAt: data.snapshotAt || new Date().toISOString() },
      }));
    } catch (e) {
      dialog.toast.error(apiErrorMessage(e, MSG.feedbackFailed));
    } finally {
      setAnalyzingKey(null);
    }
  };

  const selectedKey = selectedRun ? runKey(selectedRun.campaignId, selectedRun.runId) : null;
  const selectedLogs = selectedKey ? logsByRun[selectedKey] || [] : [];
  const selectedJob = selectedRun
    ? jobs.find(
        (j) => String(j.id) === String(selectedRun.runId)
          && normalizeCampaignId(j.campaignId) === normalizeCampaignId(selectedRun.campaignId),
      )
    : null;

  const analysis = selectedKey ? analysisByRun[selectedKey] : null;
  const failedLogs = selectedLogs.filter((l) => l.status === 'failed');

  const detailTitle = selectedJob?.campaignName || '—';
  const detailWhen = selectedJob?.createdAt;
  const detailJobLabel = selectedRun ? `#${selectedRun.runId}` : '';
  const detailContactsCount = selectedJob?.contactsTotal ?? selectedLogs.length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Histórico</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Selecione um disparo para ver contatos e feedback.
          </p>
        </div>
        <button type="button" onClick={() => loadHistoryIndex()} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />Atualizar
        </button>
      </div>
      <div className="page-content">
        <div className="grid lg:grid-cols-[minmax(260px,320px),1fr] gap-4 items-start">
          {/* Esquerda: lista master */}
          <aside className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Disparos</p>
            </div>
            <div className="max-h-[76vh] overflow-y-auto divide-y divide-slate-100">
              {loading && (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando...
                </div>
              )}
              {!loading && sidebarItems.length === 0 && (
                <p className="p-4 text-sm text-slate-400">Nenhum envio registrado.</p>
              )}
              {sidebarItems.map((item) => {
                const j = item.job;
                const campaignId = normalizeCampaignId(j.campaignId);
                const runId = String(j.id);
                const active = selectedRun && matchesSelection(selectedRun, campaignId, runId);
                const stateMap = {
                  completed: 'badge-green', active: 'badge-blue',
                  waiting: 'badge-yellow', failed: 'badge-red', delayed: 'badge-gray',
                };
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedRun({ campaignId, runId })}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      active ? 'bg-brand-50 border-r-2 border-r-brand-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {j.campaignName || '—'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDateTime(j.createdAt)}</p>
                    <div className="mt-1">
                      <span className={stateMap[j.state] || 'badge-gray'}>
                        {j.stateLabel || j.state}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Direita: destinatários + feedback */}
          <div className="space-y-3 min-w-0">
            {!selectedRun && !loading && sidebarItems.length > 0 && (
              <div className="card p-10 text-center text-sm text-slate-400">
                Selecione um envio à esquerda.
              </div>
            )}

            {selectedRun && (
              <>
                {/* 4 metric cards */}
                {(() => {
                  const sentCount = selectedLogs.filter((l) => l.status === 'sent').length;
                  const failCount = selectedLogs.filter((l) => l.status === 'failed').length;
                  const respRate = analysis?.totals?.sentContacts > 0
                    ? Math.round((analysis.totals.respondedContacts / analysis.totals.sentContacts) * 100)
                    : null;
                  const total = analysis ? (analysis.totals.positive + analysis.totals.negative + analysis.totals.neutral) : 0;
                  const posRate = total > 0
                    ? Math.round((analysis.totals.positive / total) * 100)
                    : null;
                  const metrics = [
                    { label: 'Enviados', value: sentCount, color: 'text-brand-700', bg: 'bg-brand-50 border-brand-200' },
                    { label: 'Falhas', value: failCount, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
                    { label: 'Taxa de resposta', value: respRate != null ? `${respRate}%` : '—', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', hint: respRate == null ? 'Buscar feedback' : null },
                    { label: 'Sentimento +', value: posRate != null ? `${posRate}%` : '—', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', hint: posRate == null ? 'Buscar feedback' : null },
                  ];
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {metrics.map((m) => (
                        <div key={m.label} className={`card border ${m.bg} px-4 py-3`}>
                          <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
                          {m.hint && <p className="text-xs text-slate-400 mt-1 italic">{m.hint}</p>}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Recipients card */}
                <div className="card overflow-hidden">
                  <div className="page-header py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {detailTitle} · Job {detailJobLabel}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fmtDateTime(detailWhen)} · {detailContactsCount} contato(s)
                      </p>
                    </div>
                  </div>

                  <div className="max-h-[42vh] overflow-y-auto">
                    {selectedKey && logsLoadingByKey[selectedKey] ? (
                      <p className="p-6 text-center text-sm text-gray-400">Carregando lista de contatos...</p>
                    ) : selectedKey && logsFetchErrorByKey[selectedKey] ? (
                      <p className="p-6 text-center text-sm text-red-600">{logsFetchErrorByKey[selectedKey]}</p>
                    ) : selectedLogs.length === 0 ? (
                      <p className="p-6 text-center text-sm text-gray-500">
                        Nenhum contato neste job (fila vazia e sem logs associados).
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-200">
                        {selectedLogs.map((l, idx) => (
                          <li
                            key={l._id != null ? String(l._id) : `row-${String(l.phone)}-${idx}`}
                            className="flex items-center justify-between px-4 py-3 gap-4"
                          >
                            <span className="font-medium text-gray-900 text-sm min-w-0 flex-1">{l.name}</span>
                            <span className="text-sm shrink-0 w-28 text-right">
                              {l.status === 'sent' ? (
                                <span className="badge-green">Enviado</span>
                              ) : l.status === 'failed' ? (
                                <span className="badge-red">Falhou</span>
                              ) : l.status === 'unknown' ? (
                                <span className="badge-yellow">Sem registro</span>
                              ) : (
                                <span className="badge-gray">Pendente</span>
                              )}
                            </span>
                            <div className="shrink-0 flex items-center justify-end gap-1.5 min-w-[118px]">
                              {l.status === 'failed' ? (
                                <>
                                  <button
                                    type="button"
                                    title={l.error ? 'Ver mensagem de erro do envio' : 'Sem texto de erro gravado'}
                                    onClick={() => setFailureModal(l)}
                                    className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                  >
                                    <DocIcon className="w-4 h-4" />
                                  </button>
                                  {l._id ? (
                                    <button
                                      type="button"
                                      onClick={() => retryOne(selectedRun.campaignId, selectedRun.runId, l._id)}
                                      className="text-xs border border-gray-300 text-gray-800 px-2 py-1 rounded hover:bg-gray-50"
                                    >
                                      Reenviar
                                    </button>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {failedLogs.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => retryFailed(selectedRun.campaignId, selectedRun.runId)}
                        className="btn-secondary py-1.5 px-3 text-xs"
                      >
                        Reenviar todas as falhas ({failedLogs.length})
                      </button>
                    </div>
                  )}
                </div>

                {/* Feedback card */}
                <div className="card overflow-hidden">
                  <div className="page-header py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Feedback dos destinatários</p>
                      {analysis?.snapshotAt && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          Snapshot em {fmtDateTime(analysis.snapshotAt)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => getFeedback(selectedRun.campaignId, selectedRun.runId)}
                      disabled={analyzingKey === selectedKey}
                      className="btn-primary"
                    >
                      {analyzingKey === selectedKey ? 'Analisando...' : analysis ? 'Atualizar' : 'Pegar feedback'}
                    </button>
                  </div>

                  <div className="p-4">
                    {!analysis ? (
                      <p className="text-sm text-gray-400 text-center py-6">
                        Não há feedback salvo para este job. Clique em &ldquo;Pegar feedback&rdquo; para buscar no WhatsApp e gravar aqui.
                      </p>
                    ) : (
                      <div className="space-y-5">
                        {(analysis.diagnostic?.message
                          || (analysis.totals?.sentContacts === 0 && (!analysis.contacts || analysis.contacts.length === 0))) && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 space-y-2">
                            <p className="font-medium">Feedback sem dados de envio neste job</p>
                            {analysis.diagnostic?.message ? (
                              <p className="text-amber-900/90">{analysis.diagnostic.message}</p>
                            ) : (
                              <p className="text-amber-900/90">
                                Nenhum contato classificado como enviado para este runId. Verifique se os logs usam o mesmo job (sendJobId) que este envio.
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-6 items-start">
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Distribuição</p>
                            <SentimentPieChart
                              positive={analysis.totals.positive}
                              negative={analysis.totals.negative}
                              neutral={analysis.totals.neutral}
                            />
                          </div>
                          <div className="text-xs text-gray-500 space-y-1.5 pt-1">
                            <p>Total enviados: <b className="text-gray-700">{analysis.totals.sentContacts}</b></p>
                            <p>Responderam: <b className="text-gray-700">{analysis.totals.respondedContacts}</b></p>
                            <p>Sem resposta: <b className="text-gray-700">{analysis.totals.noReply}</b></p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Respostas por contato</p>
                          <ul className="divide-y divide-gray-100 border rounded-lg max-h-60 overflow-y-auto">
                            {analysis.contacts.map((c) => {
                              const lastText = c.replies?.length > 0
                                ? c.replies[c.replies.length - 1].text
                                : null;
                              const display = lastText
                                ? (lastText.length > 64 ? `${lastText.slice(0, 64)}…` : lastText)
                                : null;
                              return (
                                <li key={`${c.phone}-${c.sentAt}`} className="px-3 py-2 flex justify-between items-center gap-3 text-sm">
                                  <span className="font-medium text-gray-900 truncate">{c.name}</span>
                                  <span className={`text-xs shrink-0 max-w-[55%] text-right ${display ? 'text-gray-700 italic' : 'text-gray-400'}`}>
                                    {display ?? 'Sem resposta'}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {failureModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setFailureModal(null)}
        >
          <div
            className="card shadow-xl max-w-lg w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900">Erro do envio</h3>
            <p className="text-xs text-gray-500 mt-1">
              {failureModal.name ? `${failureModal.name} · ` : ''}
              <span className="font-mono">{String(failureModal.phone ?? '')}</span>
            </p>
            <pre className="text-xs mt-3 p-3 bg-gray-50 rounded border border-gray-100 overflow-auto max-h-64 whitespace-pre-wrap text-gray-800">
              {failureModal.error != null && String(failureModal.error).trim() !== ''
                ? String(failureModal.error)
                : '(Nenhuma mensagem de erro gravada neste registro.)'}
            </pre>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
                onClick={() => setFailureModal(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
