import React, { useState, useEffect } from 'react';
import {
  Sparkles, Plus, Copy, ExternalLink, BarChart2, Eye, MousePointer,
  MessageCircle, Loader2, Pencil, Trash2, Link2,
} from 'lucide-react';
import api from '../api';
import { dialog } from '../utils/dialog';
import { apiErrorMessage } from '../utils/messages';
import { formatDateTimeBr } from '../utils/timezone';
import PromotionEditor from '../components/promotions/PromotionEditor';
import './promotions/promotions-panel.css';

const STATUS_LABELS = {
  draft: 'Rascunho',
  active: 'Ativa',
  scheduled: 'Agendada',
  expired: 'Expirada',
};

function vitrineUrl() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.origin}/app/promocao-do-dia`;
  }
  return `https://${host}/promocao-do-dia`;
}

function FeatureTeaser({ onRequest, requesting }) {
  return (
    <div className="promotions-teaser">
      <div className="promotions-teaser-card">
        <div className="promotions-teaser-icon">
          <Sparkles className="w-7 h-7" />
        </div>
        <h1>Vitrine de Promoções</h1>
        <p>
          Seu panfleto digital em <strong>/promocao-do-dia</strong> — escolha o layout,
          adicione quantos produtos quiser e publique com um link.
        </p>
        <p className="promotions-teaser-price">
          A partir de <strong>R$ 49,99/mês</strong>
        </p>
        <button type="button" onClick={onRequest} disabled={requesting} className="btn btn-primary w-full justify-center">
          {requesting ? 'Enviando…' : 'Solicitar contratação'}
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = 'rose' }) {
  const tones = {
    rose: { background: '#fff1f2', color: '#be123c' },
    emerald: { background: '#ecfdf5', color: '#047857' },
    amber: { background: '#fffbeb', color: '#b45309' },
  };
  const toneStyle = tones[tone] || tones.rose;
  // #region agent log
  fetch('http://127.0.0.1:7724/ingest/bad965a0-035a-443e-b04a-77662340ce52',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2819bc'},body:JSON.stringify({sessionId:'2819bc',runId:'post-fix',location:'Promotions.jsx:StatCard',message:'StatCard render',data:{tone,styleType:typeof toneStyle},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return (
    <div className="promotions-stat">
      <div className="promotions-stat-icon" style={toneStyle}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="promotions-stat-value">{value}</div>
      <div className="promotions-stat-label">{label}</div>
    </div>
  );
}

