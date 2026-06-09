import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Pencil, Trash2, Image, Eye, ToggleLeft, ToggleRight, Info, Upload, ImagePlus, RefreshCw } from 'lucide-react';
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
  { key: '{nome}', label: 'Nome do contato', example: 'João' },
  { key: '{evento}', label: 'Nome do evento', example: 'Festa de Aniversário' },
  { key: '{data}', label: 'Data', example: '28/06/2025' },
  { key: '{horario}', label: 'Horário', example: '19h00' },
  { key: '{local}', label: 'Local', example: 'Rua das Flores, 100' },
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

function CampaignImageUpload({
  image,
  imageError,
  savedImagePath,
  onSelect,
  inputId,
}) {
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
      <p className="text-xs text-slate-500 leading-relaxed">
        Convites com imagem chamam mais atenção no WhatsApp. Você pode anexar um flyer, foto do evento ou arte promocional.
      </p>

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
          onChange={(e) => {
            onSelect(e.target.files[0] || null);
            e.target.value = '';
          }}
        />

        {hasImage ? (
          <div className="relative group">
            <img
              src={displaySrc}
              alt="Pré-visualização da imagem do template"
              className="w-full max-h-56 object-cover"
              onError={() => setLoadError(true)}
            />
            <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/95 text-sm font-medium text-slate-800 shadow-lg">
                <RefreshCw className="w-4 h-4" />
                {isExisting ? 'Trocar imagem' : 'Escolher outra'}
              </span>
            </div>
            <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
              {isNewFile && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow">
                  Nova imagem
                </span>
              )}
              {isExisting && !isNewFile && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-800/75 text-white px-2 py-0.5 rounded-full shadow">
                  Imagem salva
                </span>
              )}
            </div>
          </div>
        ) : loadError && savedImagePath ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
              <Image className="w-6 h-6 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-slate-700">Não foi possível carregar a imagem salva</p>
            <p className="text-xs text-slate-500">Envie novamente para atualizar o template.</p>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-700">
              <Upload className="w-4 h-4" />
              Clique para enviar outra imagem
            </span>
          </div>
        ) : (
          <div className="p-8 sm:p-10 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-100 border border-brand-200 flex items-center justify-center shadow-inner">
              <Upload className="w-7 h-7 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Clique ou arraste uma imagem aqui
              </p>
              <p className="text-xs text-slate-500 mt-1">{CAMPAIGN_IMAGE_HINT}</p>
            </div>
          </div>
        )}
      </div>

      {image && !imageError && (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5">
          <CheckIcon />
          {image.name} · {formatFileSize(image.size)}
        </p>
      )}
      {imageError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {imageError}
        </p>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [editing, setEditing] = useState(null);
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
    if (!selected) {
      setImage(null);
      setImageError('');
      return;
    }
    const result = validateCampaignImage(selected);
    if (!result.ok) {
      setImage(null);
      setImageError(result.error);
      return;
    }
    setImageError('');
    setImage(selected);
  };

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setImage(null);
    setImageError('');
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
    setForm({
      name: c.name,
      text: c.text,
      appendOptOut: c.appendOptOut || false,
      optOutText: c.optOutText || 'Para não receber mais mensagens, responda *SAIR*',
      imagePath: c.imagePath || '',
    });
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-600" />
              {editing ? 'Editar template' : 'Novo template'}
            </h2>

            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome do template</label>
                <input className="input" placeholder="Ex: Convite Casamento Junho" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>

              <CampaignImageUpload
                inputId={uploadInputId}
                image={image}
                imageError={imageError}
                savedImagePath={form.imagePath}
                onSelect={handleImageSelect}
              />

              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map(({ key }) => (
                  <button key={key} type="button"
                    onClick={() => setForm({ ...form, text: form.text + key })}
                    className="px-2 py-1 text-xs rounded-md bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition-colors font-mono">
                    {key}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Texto da mensagem</label>
                <textarea className="input min-h-[120px] resize-none" rows={5}
                  placeholder="Olá {nome}! Você está convidado para {evento} no dia {data} às {horario} em {local}."
                  value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} required />
              </div>

              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <button type="button" onClick={() => setForm({ ...form, appendOptOut: !form.appendOptOut })}
                  className="flex items-center gap-2 w-full text-left">
                  {form.appendOptOut
                    ? <ToggleRight className="w-5 h-5 text-brand-600 shrink-0" />
                    : <ToggleLeft className="w-5 h-5 text-slate-400 shrink-0" />}
                  <span className="text-sm font-medium text-slate-700">Adicionar aviso de opt-out</span>
                </button>
                {form.appendOptOut && (
                  <input className="input text-xs" value={form.optOutText}
                    onChange={(e) => setForm({ ...form, optOutText: e.target.value })} />
                )}
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={Boolean(imageError)}>
                  <Plus className="w-4 h-4" />
                  {editing ? 'Salvar alterações' : 'Criar template'}
                </button>
                {editing && (
                  <button type="button" className="btn-secondary" onClick={resetForm}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card p-6 space-y-3">
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
                  {previewSrc && (
                    <PreviewImage src={previewSrc} />
                  )}
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

        {campaigns.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Templates criados</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {campaigns.map((c) => (
                <div key={c._id} className="px-6 py-4 flex items-start gap-4">
                  {c.imagePath && (
                    <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                      <img
                        src={resolveCampaignImageUrl(c.imagePath)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">{c.name}</span>
                      {c.appendOptOut && <span className="badge-blue">opt-out</span>}
                      {c.imagePath && <span className="badge-gray"><Image className="w-3 h-3" />imagem</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">{c.text}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => edit(c)} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(c._id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remover">
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

function PreviewImage({ src }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [src]);
  if (err) return null;
  return (
    <img
      src={src}
      alt="Imagem do template"
      className="mb-2 rounded-md w-full object-cover max-h-48"
      onError={() => setErr(true)}
    />
  );
}
