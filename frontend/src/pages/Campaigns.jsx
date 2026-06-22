import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Pencil, Trash2, Image, Eye, EyeOff, ToggleLeft, ToggleRight, Info, Upload, ImagePlus, RefreshCw } from 'lucide-react';
import api from '../api';
import { dialog } from '../utils/dialog';
import { MSG } from '../utils/messages';
import { renderWhatsAppLikeText } from '../utils/whatsappFormat';
import {
  CAMPAIGN_IMAGE_ACCEPT,
  CAMPAIGN_IMAGE_HINT,
  formatFileSize,
  validateCampaignImage,
  resolveCampaignImageUrl,
} from '../utils/upload';

const VARIABLES = [
  { key: '{nome}', label: 'Nome', example: 'João' },
  { key: '{evento}', label: 'Evento', example: 'Festa' },
  { key: '{data}', label: 'Data', example: '28/06' },
  { key: '{horario}', label: 'Horário', example: '19h' },
  { key: '{local}', label: 'Local', example: 'Rua das Flores' },
];

const EMPTY_FORM = {
  name: '',
  text: '',
  appendOptOut: false,
  optOutText: 'Para não receber mais mensagens, responda *SAIR*',
  imagePath: '',
};

function buildPreview(text, optOut, optOutText) {
  let preview = text
    .replace(/\{nome\}/gi, 'João')
    .replace(/\{evento\}/gi, 'Aniversário')
    .replace(/\{data\}/gi, '28/06/2025')
    .replace(/\{horario\}/gi, '19h00')
    .replace(/\{local\}/gi, 'Rua das Flores, 100');
  if (optOut && optOutText) preview += `\n\n${optOutText}`;
  return preview;
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CampaignImageUpload({ image, imageError, savedImagePath, onSelect, inputId }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);
  const [savedPreview, setSavedPreview] = useState(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (image) {
      const url = URL.createObjectURL(image);
      setLocalPreview(url);
      setLoadError(false);
      return () => URL.revokeObjectURL(url);
    }
    setLocalPreview(null);
    return undefined;
  }, [image]);

  useEffect(() => {
    setLoadError(false);
    setSavedPreview(savedImagePath ? resolveCampaignImageUrl(savedImagePath) : null);
  }, [savedImagePath]);

  const displaySrc = localPreview || (!loadError ? savedPreview : null);
  const hasImage = Boolean(displaySrc);
  const isNewFile = Boolean(image);
  const isExisting = Boolean(!image && savedImagePath);
  const pickFile = () => inputRef.current?.click();

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onSelect(file);
  }, [onSelect]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <ImagePlus className="w-4 h-4 text-brand-600" />
          Imagem do convite
        </label>
        <span className="text-[11px] font-medium uppercase tracking-wide text-brand-600 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full">
          Opcional
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={pickFile}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pickFile(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          'relative rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden',
          dragOver
            ? 'border-brand-500 bg-brand-50/80 scale-[1.01] shadow-md'
            : hasImage
              ? 'border-brand-300 bg-white'
              : 'border-slate-300 bg-gradient-to-br from-slate-50 to-brand-50/40 hover:border-brand-400 hover:bg-brand-50/50',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={CAMPAIGN_IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => { onSelect(e.target.files[0] || null); e.target.value = ''; }}
        />

        {hasImage ? (
          <div className="relative group">
            <img
              src={displaySrc}
              alt="Pré-visualização"
              className="w-full max-h-48 object-cover"
              onError={() => setLoadError(true)}
            />
            <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/95 text-sm font-medium text-slate-800 shadow-lg">
                <RefreshCw className="w-3.5 h-3.5" />
                {isExisting ? 'Trocar' : 'Escolher outra'}
              </span>
            </div>
            <div className="absolute top-2 left-2">
              {isNewFile && <span className="text-[10px] font-semibold uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow">Nova</span>}
              {isExisting && !isNewFile && <span className="text-[10px] font-semibold uppercase bg-slate-800/75 text-white px-2 py-0.5 rounded-full shadow">Salva</span>}
            </div>
          </div>
        ) : loadError && savedImagePath ? (
          <div className="p-6 text-center space-y-2">
            <Image className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="text-sm text-slate-600">Não carregou — envie novamente</p>
          </div>
        ) : (
          <div className="p-6 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-xl bg-brand-100 border border-brand-200 flex items-center justify-center">
              <Upload className="w-6 h-6 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Toque para adicionar imagem</p>
              <p className="text-xs text-slate-500 mt-0.5">{CAMPAIGN_IMAGE_HINT}</p>
            </div>
          </div>
        )}
      </div>

      {image && !imageError && (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5">
          <CheckIcon /> {image.name} · {formatFileSize(image.size)}
        </p>
      )}
      {imageError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{imageError}</p>
      )}
    </div>
  );
}

