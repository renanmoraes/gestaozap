import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles, Plus, Copy, ExternalLink, BarChart2, Eye, MousePointer,
  MessageCircle, Save, Calendar, Loader2, ChevronRight, ChevronLeft,
} from 'lucide-react';
import api from '../api';
import { dialog } from '../utils/dialog';
import { apiErrorMessage } from '../utils/messages';
import { formatDateTimeBr } from '../utils/timezone';
import { resolveCampaignImageUrl } from '../utils/upload';
import PromotionLayoutRenderer from '../components/promotions/PromotionLayoutRenderer';
import '../pages/promotions/vitrine.css';

const STEPS = ['Layout', 'Conteúdo', 'Agendar', 'Publicar'];

function vitrineUrl() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.origin}/app/promocao-do-dia`;
  }
  return `https://${host}/promocao-do-dia`;
}

function Stat({ icon: Icon, label, value, color = 'brand' }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-700 border-brand-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className="card p-4">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center mb-2 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function FeatureTeaser({ onRequest, requesting }) {
  return (
    <div className="max-w-xl mx-auto card p-8 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
        <Sparkles className="w-7 h-7" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">Vitrine de Promoções</h1>
      <p className="text-slate-600 text-sm leading-relaxed">
        Publique um panfleto online em <strong>/promocao-do-dia</strong> com layouts prontos,
        agendamento de vigência, botões de WhatsApp e métricas de visualização.
      </p>
      <p className="text-slate-500 text-sm">A partir de <strong>R$ 49,99/mês</strong>.</p>
      <button type="button" onClick={onRequest} disabled={requesting} className="btn btn-primary">
        {requesting ? 'Enviando…' : 'Solicitar contratação'}
      </button>
    </div>
  );
}

function SlotField({ slot, content, onChange, onUpload }) {
  const val = content[slot.key] || {};

  if (slot.type === 'richtext' || slot.type === 'money' || slot.type === 'percent') {
    return (
      <label className="block text-sm">
        <span className="text-slate-600 font-medium">{slot.label}</span>
        <textarea
          className="input w-full mt-1"
          rows={slot.type === 'richtext' ? 4 : 1}
          maxLength={slot.maxChars}
          value={val.value || ''}
          onChange={(e) => onChange(slot.key, { ...val, value: e.target.value })}
          placeholder={slot.type === 'money' ? 'Ex: 99,90' : ''}
        />
      </label>
    );
  }

  if (slot.type === 'media') {
    const preview = val.mediaPath ? resolveCampaignImageUrl(val.mediaPath) : null;
    return (
      <div className="border border-slate-200 rounded-lg p-3 space-y-2">
        <span className="text-sm font-medium text-slate-700">{slot.label}</span>
        {preview && (
          val.mediaType === 'video'
            ? <video src={preview} controls className="w-full max-h-40 rounded" />
            : <img src={preview} alt="" className="w-full max-h-40 object-cover rounded" />
        )}
        <input
          type="file"
          accept="image/*,video/mp4,video/webm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(slot.key, file);
            e.target.value = '';
          }}
        />
        {slot.cta && (
          <input
            className="input w-full text-sm"
            placeholder="Texto do WhatsApp (opcional)"
            value={val.ctaText || ''}
            onChange={(e) => onChange(slot.key, { ...val, ctaText: e.target.value, label: slot.label })}
          />
        )}
      </div>
    );
  }

  return null;
}

