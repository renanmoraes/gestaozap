import React, { useState, useMemo, useRef } from 'react';
import {
  Plus, Trash2, GripVertical, Upload, Save, X, Calendar,
  ChevronUp, ChevronDown, ImagePlus, Loader2, Smartphone,
} from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage } from '../../utils/messages';
import { resolveCampaignImageUrl } from '../../utils/upload';
import LayoutMockup from './LayoutMockup';
import DynamicPatternRenderer from './DynamicPatternRenderer';
import {
  PATTERNS, getLayoutPattern, getLayoutPatternId, createEmptyItem, createDefaultContent,
} from './layoutPatterns';
import { normalizePromotionContent, getPatternFromLayout } from './normalizeContent';

function ItemEditor({
  item, index, pattern, onChange, onRemove, onMoveUp, onMoveDown, onUpload, uploading,
  canRemove, fixedLabel,
}) {
  const inputRef = useRef(null);
  const preview = item.mediaPath ? resolveCampaignImageUrl(item.mediaPath) : null;
  const showPrices = pattern.showPrices;

  return (
    <div className="promo-editor-item">
      <div className="promo-editor-item-header">
        <GripVertical className="w-4 h-4 text-stone-300 shrink-0" />
        <span className="promo-editor-item-num">
          {fixedLabel || `#${index + 1}`}
        </span>
        <div className="promo-editor-item-actions">
          <button type="button" onClick={onMoveUp} disabled={index === 0} className="promo-editor-icon-btn" title="Subir">
            <ChevronUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={onMoveDown} className="promo-editor-icon-btn" title="Descer">
            <ChevronDown className="w-4 h-4" />
          </button>
          {canRemove && (
            <button type="button" onClick={onRemove} className="promo-editor-icon-btn promo-editor-icon-btn--danger" title="Remover">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="promo-editor-item-grid">
        <button
          type="button"
          className="promo-editor-upload"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {preview ? (
            item.mediaType === 'video'
              ? <video src={preview} className="promo-editor-upload-preview" muted />
              : <img src={preview} alt="" className="promo-editor-upload-preview" />
          ) : (
            <>
              <ImagePlus className="w-6 h-6 text-stone-400" />
              <span>{uploading ? 'Enviando…' : 'Foto ou vídeo'}</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />

        <div className="promo-editor-fields">
          <input
            className="input"
            placeholder="Nome do produto ou serviço"
            value={item.title}
            onChange={(e) => onChange({ ...item, title: e.target.value })}
          />
          <textarea
            className="input min-h-[72px] resize-y"
            placeholder="Descrição curta (opcional)"
            value={item.description}
            onChange={(e) => onChange({ ...item, description: e.target.value })}
          />
          {showPrices && (
            <div className="promo-editor-prices">
              <input
                className="input"
                placeholder="De R$"
                value={item.priceOriginal}
                onChange={(e) => onChange({ ...item, priceOriginal: e.target.value })}
              />
              <input
                className="input"
                placeholder="Por R$"
                value={item.priceDiscount}
                onChange={(e) => onChange({ ...item, priceDiscount: e.target.value })}
              />
            </div>
          )}
          <input
            className="input text-sm"
            placeholder="Mensagem WhatsApp (opcional)"
            value={item.ctaText}
            onChange={(e) => onChange({ ...item, ctaText: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

export default function PromotionEditor({
  layouts,
  initial,
  onClose,
  onSaved,
}) {
  const [phase, setPhase] = useState(initial?.layoutId ? 'edit' : 'pick-layout');
  const [layoutId, setLayoutId] = useState(initial?.layoutId || '');
  const [title, setTitle] = useState(initial?.title || 'Promoção do dia');
  const [startsAt, setStartsAt] = useState(initial?.startsAt?.slice?.(0, 16) || '');
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt?.slice?.(0, 16) || '');
  const [content, setContent] = useState(() => {
    if (initial?.contentJson) {
      const layout = layouts.find((l) => l.id === initial.layoutId);
      return normalizePromotionContent(initial.contentJson, layout);
    }
    return null;
  });
  const [categoryFilter, setCategoryFilter] = useState('product');
  const [uploading, setUploading] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const selectedLayout = useMemo(
    () => layouts.find((l) => l.id === layoutId),
    [layouts, layoutId],
  );

  const pattern = selectedLayout ? getLayoutPattern(selectedLayout) : null;
  const patternId = selectedLayout ? getLayoutPatternId(selectedLayout) : null;

  const filteredLayouts = useMemo(
    () => layouts.filter((l) => getLayoutPattern(l).category === categoryFilter),
    [layouts, categoryFilter],
  );

  const pickLayout = (id) => {
    const layout = layouts.find((l) => l.id === id);
    setLayoutId(id);
    setContent(createDefaultContent(getPatternFromLayout(layout), layout.category));
    setPhase('edit');
  };

  const uploadFile = async (file, target, itemId = null) => {
    setUploading(itemId || target);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/api/promotions/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const patch = { mediaPath: res.data.url, mediaType: res.data.mediaType };
      if (target === 'banner') {
        setContent((c) => ({ ...c, banner: { ...patch, title: 'Banner' } }));
      } else {
        setContent((c) => ({
          ...c,
          items: c.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
        }));
      }
    } catch (e) {
      dialog.alert(apiErrorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  const updateItem = (id, next) => {
    setContent((c) => ({
      ...c,
      items: c.items.map((it) => (it.id === id ? next : it)),
    }));
  };

  const removeItem = (id) => {
    if (content.items.length <= (pattern?.minItems || 1)) return;
    setContent((c) => ({ ...c, items: c.items.filter((it) => it.id !== id) }));
  };

  const moveItem = (index, dir) => {
    const next = [...content.items];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setContent((c) => ({ ...c, items: next }));
  };

  const addItem = () => {
    if (content.items.length >= (pattern?.maxItems || 24)) return;
    const label = pattern?.category === 'service' ? 'Serviço' : 'Produto';
    setContent((c) => ({
      ...c,
      items: [...c.items, createEmptyItem(`${label} ${c.items.length + 1}`)],
    }));
  };

  const save = async (publish) => {
    if (!layoutId || !content) return;
    setSaving(true);
    try {
      const payload = {
        title,
        layoutId,
        contentJson: content,
        startsAt: startsAt || null,
        expiresAt: expiresAt || null,
        status: publish
          ? (startsAt && new Date(startsAt) > new Date() ? 'scheduled' : 'active')
          : (initial?.status || 'draft'),
      };
      if (initial?.id) {
        await api.patch(`/api/promotions/${initial.id}`, payload);
      } else {
        await api.post('/api/promotions', payload);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      dialog.alert(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const bannerRef = useRef(null);

  return (
    <div className="promo-editor-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="promo-editor-shell" role="dialog" aria-modal="true">
        <header className="promo-editor-topbar">
          <div>
            <h2>{initial?.id ? 'Editar promoção' : 'Nova promoção'}</h2>
            {phase === 'edit' && selectedLayout && (
              <p>{selectedLayout.name} · {content?.items?.length || 0} itens</p>
            )}
          </div>
          <button type="button" className="promo-editor-close" onClick={onClose} aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </header>

        {phase === 'pick-layout' && (
          <div className="promo-editor-pick">
            <p className="promo-editor-pick-lead">Escolha como sua vitrine vai organizar os itens na tela:</p>
            <div className="promo-editor-category-tabs">
              {['product', 'service'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={categoryFilter === cat ? 'active' : ''}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat === 'product' ? 'Produtos' : 'Serviços'}
                </button>
              ))}
            </div>
            <div className="promo-editor-mockup-grid">
              {filteredLayouts.map((l) => {
                const pid = getLayoutPatternId(l);
                const meta = getLayoutPattern(l);
                return (
                  <button
                    key={l.id}
                    type="button"
                    className={`promo-editor-mockup-card ${layoutId === l.id ? 'selected' : ''}`}
                    onClick={() => pickLayout(l.id)}
                  >
                    <LayoutMockup patternId={pid} selected={layoutId === l.id} />
                    <strong>{l.name}</strong>
                    <span>{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {phase === 'edit' && content && selectedLayout && (
          <div className="promo-editor-split">
            <div className="promo-editor-form">
              <div className="promo-editor-section">
                <label className="promo-editor-label">Título da vitrine</label>
                <input
                  className="input"
                  value={content.headline}
                  onChange={(e) => setContent((c) => ({ ...c, headline: e.target.value }))}
                  placeholder="Ex: Semana do churrasco"
                />
              </div>
              <div className="promo-editor-section">
                <label className="promo-editor-label">Texto de apoio</label>
                <textarea
                  className="input min-h-[60px]"
                  value={content.subtitle}
                  onChange={(e) => setContent((c) => ({ ...c, subtitle: e.target.value }))}
                  placeholder="Chamada curta ou condições"
                />
              </div>

              {pattern?.hasBanner && (
                <div className="promo-editor-section">
                  <label className="promo-editor-label">Banner do topo</label>
                  <button
                    type="button"
                    className="promo-editor-upload promo-editor-upload--wide"
                    onClick={() => bannerRef.current?.click()}
                    disabled={uploading === 'banner'}
                  >
                    {content.banner?.mediaPath ? (
                      <img
                        src={resolveCampaignImageUrl(content.banner.mediaPath)}
                        alt=""
                        className="promo-editor-upload-preview promo-editor-upload-preview--banner"
                      />
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        <span>Imagem larga do banner</span>
                      </>
                    )}
                  </button>
                  <input
                    ref={bannerRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadFile(f, 'banner');
                      e.target.value = '';
                    }}
                  />
                </div>
              )}

              <div className="promo-editor-items-header">
                <span className="promo-editor-label">
                  {pattern?.category === 'service' ? 'Serviços' : 'Produtos'}
                  {' '}({content.items.length})
                </span>
                {patternId !== 'before-after' && (
                  <button type="button" onClick={addItem} className="promo-editor-add-btn">
                    <Plus className="w-4 h-4" />
                    Adicionar
                  </button>
                )}
              </div>

              <div className="promo-editor-items">
                {content.items.map((item, index) => (
                  <ItemEditor
                    key={item.id}
                    item={item}
                    index={index}
                    pattern={pattern}
                    fixedLabel={pattern?.fixedLabels?.[index]}
                    canRemove={content.items.length > (pattern?.minItems || 1)}
                    onChange={(next) => updateItem(item.id, next)}
                    onRemove={() => removeItem(item.id)}
                    onMoveUp={() => moveItem(index, -1)}
                    onMoveDown={() => moveItem(index, 1)}
                    onUpload={(file) => uploadFile(file, 'item', item.id)}
                    uploading={uploading === item.id}
                  />
                ))}
              </div>

              {patternId !== 'before-after' && content.items.length < (pattern?.maxItems || 24) && (
                <button type="button" onClick={addItem} className="promo-editor-add-block">
                  <Plus className="w-5 h-5" />
                  Adicionar {pattern?.category === 'service' ? 'serviço' : 'produto'}
                </button>
              )}

              <button
                type="button"
                className="promo-editor-schedule-toggle"
                onClick={() => setShowSchedule((s) => !s)}
              >
                <Calendar className="w-4 h-4" />
                {showSchedule ? 'Ocultar agendamento' : 'Agendar vigência'}
              </button>

              {showSchedule && (
                <div className="promo-editor-schedule">
                  <div>
                    <label>Início</label>
                    <input type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                  </div>
                  <div>
                    <label>Fim</label>
                    <input type="datetime-local" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            <div className="promo-editor-preview-pane">
              <div className="promo-editor-preview-label">
                <Smartphone className="w-4 h-4" />
                Preview mobile
              </div>
              <div className="promo-editor-preview-device">
                <div className="promo-preview-shell">
                  <div className="promo-promotion-block">
                    <DynamicPatternRenderer
                      layout={selectedLayout}
                      content={content}
                      phone="5511999999999"
                    />
                  </div>
                </div>
              </div>
              <button type="button" className="promo-editor-change-layout" onClick={() => setPhase('pick-layout')}>
                Trocar layout
              </button>
            </div>
          </div>
        )}

        {phase === 'edit' && (
          <footer className="promo-editor-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => save(false)}>
                Salvar rascunho
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Publicar
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