function PreviewImage({ src }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);
  if (err) return null;
  return (
    <img src={src} alt="Imagem do template" className="mb-2 rounded-md w-full object-cover max-h-40" onError={() => setErr(true)} />
  );
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [editing, setEditing] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const uploadInputId = 'campaign-image-upload';

  const load = async () => { const r = await api.get('/api/campaigns'); setCampaigns(r.data); };
  useEffect(() => { load(); }, []);

  const [previewSrc, setPreviewSrc] = useState(null);
  useEffect(() => {
    if (image) {
      const url = URL.createObjectURL(image);
      setPreviewSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewSrc(form.imagePath ? resolveCampaignImageUrl(form.imagePath) : null);
    return undefined;
  }, [image, form.imagePath]);

  const handleImageSelect = (selected) => {
    if (!selected) { setImage(null); setImageError(''); return; }
    const result = validateCampaignImage(selected);
    if (!result.ok) { setImage(null); setImageError(result.error); return; }
    setImageError('');
    setImage(selected);
  };

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setImage(null);
    setImageError('');
    setShowPreview(false);
  };

  const save = async (e) => {
    e.preventDefault();
    if (imageError) return;
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('text', form.text);
    fd.append('appendOptOut', form.appendOptOut);
    fd.append('optOutText', form.optOutText);
    if (image) fd.append('image', image);
    if (editing) { await api.put(`/api/campaigns/${editing}`, fd); }
    else { await api.post('/api/campaigns', fd); }
    resetForm();
    load();
  };

  const remove = async (id) => {
    if (!(await dialog.confirm({ title: 'Remover template', message: MSG.removeTemplate, danger: true }))) return;
    await api.delete(`/api/campaigns/${id}`);
    if (editing === id) resetForm();
    load();
  };

  const edit = (c) => {
    setEditing(c._id);
    setImage(null);
    setImageError('');
    setShowPreview(false);
    setForm({
      name: c.name,
      text: c.text,
      appendOptOut: c.appendOptOut || false,
      optOutText: c.optOutText || 'Para não receber mais mensagens, responda *SAIR*',
      imagePath: c.imagePath || '',
    });
    // scroll to top on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const preview = buildPreview(form.text, form.appendOptOut, form.optOutText);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Templates de mensagem</h1>
          <p className="text-sm text-slate-500 mt-0.5">Crie e edite modelos de convite</p>
        </div>
      </div>

      <div className="page-content">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          {/* Form card — always first on mobile */}
          <div className="card p-4 sm:p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-600" />
              {editing ? 'Editar template' : 'Novo template'}
            </h2>

            <form onSubmit={save} className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome do template</label>
                <input
                  className="input w-full"
                  placeholder="Ex: Convite Casamento Junho"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              {/* Imagem */}
              <CampaignImageUpload
                inputId={uploadInputId}
                image={image}
                imageError={imageError}
                savedImagePath={form.imagePath}
                onSelect={handleImageSelect}
              />

              {/* Variables — horizontal scroll on mobile */}
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Toque para inserir variável:</p>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {VARIABLES.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm({ ...form, text: form.text + key })}
                      className="flex-none px-2.5 py-1.5 text-xs rounded-lg bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 active:bg-brand-200 transition-colors font-mono whitespace-nowrap"
                      title={label}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Texto */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Texto da mensagem</label>
                <textarea
                  className="input w-full resize-none"
                  rows={4}
                  placeholder="Olá {nome}! Você está convidado para {evento} no dia {data} às {horario} em {local}."
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                  required
                />
              </div>

              {/* Opt-out */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, appendOptOut: !form.appendOptOut })}
                  className="flex items-center gap-2 w-full text-left"
                >
                  {form.appendOptOut
                    ? <ToggleRight className="w-5 h-5 text-brand-600 shrink-0" />
                    : <ToggleLeft className="w-5 h-5 text-slate-400 shrink-0" />}
                  <span className="text-sm font-medium text-slate-700">Adicionar aviso de opt-out</span>
                </button>
                {form.appendOptOut && (
                  <input
                    className="input text-xs w-full"
                    value={form.optOutText}
                    onChange={(e) => setForm({ ...form, optOutText: e.target.value })}
                  />
                )}
              </div>

              {/* Preview toggle — mobile only */}
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="xl:hidden w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPreview ? 'Ocultar preview' : 'Ver preview da mensagem'}
              </button>

              {/* Inline preview — visible on mobile when toggled */}
              {showPreview && (
                <div className="xl:hidden space-y-2">
                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Variáveis substituídas por valores de exemplo
                  </div>
                  <div className="bg-[#e5ddd5] rounded-xl p-3 min-h-[100px]">
                    {(form.text || previewSrc) ? (
                      <div className="max-w-xs ml-auto bg-[#dcf8c6] rounded-lg px-3 py-2 shadow-sm">
                        {previewSrc && <PreviewImage src={previewSrc} />}
                        <div className="text-sm text-slate-800 whitespace-pre-wrap">
                          {renderWhatsAppLikeText(preview)}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-20 text-sm text-slate-500">
                        Digite o texto para ver o preview
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn-primary flex-1 justify-center"
                  disabled={Boolean(imageError)}
                >
                  <Plus className="w-4 h-4" />
                  {editing ? 'Salvar alterações' : 'Criar template'}
                </button>
                {editing && (
                  <button type="button" className="btn-secondary px-4" onClick={resetForm}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Desktop preview panel — hidden on mobile */}
          <div className="hidden xl:flex flex-col card p-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Eye className="w-4 h-4 text-brand-600" />
              Preview da mensagem
            </h2>
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Variáveis substituídas por valores de exemplo
            </div>
            <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-[200px]">
              {(form.text || previewSrc) ? (
                <div className="max-w-xs ml-auto bg-[#dcf8c6] rounded-lg px-3 py-2 shadow-sm">
                  {previewSrc && <PreviewImage src={previewSrc} />}
                  <div className="text-sm text-slate-800 whitespace-pre-wrap">
                    {renderWhatsAppLikeText(preview)}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-500">
                  Digite o texto para ver o preview
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {VARIABLES.map(({ key, label, example }) => (
                <div key={key} className="flex items-center gap-2 text-xs text-slate-500">
                  <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{key}</code>
                  <span>→</span><span className="text-slate-400">{label} (ex: {example})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Templates list */}
        {campaigns.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Templates criados ({campaigns.length})</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {campaigns.map((c) => (
                <div key={c._id} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
                  {c.imagePath && (
                    <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                      <img
                        src={resolveCampaignImageUrl(c.imagePath)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">{c.name}</span>
                      {c.appendOptOut && <span className="badge-blue text-[10px]">opt-out</span>}
                      {c.imagePath && <span className="badge-gray text-[10px]"><Image className="w-2.5 h-2.5" />img</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{c.text}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => edit(c)}
                      className="p-2.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(c._id)}
                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