function PromotionCard({ promo, onEdit, onDelete }) {
  const itemCount = promo.contentJson?.items?.length;
  return (
    <article className="promotions-card">
      <div>
        <h3 className="promotions-card-title">{promo.title}</h3>
        <div className="promotions-card-meta">
          <span className={`promotions-status promotions-status--${promo.status || 'draft'}`}>
            {STATUS_LABELS[promo.status] || promo.status}
          </span>
          <span className={`promotions-layout-tag promotions-layout-tag--${promo.layoutCategory || 'product'}`}>
            {promo.layoutName}
          </span>
          {itemCount != null && (
            <span className="text-xs text-stone-500">{itemCount} itens</span>
          )}
        </div>
      </div>
      <div className="promotions-card-vigencia">
        {promo.startsAt ? formatDateTimeBr(promo.startsAt) : 'Sem início'}
        {promo.expiresAt && (
          <>
            <span className="hidden sm:inline"> → </span>
            <br className="sm:hidden" />
            {formatDateTimeBr(promo.expiresAt)}
          </>
        )}
      </div>
      <div className="promotions-card-actions">
        <button type="button" onClick={() => onEdit(promo)} className="btn btn-secondary !px-3 !py-1.5 text-xs">
          <Pencil className="w-3.5 h-3.5" />
          Editar
        </button>
        <button type="button" onClick={() => onDelete(promo.id)} className="btn btn-danger !px-3 !py-1.5 text-xs">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}

export default function Promotions() {
  const [feature, setFeature] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const statusRes = await api.get('/api/features/status');
      setFeature(statusRes.data);
      // #region agent log
      fetch('http://127.0.0.1:7724/ingest/bad965a0-035a-443e-b04a-77662340ce52',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2819bc'},body:JSON.stringify({sessionId:'2819bc',location:'Promotions.jsx:load',message:'feature status loaded',data:{active:statusRes.data?.active,reason:statusRes.data?.reason},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      if (statusRes.data.active) {
        const [promoRes, layoutRes, analyticsRes] = await Promise.all([
          api.get('/api/promotions'),
          api.get('/api/promotions/layouts'),
          api.get('/api/promotions/analytics'),
        ]);
        setPromotions(promoRes.data);
        setLayouts(layoutRes.data);
        setAnalytics(analyticsRes.data);
        // #region agent log
        fetch('http://127.0.0.1:7724/ingest/bad965a0-035a-443e-b04a-77662340ce52',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2819bc'},body:JSON.stringify({sessionId:'2819bc',location:'Promotions.jsx:load',message:'analytics loaded — StatCard will render',data:{views:analyticsRes.data?.views},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      }
    } catch (e) {
      if (e.response?.status !== 403) dialog.alert(apiErrorMessage(e));
      setFeature({ active: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const openNew = () => {
    setEditingPromo(null);
    setEditorOpen(true);
  };

  const openEdit = async (promo) => {
    try {
      const res = await api.get(`/api/promotions/${promo.id}`);
      setEditingPromo(res.data);
      setEditorOpen(true);
    } catch (e) {
      dialog.alert(apiErrorMessage(e));
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

  const copyLink = async () => {
    await navigator.clipboard.writeText(vitrineUrl());
    dialog.alert('Link copiado!');
  };

  if (loading) {
    return (
      <div className="page-content flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!feature?.active) {
    // #region agent log
    fetch('http://127.0.0.1:7724/ingest/bad965a0-035a-443e-b04a-77662340ce52',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2819bc'},body:JSON.stringify({sessionId:'2819bc',location:'Promotions.jsx:render',message:'rendering FeatureTeaser (inactive)',data:{active:feature?.active},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return (
      <div className="promotions-page">
        <FeatureTeaser onRequest={requestFeature} requesting={requesting} />
      </div>
    );
  }

  const url = vitrineUrl();

  return (
    <div className="promotions-page">
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 promotions-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-rose-600" />
            Promoções
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monte sua vitrine — adicione quantos itens quiser
          </p>
        </div>
        <button type="button" onClick={openNew} className="btn btn-primary shrink-0">
          <Plus className="w-4 h-4" />
          Nova promoção
        </button>
      </div>

      <div className="page-content space-y-5">
        <div className="promotions-link-strip">
          <Link2 className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="promotions-link-strip-label">Sua vitrine</span>
          <span className="promotions-link-strip-url" title={url}>{url}</span>
          <button type="button" onClick={copyLink} className="btn btn-secondary !py-1.5 !px-3 text-xs shrink-0">
            <Copy className="w-3.5 h-3.5" />
            Copiar
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary !py-1.5 !px-3 text-xs shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir
          </a>
        </div>

        {analytics && (
          <div className="promotions-stats">
            <StatCard icon={Eye} label="Views (30d)" value={analytics.views} tone="rose" />
            <StatCard icon={Eye} label="Hoje" value={analytics.viewsToday} tone="emerald" />
            <StatCard icon={MousePointer} label="Cliques WA" value={analytics.clicks} tone="amber" />
            <StatCard icon={MessageCircle} label="Leads" value={analytics.leads} tone="emerald" />
          </div>
        )}

        <section>
          <div className="promotions-list-header">
            <h2>Suas promoções ({promotions.length})</h2>
          </div>

          {promotions.length === 0 ? (
            <div className="promotions-empty">
              <div className="promotions-empty-icon">
                <Sparkles className="w-6 h-6" />
              </div>
              <p>Escolha um layout, adicione fotos e textos — publique quando estiver pronto.</p>
              <button type="button" onClick={openNew} className="btn btn-primary">
                <Plus className="w-4 h-4" />
                Criar promoção
              </button>
            </div>
          ) : (
            <div className="promotions-cards">
              {promotions.map((p) => (
                <PromotionCard key={p.id} promo={p} onEdit={openEdit} onDelete={removePromotion} />
              ))}
            </div>
          )}
        </section>

        {analytics?.recentLeads?.length > 0 && (
          <section className="promotions-leads">
            <div className="promotions-leads-header">
              <BarChart2 className="w-4 h-4 text-rose-600" />
              Leads recentes
            </div>
            {analytics.recentLeads.map((l) => (
              <div key={l.id} className="promotions-lead-row">
                <span className="promotions-lead-msg">{l.message || 'Clique no WhatsApp'}</span>
                <span className="promotions-lead-time">{formatDateTimeBr(l.createdAt)}</span>
              </div>
            ))}
          </section>
        )}
      </div>

      {editorOpen && (
        <PromotionEditor
          layouts={layouts}
          initial={editingPromo}
          onClose={() => { setEditorOpen(false); setEditingPromo(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
}
