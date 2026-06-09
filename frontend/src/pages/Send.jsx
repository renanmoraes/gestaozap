import React, { useState, useEffect } from 'react';
import { Send, Users, Tag, Eye, AlertTriangle, CheckCircle2, Loader2, X, Info, Pause, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import api from '../api';
import { DEFAULT_HOUR_START, DEFAULT_HOUR_END, getCurrentHourBr, isOutsideRecommendedHours, confirmSendOutsideHours } from '../utils/hours';
import { formatDateTimeBr } from '../utils/timezone';
import { renderWhatsAppLikeText } from '../utils/whatsappFormat';

const API_URL = import.meta.env.VITE_API_URL || '';

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

export default function SendPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selected, setSelected] = useState({ campaignId: '', contactIds: new Set(), tagFilter: '' });
  const [vars, setVars] = useState({ evento: '', data: '', horario: '', local: '' });
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [paused, setPaused] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    api.get('/api/campaigns').then((r) => setCampaigns(r.data));
    api.get('/api/contacts', { params: { limit: 10000, page: 1, optedOut: 'hide' } }).then((r) => {
      setContacts(r.data.items || []);
      setAllTags(r.data.tags || []);
    });
  }, []);

  useEffect(() => {
    api.get('/api/contacts', {
      params: {
        limit: 10000,
        page: 1,
        optedOut: 'hide',
        ...(selected.tagFilter ? { tag: selected.tagFilter } : {}),
      },
    }).then((r) => setContacts(r.data.items || []));
  }, [selected.tagFilter]);

  useSocket({
    'send:progress': (d) => { setProgress(d); if (d.jobId != null) setActiveJobId(String(d.jobId)); },
    'send:paused': (d) => {
      setPaused(true);
      if (d.jobId != null) setActiveJobId(String(d.jobId));
      setNotice(d.reason === 'outside_hours' && d.resumesAt
        ? `Fora do horário de envio. Pausado automaticamente — retoma em ${formatDateTimeBr(d.resumesAt)}.`
        : 'Envio pausado.');
    },
    'send:resumed': (d) => { setPaused(false); if (d.jobId != null) setActiveJobId(String(d.jobId)); setNotice(null); },
    'send:done': (d) => {
      setProgress(d);
      // Reagendado por estar fora do horário: o envio continua sozinho — não voltar ao estado ocioso.
      if (d.rescheduled) {
        setPaused(true);
        setNotice(`Fora do horário — ${d.sentCount}/${d.total} enviados. O restante retoma automaticamente em ${formatDateTimeBr(d.resumesAt)}.`);
        return;
      }
      setSending(false); setPaused(false); setActiveJobId(null);
      if (d.cancelled) setNotice(`Envio cancelado. Enviados: ${d.sentCount}/${d.total}`);
      else if (d.skippedForHours) setNotice(`Fora da janela de horário (${d.hourStart}h–${d.hourEnd}h).`);
    },
    'send:alert': ({ message }) => setNotice(message),
    'send:batch_pause': ({ sentCount }) => setNotice(`Pausa entre lotes após ${sentCount} envios (10 min)`),
  });

  const pauseSend = async () => {
    if (!activeJobId) return;
    setActing(true);
    try { await api.post(`/api/queue/jobs/${activeJobId}/pause`); setPaused(true); }
    catch (err) { setNotice(err.response?.data?.error || 'Erro ao pausar'); }
    finally { setActing(false); }
  };

  const resumeSend = async () => {
    if (!activeJobId) return;
    setActing(true);
    try { await api.post(`/api/queue/jobs/${activeJobId}/resume`); setPaused(false); }
    catch (err) { setNotice(err.response?.data?.error || 'Erro ao retomar'); }
    finally { setActing(false); }
  };

  const campaign = campaigns.find((c) => c._id === selected.campaignId);
  const preview = campaign ? buildPreview(campaign.text, vars, campaign.appendOptOut, campaign.optOutText) : '';

  const toggleContact = (id) => setSelected((s) => {
    const next = new Set(s.contactIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { ...s, contactIds: next };
  });

  const selectAll = () => setSelected((s) => ({
    ...s,
    contactIds: new Set(contacts.filter((c) => !c.optedOut).map((c) => c._id)),
  }));

  const clearAll = () => setSelected((s) => ({ ...s, contactIds: new Set() }));

  const dispatch = async () => {
    if (!selected.campaignId || !selected.contactIds.size) return;
    const h = getCurrentHourBr();
    let ignoreHours = false;
    if (isOutsideRecommendedHours(h, DEFAULT_HOUR_START, DEFAULT_HOUR_END)) {
      if (!confirmSendOutsideHours(DEFAULT_HOUR_START, DEFAULT_HOUR_END)) return;
      ignoreHours = true;
    }
    setSending(true); setNotice(null); setProgress(null); setPaused(false); setActiveJobId(null);
    try {
      const r = await api.post('/api/send', {
        campaignId: selected.campaignId,
        contactIds: [...selected.contactIds],
        variables: vars,
        hourStart: DEFAULT_HOUR_START, hourEnd: DEFAULT_HOUR_END, ignoreHours,
        preventDuplicate: true,
      });
      if (r.data.jobId) setActiveJobId(String(r.data.jobId));
      const msgs = [];
      if (r.data.skippedDuplicate) msgs.push(`${r.data.skippedDuplicate} já receberam este template (pulados)`);
      if (r.data.optedOutCount) msgs.push(`${r.data.optedOutCount} optaram por não receber (pulados)`);
      if (msgs.length) setNotice(msgs.join(' · '));
      if (!r.data.jobId) setSending(false);
    } catch (err) {
      setNotice(err.response?.data?.error || 'Erro ao iniciar envio');
      setSending(false);
    }
  };

  const eligible = contacts.filter((c) => !c.optedOut);
  const selectedCount = selected.contactIds.size;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Disparo de mensagens</h1>
          <p className="text-sm text-slate-500 mt-0.5">Selecione template e contatos para disparar</p>
        </div>
        {selectedCount > 0 && campaign && (
          <button onClick={() => setShowPreview((v) => !v)}
            className="btn-secondary">
            <Eye className="w-4 h-4" />{showPreview ? 'Ocultar' : 'Preview'}
          </button>
        )}
      </div>

      <div className="page-content">
        {notice && (
          <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />{notice}
            <button onClick={() => setNotice(null)} className="ml-auto shrink-0"><X className="w-4 h-4" /></button>
          </div>
        )}

        {progress && !progress.cancelled && !progress.skippedForHours && (
          <div className="card p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                {paused ? 'Pausado' : sending ? 'Enviando…' : 'Concluído'} {progress.sentCount}/{progress.total}
              </span>
              {progress.failedCount > 0 && <span className="text-red-600 text-xs">{progress.failedCount} falha(s)</span>}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-brand-600 h-2 rounded-full transition-all"
                style={{ width: `${((progress.sentCount + (progress.failedCount || 0)) / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {sending && activeJobId && (
          <div className="flex gap-2">
            {!paused ? (
              <button onClick={pauseSend} disabled={acting} className="btn-secondary py-2 px-4 text-sm">
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                Pausar envio
              </button>
            ) : (
              <button onClick={resumeSend} disabled={acting} className="btn-primary py-2 px-4 text-sm">
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Retomar envio
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: config */}
          <div className="xl:col-span-2 space-y-4">
            {/* Campaign */}
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">1. Template</h2>
              {campaigns.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Nenhum template. <Link to="/campaigns" className="text-brand-600 hover:underline">Criar agora</Link>
                </div>
              ) : (
                <select className="input" value={selected.campaignId}
                  onChange={(e) => setSelected((s) => ({ ...s, campaignId: e.target.value }))}>
                  <option value="">Selecione um template…</option>
                  {campaigns.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Variables */}
            {campaign && /\{(evento|data|horario|local)\}/i.test(campaign.text) && (
              <div className="card p-5 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">2. Variáveis do envio</h2>
                <div className="grid grid-cols-2 gap-3">
                  {VARS.filter((v) => new RegExp(`\\{${v}\\}`, 'i').test(campaign.text)).map((v) => (
                    <div key={v}>
                      <label className="block text-xs font-medium text-slate-700 mb-1 capitalize">{v}</label>
                      <input className="input" placeholder={`Ex: ${v === 'evento' ? 'Casamento' : v === 'data' ? '28/06/2025' : v === 'horario' ? '19h00' : 'Rua das Flores, 100'}`}
                        value={vars[v]} onChange={(e) => setVars((prev) => ({ ...prev, [v]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts */}
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">
                  {campaign && /\{(evento|data|horario|local)\}/i.test(campaign.text) ? '3.' : '2.'} Contatos
                </h2>
                <div className="flex items-center gap-2">
                  <button onClick={selectAll} className="text-xs text-brand-600 hover:underline">Todos elegíveis</button>
                  <span className="text-slate-300">·</span>
                  <button onClick={clearAll} className="text-xs text-slate-500 hover:underline">Limpar</button>
                </div>
              </div>

              {allTags.length > 0 && (
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setSelected((s) => ({ ...s, tagFilter: '' }))}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${!selected.tagFilter ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-600 hover:border-brand-400'}`}>
                      Todos
                    </button>
                    {allTags.map((t) => (
                      <button key={t} onClick={() => setSelected((s) => ({ ...s, tagFilter: t }))}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selected.tagFilter === t ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-600 hover:border-brand-400'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-50 border border-slate-200 rounded-lg">
                {contacts.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">Nenhum contato encontrado.</div>
                ) : contacts.map((c) => (
                  <label key={c._id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${c.optedOut ? 'opacity-50' : ''}`}>
                    <input type="checkbox" checked={selected.contactIds.has(c._id)}
                      onChange={() => !c.optedOut && toggleContact(c._id)}
                      disabled={c.optedOut} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.phone}</div>
                    </div>
                    {c.optedOut && <span className="badge-red text-xs">opt-out</span>}
                    {c.tags?.length > 0 && !c.optedOut && (
                      <div className="flex gap-1">
                        {c.tags.slice(0, 2).map((t) => (
                          <span key={t} className="badge-gray">{t}</span>
                        ))}
                      </div>
                    )}
                  </label>
                ))}
              </div>
              <div className="text-xs text-slate-500">
                {selectedCount} selecionado(s) · {eligible.length} elegíveis
              </div>
            </div>

            <button onClick={dispatch} disabled={sending || !selected.campaignId || !selectedCount}
              className="btn-primary w-full justify-center py-3">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? `Enviando…` : `Disparar para ${selectedCount} contato(s)`}
            </button>
          </div>

          {/* Preview panel */}
          {showPreview && campaign && (
            <div className="card p-5 space-y-3 h-fit">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Eye className="w-4 h-4 text-brand-600" />Preview
              </h2>
              <div className="bg-[#e5ddd5] rounded-xl p-4">
                <div className="max-w-xs ml-auto bg-[#dcf8c6] rounded-lg px-3 py-2 shadow-sm">
                  {campaign.imagePath && (
                    <img src={`${API_URL}/${campaign.imagePath}`} alt="Imagem do template"
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
