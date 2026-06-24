import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Send, Tag, Eye, Loader2, X, Info, Pause, Play, Search, Users, CheckSquare, Square, Clock,
} from 'lucide-react';
import { formatEstimate } from '../utils/sendEstimate';
import { Link } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useTenant } from '../context/TenantContext';
import IntentSegmentation from '../components/send/IntentSegmentation';
import UpsellBanner from '../components/UpsellBanner';
import api from '../api';
import { DEFAULT_HOUR_START, DEFAULT_HOUR_END, getCurrentHourBr, isOutsideRecommendedHours, confirmSendOutsideHours } from '../utils/hours';
import { formatDateTimeBr } from '../utils/timezone';
import { renderWhatsAppLikeText } from '../utils/whatsappFormat';
import { resolveCampaignImageUrl } from '../utils/upload';
const PAGE_SIZE = 50;
const VARS = ['evento', 'data', 'horario', 'local'];

function buildPreview(text, vars, appendOptOut, optOutText, name = 'João') {
  let t = (text || '')
    .replace(/\{nome\}/gi, name)
    .replace(/\{evento\}/gi, vars.evento || '{evento}')
    .replace(/\{data\}/gi, vars.data || '{data}')
    .replace(/\{horario\}/gi, vars.horario || '{horario}')
    .replace(/\{local\}/gi, vars.local || '{local}');
  if (appendOptOut && optOutText) t += `\n\n${optOutText}`;
  return t;
}

const EMPTY_SELECTION = {
  mode: 'manual', // 'manual' | 'all-filtered'
  contactIds: new Set(),
  excludeIds: new Set(),
  tagFilter: '',
  search: '',
};

