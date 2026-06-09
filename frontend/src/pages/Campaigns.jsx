import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Image, Eye, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import api from '../api';
import { dialog } from '../utils/dialog';
import { MSG } from '../utils/messages';
import { renderWhatsAppLikeText } from '../utils/whatsappFormat';
import {
  CAMPAIGN_IMAGE_ACCEPT,
  CAMPAIGN_IMAGE_HINT,
  formatFileSize,
  validateCampaignImage,
} from '../utils/upload';

const API_URL = import.meta.env.VITE_API_URL || '';

const VARIABLES = [
  { key: '{nome}', label: 'Nome do contato', example: 'João' },
  { key: '{evento}', label: 'Nome do evento', example: 'Festa de Aniversário' },
  { key: '{data}', label: 'Data', example: '28/06/2025' },
  { key: '{horario}', label: 'Horário', example: '19h00' },
  { key: '{local}', label: 'Local', example: 'Rua das Flores, 100' },
];

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

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState({
    name: '', text: '', appendOptOut: false,
    optOutText: 'Para não receber mais mensagens, responda *SAIR*',
  });
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => { const r = await api.get('/api/campaigns'); setCampaigns(r.data); };
  useEffect(() => { load(); }, []);

  // Preview da imagem: arquivo recém-escolhido (objectURL) ou a já salva no template.
  useEffect(() => {
    if (image) {
      const url = URL.createObjectURL(image);
      setImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setImagePreview(form.imagePath ? `${API_URL}/${form.imagePath}` : null);
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

  const save = async (e) => {
    e.preventDefault();
    if (imageError) return;
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('text', form.text);
    fd.append('appendOptOut', form.appendOptOut);
    fd.append('optOutText', form.optOutText);
    if (image) fd.append('image', image);
    if (editing) { await api.put(`/api/campaigns/${editing}`, fd); setEditing(null); }
    else { await api.post('/api/campaigns', fd); }
    setForm({ name: '', text: '', appendOptOut: false, optOutText: 'Para não receber mais mensagens, responda *SAIR*' });
    setImage(null);
    setImageError('');
    load();
  };

  const remove = async (id) => {
    if (!(await dialog.confirm({ title: 'Remover template', message: MSG.removeTemplate, danger: true }))) return;
    await api.delete(`/api/campaigns/${id}`); load();
  };

  const edit = (c) => {
    setEditing(c._id);
    setImage(null);
    setImageError('');
    setForm({
      name: c.name, text: c.text,
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
          {/* Form */}
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

              {/* Variable chips */}
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

              {/* Opt-out toggle */}
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

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Imagem (opcional)</label>
                <input
                  type="file"
                  accept={CAMPAIGN_IMAGE_ACCEPT}
                  onChange={(e) => {
                    handleImageSelect(e.target.files[0] || null);
                    e.target.value = '';
                  }}
                  className="block w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">{CAMPAIGN_IMAGE_HINT}</p>
                {image && !imageError && (
                  <p className="mt-1 text-[11px] text-emerald-700">
                    {image.name} · {formatFileSize(image.size)}
                  </p>
                )}
                {imageError && (
                  <p className="mt-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
                    {imageError}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={Boolean(imageError)}>
                  <Plus className="w-4 h-4" />
                  {editing ? 'Salvar alterações' : 'Criar template'}
                </button>
                {editing && (
                  <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setForm({ name: '', text: '', appendOptOut: false, optOutText: 'Para não receber mais mensagens, responda *SAIR*' }); }}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Preview */}
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
              {(form.text || imagePreview) ? (
                <div className="max-w-xs ml-auto bg-[#dcf8c6] rounded-lg px-3 py-2 shadow-sm">
                  {imagePreview && (
                    <img src={imagePreview} alt="Imagem do template"
                      className="mb-2 rounded-md w-full object-cover max-h-48" />
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

        {/* Campaign list */}
        {campaigns.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">Templates criados</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {campaigns.map((c) => (
                <div key={c._id} className="px-6 py-4 flex items-start gap-4">
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