export default function Promotions() {
  const [feature, setFeature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    id: null,
    title: '',
    layoutId: '',
    status: 'draft',
    startsAt: '',
    expiresAt: '',
    contentJson: {},
  });

  const load = async () => {
    setLoading(true);
    try {
      const statusRes = await api.get('/api/features/status');
      setFeature(statusRes.data);
      if (statusRes.data.active) {
        const [promoRes, layoutRes, analyticsRes] = await Promise.all([
          api.get('/api/promotions'),
          api.get('/api/promotions/layouts'),
          api.get('/api/promotions/analytics'),
        ]);
        setPromotions(promoRes.data);
        setLayouts(layoutRes.data);
        setAnalytics(analyticsRes.data);
      }
    } catch (e) {
      if (e.response?.status !== 403) dialog.alert(apiErrorMessage(e));
      setFeature({ active: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selectedLayout = useMemo(
    () => layouts.find((l) => l.id === form.layoutId),
    [layouts, form.layoutId],
  );

  const schemaSlots = selectedLayout?.schemaJson?.slots || [];

  const requestFeature = async () => {
    setRequesting(true);
    try {
      await api.post('/api/features/vitrine-promocoes/request');
      await dialog.alert('Solicitação enviada! Nossa equipe entrará em contato para liberar o addon.');
    } catch (e) {
      dialog.alert(apiErrorMessage(e));
    } finally {
      setRequesting(false);
    }
  };

  const openWizard = async (promo = null) => {
    if (promo) {
      try {
        const res = await api.get(`/api/promotions/${promo.id}`);
        const p = res.data;
        setForm({
          id: p.id,
          title: p.title,
          layoutId: p.layoutId,
          status: p.status,
          startsAt: p.startsAt ? p.startsAt.slice(0, 16) : '',
          expiresAt: p.expiresAt ? p.expiresAt.slice(0, 16) : '',
          contentJson: p.contentJson || {},
        });
      } catch (e) {
        dialog.alert(apiErrorMessage(e));
        return;
      }
    } else {
      setForm({
        id: null,
        title: 'Promoção do dia',
        layoutId: layouts[0]?.id || '',
        status: 'draft',
        startsAt: '',
        expiresAt: '',
        contentJson: {},
      });
    }
    setStep(0);
    setWizardOpen(true);
  };

  const updateSlot = (key, data) => {
    setForm((f) => ({
      ...f,
      contentJson: { ...f.contentJson, [key]: data },
    }));
  };

  const uploadSlot = async (key, file) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/api/promotions/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateSlot(key, {
        mediaPath: res.data.url,
        mediaType: res.data.mediaType,
        label: schemaSlots.find((s) => s.key === key)?.label || key,
      });
    } catch (e) {
      dialog.alert(apiErrorMessage(e));
    }
  };

  const savePromotion = async (publish = false) => {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        layoutId: form.layoutId,
        contentJson: form.contentJson,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
        status: publish
          ? (form.startsAt && new Date(form.startsAt) > new Date() ? 'scheduled' : 'active')
          : form.status,
      };
      if (form.id) {
        await api.patch(`/api/promotions/${form.id}`, payload);
      } else {
        await api.post('/api/promotions', payload);
      }
      setWizardOpen(false);
      load();
    } catch (e) {
      dialog.alert(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const removePromotion = async (id) => {
    if (!await dialog.confirm('Excluir esta promoção?')) return;
    try {
      await api.delete(`/api/promotions/${id}`);
      load();
    } catch (e) {
      dialog.alert(apiErrorMessage(e));
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(vitrineUrl());
    dialog.alert('Link copiado!');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!feature?.active) {
    return <FeatureTeaser onRequest={requestFeature} requesting={requesting} />;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-600" />
            Promoções
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Vitrine pública em{' '}
            <a href={vitrineUrl()} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              /promocao-do-dia
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyLink} className="btn btn-secondary flex items-center gap-2 text-sm">
            <Copy className="w-4 h-4" />
            Copiar link
          </button>
          <a href={vitrineUrl()} target="_blank" rel="noopener noreferrer" className="btn btn-secondary flex items-center gap-2 text-sm">
            <ExternalLink className="w-4 h-4" />
            Ver vitrine
          </a>
          <button type="button" onClick={() => openWizard()} className="btn btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            Nova promoção
          </button>
        </div>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={Eye} label="Visualizações (30d)" value={analytics.views} />
          <Stat icon={Eye} label="Hoje" value={analytics.viewsToday} color="emerald" />
          <Stat icon={MousePointer} label="Cliques WhatsApp" value={analytics.clicks} color="amber" />
          <Stat icon={MessageCircle} label="Leads" value={analytics.leads} color="emerald" />
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left p-3">Título</th>
              <th className="text-left p-3">Layout</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Vigência</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {promotions.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  Nenhuma promoção cadastrada ainda.
                </td>
              </tr>
            ) : promotions.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="p-3 font-medium">{p.title}</td>
                <td className="p-3 text-slate-600">{p.layoutName}</td>
                <td className="p-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100">{p.status}</span>
                </td>
                <td className="p-3 text-slate-600 text-xs">
                  {p.startsAt ? formatDateTimeBr(p.startsAt) : '—'}
                  {p.expiresAt && ` → ${formatDateTimeBr(p.expiresAt)}`}
                </td>
                <td className="p-3 text-right space-x-2">
                  <button type="button" onClick={() => openWizard(p)} className="text-brand-600 hover:underline">
                    Editar
                  </button>
                  <button type="button" onClick={() => removePromotion(p.id)} className="text-red-600 hover:underline">
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {analytics?.recentLeads?.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <BarChart2 className="w-4 h-4" />
            Leads recentes
          </h2>
          <ul className="space-y-2 text-sm">
            {analytics.recentLeads.map((l) => (
              <li key={l.id} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                <span className="text-slate-700 truncate">{l.message || 'Clique WhatsApp'}</span>
                <span className="text-slate-400 shrink-0">{formatDateTimeBr(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                {form.id ? 'Editar promoção' : 'Nova promoção'}
              </h2>
              <button type="button" onClick={() => setWizardOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="px-4 pt-3 flex gap-1 text-xs">
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={`px-2 py-1 rounded ${i === step ? 'bg-brand-100 text-brand-700 font-medium' : 'text-slate-400'}`}
                >
                  {i + 1}. {s}
                </span>
              ))}
            </div>

            <div className="p-4 space-y-4">
              {step === 0 && (
                <>
                  <label className="block text-sm">
                    <span className="text-slate-600">Título interno</span>
                    <input
                      className="input w-full mt-1"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {layouts.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, layoutId: l.id }))}
                        className={`p-3 rounded-lg border text-left text-sm ${
                          form.layoutId === l.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
                        }`}
                      >
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-slate-500 capitalize">{l.category}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 1 && selectedLayout && (
                <div className="space-y-3">
                  {schemaSlots.filter((s) => !s.computed).map((slot) => (
                    <SlotField
                      key={slot.key}
                      slot={slot}
                      content={form.contentJson}
                      onChange={updateSlot}
                      onUpload={uploadSlot}
                    />
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-sm">
                    <span className="text-slate-600 flex items-center gap-1"><Calendar className="w-3 h-3" /> Início</span>
                    <input
                      type="datetime-local"
                      className="input w-full mt-1"
                      value={form.startsAt}
                      onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-slate-600 flex items-center gap-1"><Calendar className="w-3 h-3" /> Fim</span>
                    <input
                      type="datetime-local"
                      className="input w-full mt-1"
                      value={form.expiresAt}
                      onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                    />
                  </label>
                </div>
              )}

              {step === 3 && selectedLayout && (
                <div className="promo-promotion-block">
                  <h3 className="promo-promotion-title">{form.title}</h3>
                  <PromotionLayoutRenderer
                    promotion={{
                      contentJson: form.contentJson,
                      layout: selectedLayout,
                    }}
                    phone="5511999999999"
                  />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-between">
              <button
                type="button"
                disabled={step === 0}
                onClick={() => setStep((s) => s - 1)}
                className="btn btn-secondary flex items-center gap-1 text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
              <div className="flex gap-2">
                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s + 1)}
                    disabled={step === 0 && !form.layoutId}
                    className="btn btn-primary flex items-center gap-1 text-sm"
                  >
                    Próximo
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => savePromotion(false)} disabled={saving} className="btn btn-secondary text-sm">
                      Salvar rascunho
                    </button>
                    <button type="button" onClick={() => savePromotion(true)} disabled={saving} className="btn btn-primary flex items-center gap-1 text-sm">
                      <Save className="w-4 h-4" />
                      Publicar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