export default function SendPage() {
  const { hasFeature } = useTenant();
  const hasIntents = hasFeature('intencoes');
  const [intentFilter, setIntentFilter] = useState(null);
  const [intentCount, setIntentCount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [totalEligible, setTotalEligible] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);
  const loadingRef = useRef(false);

  const [campaignId, setCampaignId] = useState('');
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [searchDebounced, setSearchDebounced] = useState('');

  const [vars, setVars] = useState({ evento: '', data: '', horario: '', local: '' });
  const [notice, setNotice] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sendConfig, setSendConfig] = useState(null);
  const [activeDispatches, setActiveDispatches] = useState({});
  // Janela segura (dias) p/ bloquear reseleção de contato já enviado. Vem do backend
  // (config 'resend_safe_days', editável no admin); 30 é só o fallback inicial.
  const [resendSafeDays, setResendSafeDays] = useState(30);

  useEffect(() => {
    api.get('/api/campaigns').then((r) => setCampaigns(r.data));
  }, []);

  useEffect(() => {
    api.get('/api/send/config').then((r) => setSendConfig(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(selection.search.trim()), 300);
    return () => clearTimeout(t);
  }, [selection.search]);

  const loadContacts = useCallback(async (pageNum, append) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (append) setLoadingMore(true);
    else setLoadingList(true);
    try {
      const res = await api.get('/api/contacts', {
        params: {
          page: pageNum,
          limit: PAGE_SIZE,
          optedOut: 'hide',
          ...(selection.tagFilter ? { tag: selection.tagFilter } : {}),
          ...(searchDebounced ? { q: searchDebounced } : {}),
        },
      });
      const items = res.data.items || [];
      setContacts((prev) => (append ? [...prev, ...items] : items));
      setTotalEligible(res.data.total ?? 0);
      setAllTags(res.data.tags || []);
      if (res.data.resendSafeDays != null) setResendSafeDays(res.data.resendSafeDays);
    } finally {
      loadingRef.current = false;
      setLoadingList(false);
      setLoadingMore(false);
    }
  }, [selection.tagFilter, searchDebounced]);

  useEffect(() => {
    setPage(1);
    setContacts([]);
    // A seleção manual persiste ao trocar/limpar o filtro, permitindo filtrar e
    // selecionar em várias etapas. Apenas o modo "todos filtrados" é reiniciado,
    // pois ele é vinculado ao filtro atual (exclusões deixam de fazer sentido).
    setSelection((s) => (
      s.mode === 'all-filtered'
        ? { ...EMPTY_SELECTION, tagFilter: s.tagFilter, search: s.search }
        : s
    ));
  }, [selection.tagFilter, searchDebounced]);

  useEffect(() => {
    loadContacts(1, false);
  }, [selection.tagFilter, searchDebounced, loadContacts]);

  useEffect(() => {
    if (page > 1) loadContacts(page, true);
  }, [page, loadContacts]);

  // Prévia da audiência quando há filtro de intenção (contagem precisa via backend).
  useEffect(() => {
    if (!hasIntents || !intentFilter) { setIntentCount(null); return; }
    let cancelled = false;
    const body = {
      selectAll: true,
      filter: {
        ...(selection.tagFilter ? { tag: selection.tagFilter } : {}),
        ...(searchDebounced ? { q: searchDebounced } : {}),
      },
      intentFilter,
    };
    api.post('/api/send/preview', body)
      .then(({ data }) => { if (!cancelled) setIntentCount(data?.eligible ?? null); })
      .catch(() => { if (!cancelled) setIntentCount(null); });
    return () => { cancelled = true; };
  }, [hasIntents, intentFilter, selection.tagFilter, searchDebounced]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingRef.current && contacts.length < totalEligible) {
        setPage((p) => p + 1);
      }
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [contacts.length, totalEligible]);

  useSocket({
    'send:progress': (d) => {
      const key = d.runId || d.dispatchId || d.jobId;
      if (!key) return;
      setActiveDispatches((prev) => ({
        ...prev,
        [key]: { jobId: String(d.jobId), sentCount: d.sentCount ?? 0, total: d.total ?? 0, failedCount: d.failedCount ?? 0, paused: false, dispatchId: key },
      }));
    },
    'send:paused': (d) => {
      const key = d.runId || d.dispatchId || d.jobId;
      if (!key) return;
      setActiveDispatches((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), paused: true, jobId: String(d.jobId) } }));
      setNotice(d.reason === 'outside_hours' && d.resumesAt
        ? `Fora do horário. Retoma em ${formatDateTimeBr(d.resumesAt)}.`
        : 'Envio pausado.');
    },
    'send:resumed': (d) => {
      const key = d.runId || d.dispatchId || d.jobId;
      if (!key) return;
      setActiveDispatches((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), paused: false } }));
      setNotice(null);
    },
    'send:done': (d) => {
      const key = d.runId || d.dispatchId || d.jobId;
      if (key) setActiveDispatches((prev) => { const n = { ...prev }; delete n[key]; return n; });
      if (d.cancelled) setNotice(`Envio cancelado. Enviados: ${d.sentCount}/${d.total}`);
      else if (!d.rescheduled) setNotice(null);
    },
    'send:alert': ({ message }) => setNotice(message),
    'send:batch_pause': ({ sentCount }) => setNotice(`Pausa entre lotes após ${sentCount} envios (15 min)`),
  });

  const campaign = campaigns.find((c) => c._id === campaignId);
  const preview = campaign ? buildPreview(campaign.text, vars, campaign.appendOptOut, campaign.optOutText) : '';

  const isAllFiltered = selection.mode === 'all-filtered';
  const selectedCount = isAllFiltered
    ? Math.max(0, totalEligible - selection.excludeIds.size)
    : selection.contactIds.size;

  const isContactChecked = (id) => (
    isAllFiltered ? !selection.excludeIds.has(id) : selection.contactIds.has(id)
  );

  // Contato enviado dentro da janela segura → não pode ser reselecionado.
  // Retorna null se livre, ou { badge, tooltip } se bloqueado.
  const getSendBlock = (c) => {
    if (!c.lastSentAt || resendSafeDays <= 0) return null;
    const sentMs = new Date(c.lastSentAt).getTime();
    if (!Number.isFinite(sentMs)) return null;
    const daysSince = Math.floor((Date.now() - sentMs) / 86_400_000);
    if (daysSince >= resendSafeDays) return null; // fora da janela: liberado
    const releasesIn = Math.max(1, resendSafeDays - daysSince);
    const ago = daysSince <= 0 ? 'hoje' : `há ${daysSince} dia${daysSince > 1 ? 's' : ''}`;
    return {
      badge: daysSince <= 0 ? 'enviado hoje' : `enviado ${daysSince}d`,
      tooltip: `Não pode selecionar: enviado ${ago}. Liberado para reenvio em ${releasesIn} dia${releasesIn > 1 ? 's' : ''} (janela segura de ${resendSafeDays} dias).`,
    };
  };

  const toggleContact = (id) => {
    setSelection((s) => {
      if (s.mode === 'all-filtered') {
        const next = new Set(s.excludeIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...s, excludeIds: next };
      }
      const next = new Set(s.contactIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, contactIds: next };
    });
  };

  const selectAllFiltered = () => {
    setSelection((s) => ({ ...s, mode: 'all-filtered', contactIds: new Set(), excludeIds: new Set() }));
  };

  const selectPage = () => {
    setSelection((s) => {
      const next = new Set(s.contactIds);
      contacts.filter((c) => !c.optedOut && !getSendBlock(c)).forEach((c) => next.add(c._id));
      return { ...s, mode: 'manual', contactIds: next, excludeIds: new Set() };
    });
  };

  const clearSelection = () => {
    setSelection((s) => ({ ...s, mode: 'manual', contactIds: new Set(), excludeIds: new Set() }));
  };

  const filterLabel = useMemo(() => {
    const parts = [];
    if (selection.tagFilter) parts.push(`tag "${selection.tagFilter}"`);
    if (searchDebounced) parts.push(`busca "${searchDebounced}"`);
    return parts.length ? parts.join(' · ') : 'todos os contatos elegíveis';
  }, [selection.tagFilter, searchDebounced]);

  const dispatch = async () => {
    if (!campaignId || !selectedCount) return;
    const h = getCurrentHourBr();
    let ignoreHours = false;
    if (isOutsideRecommendedHours(h, DEFAULT_HOUR_START, DEFAULT_HOUR_END)) {
      if (!(await confirmSendOutsideHours(DEFAULT_HOUR_START, DEFAULT_HOUR_END))) return;
      ignoreHours = true;
    }
    setNotice(null);
    try {
      const payload = {
        campaignId,
        variables: vars,
        hourStart: DEFAULT_HOUR_START,
        hourEnd: DEFAULT_HOUR_END,
        ignoreHours,
        preventDuplicate: true,
      };

      if (isAllFiltered) {
        payload.selectAll = true;
        payload.filter = {
          ...(selection.tagFilter ? { tag: selection.tagFilter } : {}),
          ...(searchDebounced ? { q: searchDebounced } : {}),
        };
        if (selection.excludeIds.size) {
          payload.excludeContactIds = [...selection.excludeIds];
        }
      } else {
        payload.contactIds = [...selection.contactIds];
      }

      if (hasIntents && intentFilter) {
        payload.intentFilter = intentFilter;
      }

      const r = await api.post('/api/send', payload);
      if (r.data.jobId) {
        const dispatchKey = r.data.dispatchId || String(r.data.jobId);
        setActiveDispatches((prev) => ({
          ...prev,
          [dispatchKey]: { jobId: String(r.data.jobId), sentCount: 0, total: r.data.queued, failedCount: 0, paused: false, dispatchId: dispatchKey },
        }));
      }
      const msgs = [];
      if (r.data.skippedDuplicate) msgs.push(`${r.data.skippedDuplicate} já receberam este template (pulados)`);
      if (r.data.optedOutCount) msgs.push(`${r.data.optedOutCount} optaram por não receber (pulados)`);
      if (msgs.length) setNotice(msgs.join(' · '));
    } catch (err) {
      setNotice(err.response?.data?.message || err.response?.data?.error || 'Erro ao iniciar envio');
    }
  };

  const contactsStep = campaign && /\{(evento|data|horario|local)\}/i.test(campaign.text) ? '3.' : '2.';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Disparo de mensagens</h1>
          <p className="text-sm text-slate-500 mt-0.5">Monte o envio: template, filtros e seleção de contatos</p>
        </div>
        {selectedCount > 0 && campaign && (
          <button onClick={() => setShowPreview((v) => !v)} className="btn-secondary">
            <Eye className="w-4 h-4" />{showPreview ? 'Ocultar' : 'Preview'}
          </button>
        )}
      </div>

      <div className="page-content">
        <UpsellBanner context="send" className="mb-1" />
        {notice && (
          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />{notice}
            <button onClick={() => setNotice(null)} className="ml-auto shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}

        {Object.values(activeDispatches).map((d) => (
          <div key={d.dispatchId} className="card p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                {d.paused ? 'Pausado' : 'Enviando…'} {d.sentCount}/{d.total}
              </span>
              {d.failedCount > 0 && <span className="text-red-600 text-xs">{d.failedCount} falha(s)</span>}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-brand-600 h-2 rounded-full transition-all"
                style={{ width: `${((d.sentCount + d.failedCount) / Math.max(1, d.total)) * 100}%` }} />
            </div>
            <div className="flex gap-2">
              {!d.paused ? (
                <button onClick={() => api.post(`/api/queue/jobs/${d.jobId}/pause`).then(() =>
                  setActiveDispatches((p) => ({ ...p, [d.dispatchId]: { ...p[d.dispatchId], paused: true } })))}
                  className="btn-secondary py-1.5 px-3 text-xs">
                  <Pause className="w-3.5 h-3.5" />Pausar
                </button>
              ) : (
                <button onClick={() => api.post(`/api/queue/jobs/${d.jobId}/resume`).then(() =>
                  setActiveDispatches((p) => ({ ...p, [d.dispatchId]: { ...p[d.dispatchId], paused: false } })))}
                  className="btn-primary py-1.5 px-3 text-xs">
                  <Play className="w-3.5 h-3.5" />Retomar
                </button>
              )}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-4">
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">1. Template</h2>
              {campaigns.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Nenhum template. <Link to="/campaigns" className="text-brand-600 hover:underline">Criar agora</Link>
                </div>
              ) : (
                <select className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">Selecione um template…</option>
                  {campaigns.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {campaign && /\{(evento|data|horario|local)\}/i.test(campaign.text) && (
              <div className="card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">2. Variáveis do envio</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {VARS.filter((v) => new RegExp(`\\{${v}\\}`, 'i').test(campaign.text)).map((v) => (
                    <div key={v}>
                      <label className="block text-xs font-medium text-slate-700 mb-1 capitalize">{v}</label>
                      <input className="input"
                        placeholder={`Ex: ${v === 'evento' ? 'Casamento' : v === 'data' ? '28/06/2025' : v === 'horario' ? '19h00' : 'Rua das Flores, 100'}`}
                        value={vars[v]} onChange={(e) => setVars((prev) => ({ ...prev, [v]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="p-5 border-b border-slate-100 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{contactsStep} Contatos</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {totalEligible.toLocaleString('pt-BR')} elegíveis na base
                      {selection.tagFilter || searchDebounced ? ` · ${contacts.length.toLocaleString('pt-BR')} neste filtro` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-100 text-brand-700 text-sm font-medium shrink-0">
                    <Users className="w-4 h-4" />
                    {selectedCount.toLocaleString('pt-BR')} selecionado(s)
                  </div>
                </div>

                {selectedCount > 0 && sendConfig && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {formatEstimate(selectedCount, sendConfig, Object.keys(activeDispatches).length + 1)}
                      {Object.keys(activeDispatches).length > 0 && (
                        <span className="text-brand-600 font-medium"> · {Object.keys(activeDispatches).length + 1} workers ativos</span>
                      )}
                    </span>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    className="input pl-9"
                    placeholder="Buscar por nome ou telefone…"
                    value={selection.search}
                    onChange={(e) => setSelection((s) => ({ ...s, search: e.target.value }))}
                  />
                </div>

                {allTags.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-1.5" />
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelection((s) => ({ ...s, tagFilter: '' }))}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${!selection.tagFilter ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-600 hover:border-brand-400'}`}
                      >
                        Todas as tags
                      </button>
                      {allTags.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSelection((s) => ({ ...s, tagFilter: t }))}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selection.tagFilter === t ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-600 hover:border-brand-400'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {hasIntents && (
                  <>
                    <IntentSegmentation onChange={setIntentFilter} />
                    {intentFilter && intentCount != null && (
                      <p className="text-xs text-brand-700 -mt-1">
                        <strong>{intentCount.toLocaleString('pt-BR')}</strong> contato(s) atendem à segmentação por intenção.
                      </p>
                    )}
                  </>
                )}

                <div className="flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-white py-2 -mx-1 px-1">
                  <button type="button" onClick={selectAllFiltered} className="btn-secondary py-1.5 px-3 text-xs">
                    <CheckSquare className="w-3.5 h-3.5" />
                    Selecionar todos ({totalEligible.toLocaleString('pt-BR')})
                  </button>
                  <button type="button" onClick={selectPage} disabled={!contacts.length} className="btn-secondary py-1.5 px-3 text-xs">
                    Página visível ({contacts.filter((c) => !c.optedOut && !getSendBlock(c)).length})
                  </button>
                  <button type="button" onClick={clearSelection} disabled={!selectedCount} className="btn-secondary py-1.5 px-3 text-xs">
                    <Square className="w-3.5 h-3.5" />
                    Limpar
                  </button>
                </div>
              </div>

              {isAllFiltered && (
                <div className="px-5 py-3 bg-brand-50 border-b border-brand-100 text-xs text-brand-800 flex items-start gap-2">
                  <CheckSquare className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Todos os {totalEligible.toLocaleString('pt-BR')} contatos</strong> de {filterLabel} estão selecionados.
                    {selection.excludeIds.size > 0 && ` ${selection.excludeIds.size} excluído(s) manualmente.`}
                    {' '}Desmarque um contato para removê-lo do disparo.
                  </span>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                {loadingList && contacts.length === 0 ? (
                  <div className="p-8 flex justify-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    Nenhum contato encontrado para este filtro.
                  </div>
                ) : contacts.map((c) => {
                  const block = getSendBlock(c);
                  const blocked = !!block;
                  const disabled = c.optedOut || blocked;
                  const checked = isContactChecked(c._id) && !disabled;
                  return (
                    <label
                      key={c._id}
                      title={blocked ? block.tooltip : undefined}
                      className={`flex items-center gap-3 px-5 py-2.5 transition-colors ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${checked ? 'bg-brand-50/40' : 'hover:bg-slate-50'} ${disabled ? 'opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => !disabled && toggleContact(c._id)}
                        disabled={disabled}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                        <div className="text-xs text-slate-400">{c.phone}</div>
                      </div>
                      {c.optedOut && <span className="badge-red text-xs">opt-out</span>}
                      {blocked && !c.optedOut && (
                        <span title={block.tooltip} className="badge-yellow text-xs whitespace-nowrap">{block.badge}</span>
                      )}
                      {c.tags?.length > 0 && !c.optedOut && !blocked && (
                        <div className="flex gap-1 shrink-0">
                          {c.tags.slice(0, 2).map((t) => (
                            <span key={t} className="badge-gray">{t}</span>
                          ))}
                        </div>
                      )}
                    </label>
                  );
                })}
                <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                  {loadingMore && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  {!loadingMore && contacts.length < totalEligible && (
                    <span className="text-xs text-slate-400">Role para carregar mais…</span>
                  )}
                </div>
              </div>
            </div>

            <button onClick={dispatch} disabled={!campaignId || !selectedCount} className="btn-primary w-full justify-center py-3">
              <Send className="w-4 h-4" />
              {`Disparar para ${selectedCount.toLocaleString('pt-BR')} contato(s)`}
            </button>
          </div>

          {showPreview && campaign && (
            <div className="card p-5 space-y-3 h-fit">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Eye className="w-4 h-4 text-brand-600" />Preview
              </h2>
              <div className="bg-[#e5ddd5] rounded-xl p-4">
                <div className="max-w-xs ml-auto bg-[#dcf8c6] rounded-lg px-3 py-2 shadow-sm">
                  {campaign.imagePath && (
                    <img src={resolveCampaignImageUrl(campaign.imagePath)} alt="Imagem do template"
                      className="mb-2 rounded-md w-full object-cover max-h-48" />
                  )}
                  <div className="text-sm text-slate-800 whitespace-pre-wrap">
                    {renderWhatsAppLikeText(preview)}
                  </div>
                </div>
              </div>
              {campaign.appendOptOut && (
                <div className="flex items-center gap-2 text-xs text-brand-600 bg-brand-50 rounded-lg p-2.5 border border-brand-200">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  Aviso de opt-out será anexado
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
