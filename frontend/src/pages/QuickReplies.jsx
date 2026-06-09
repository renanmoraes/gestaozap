import React, { useState, useEffect } from 'react';
import {
  Zap, Plus, Edit2, Trash2, Save, X, Search, TrendingUp,
  AlertCircle, Lightbulb, RefreshCw, Copy, CheckCircle2,
} from 'lucide-react';
import api from '../api';
import { formatTemplateDateBr, formatTemplateTimeBr } from '../utils/timezone';

const VARS_BUILTIN = [
  { tag: '{nome}',     desc: 'Nome do contato com quem você está conversando',  auto: true },
  { tag: '{data}',     desc: 'Data de hoje, automática (ex: 04/06/2026)',       auto: true },
  { tag: '{hora}',     desc: 'Hora atual, automática (ex: 14:35)',              auto: true },
  { tag: '{evento}',   desc: 'Nome do evento — você preenche na hora',          auto: false },
  { tag: '{horario}',  desc: 'Horário do evento — você preenche na hora',       auto: false },
  { tag: '{local}',    desc: 'Local — você preenche na hora',                   auto: false },
];

function highlightVars(text) {
  // Quebra texto em pedaços, destacando variáveis {algo}
  const parts = String(text || '').split(/(\{[a-z0-9_-]+\})/gi);
  return parts.map((p, i) =>
    /^\{[a-z0-9_-]+\}$/i.test(p)
      ? <span key={i} className="bg-brand-100 text-brand-700 px-1 rounded font-mono text-[0.95em]">{p}</span>
      : <span key={i}>{p}</span>
  );
}

function PreviewBubble({ body }) {
  // Substitui variáveis automáticas para mostrar como o cliente verá
  const now = new Date();
  const data = formatTemplateDateBr(now);
  const hora = formatTemplateTimeBr(now);
  const sample = String(body || '')
    .replace(/\{nome\}/gi, 'Maria')
    .replace(/\{data\}/gi, data)
    .replace(/\{hora\}/gi, hora);
  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl rounded-br-sm px-3 py-2 text-sm text-emerald-900 whitespace-pre-wrap max-w-md">
      {sample || <span className="text-emerald-700/50 italic">Digite a mensagem ao lado para ver o preview…</span>}
    </div>
  );
}

function QuickReplyForm({ reply, onSave, onCancel, error }) {
  const [shortcut, setShortcut] = useState(reply?.shortcut || '/');
  const [title, setTitle]       = useState(reply?.title || '');
  const [body, setBody]         = useState(reply?.body || '');
  const [saving, setSaving]     = useState(false);

  const isEdit = Boolean(reply?.id);

  const handleShortcut = (v) => {
    let cleaned = v.toLowerCase().replace(/\s/g, '');
    if (!cleaned.startsWith('/')) cleaned = `/${cleaned}`;
    cleaned = '/' + cleaned.slice(1).replace(/[^a-z0-9_-]/g, '');
    setShortcut(cleaned.slice(0, 31));
  };

  const insertVar = (tag) => {
    setBody((b) => (b + ' ' + tag).trim());
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ shortcut, title: title.trim(), body: body.trim() });
    setSaving(false);
  };

  const usedVars = Array.from(new Set((body.match(/\{[a-z0-9_-]+\}/gi) || [])));

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isEdit ? 'Editar mensagem rápida' : 'Nova mensagem rápida'}
            </h2>
            <p className="text-xs text-slate-500">
              Digite <code className="text-[10px] bg-slate-100 px-1 rounded">/</code> no chat e o atalho — seu texto aparece pronto.
            </p>
          </div>
        </div>
        <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Atalho (começa com /)</label>
            <input
              className="input font-mono"
              placeholder="/preco"
              value={shortcut}
              onChange={(e) => handleShortcut(e.target.value)}
              required
              maxLength={31}
            />
            <p className="text-[10px] text-slate-400 mt-1">Letras minúsculas, números, hífen e underline. Sem espaços.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Título (para você lembrar)</label>
            <input
              className="input"
              placeholder="Resposta sobre preços"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Mensagem</label>
            <textarea
              className="input resize-none font-sans"
              rows={6}
              placeholder={"Oi {nome}! 👋\nNossos planos partem de R$ 97/mês. Posso te mandar mais detalhes?"}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={4000}
            />
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
              <span>{body.length}/4000 caracteres</span>
              {usedVars.length > 0 && (
                <span>Usando: {usedVars.join(', ')}</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Variáveis disponíveis</label>
            <div className="grid grid-cols-2 gap-2">
              {VARS_BUILTIN.map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => insertVar(v.tag)}
                  className="text-left p-2 rounded-lg border border-slate-200 hover:border-brand-400 hover:bg-brand-50 transition-all group"
                  title={v.desc}
                >
                  <div className="flex items-center gap-1.5">
                    <code className="text-xs font-mono font-semibold text-brand-600">{v.tag}</code>
                    {v.auto && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">auto</span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{v.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 flex gap-1 items-start">
              <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
              Clique para inserir. Variáveis <strong>auto</strong> são preenchidas sozinhas no chat.
              As outras você completa antes de enviar.
            </p>
          </div>
        </div>

        {/* Preview ao vivo */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Como o cliente verá</label>
            <div className="bg-slate-50 rounded-xl p-4 min-h-[220px] flex items-start justify-end">
              <PreviewBubble body={body} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 italic">
              Preview usando "Maria" como nome de exemplo, data e hora atuais.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
            <div className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-brand-600" />
              Como usar no chat
            </div>
            <ol className="text-slate-600 space-y-1 pl-5 list-decimal">
              <li>Abre uma conversa</li>
              <li>Digita <code className="text-[10px] bg-white px-1 rounded">{shortcut || '/preco'}</code> no campo de mensagem</li>
              <li>A mensagem aparece pronta</li>
              <li>Ajusta se precisar e envia</li>
            </ol>
          </div>
        </div>

        <div className="lg:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Salvar alterações' : 'Criar mensagem'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function QuickReplies() {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [editing, setEditing] = useState(null); // null | {} (novo) | reply (editar)
  const [error, setError]     = useState(null);
  const [copied, setCopied]   = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/api/quick-replies')
      .then((r) => setReplies(r.data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async (data) => {
    setError(null);
    try {
      if (editing?.id) {
        await api.put(`/api/quick-replies/${editing.id}`, data);
      } else {
        await api.post('/api/quick-replies', data);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    }
  };

  const remove = async (r) => {
    if (!confirm(`Remover a mensagem rápida ${r.shortcut}?`)) return;
    await api.delete(`/api/quick-replies/${r.id}`);
    load();
  };

  const copyShortcut = (shortcut) => {
    navigator.clipboard.writeText(shortcut);
    setCopied(shortcut);
    setTimeout(() => setCopied(null), 1500);
  };

  const filtered = search
    ? replies.filter((r) =>
        r.shortcut.toLowerCase().includes(search.toLowerCase()) ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.body.toLowerCase().includes(search.toLowerCase()),
      )
    : replies;

  // Modo edição/criação ocupa tudo
  if (editing !== null) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Mensagens rápidas</h1>
            <p className="text-sm text-slate-500">Configure seus atalhos para responder no chat com /</p>
          </div>
        </div>
        <div className="page-content max-w-5xl">
          <QuickReplyForm
            reply={editing}
            onSave={save}
            onCancel={() => { setEditing(null); setError(null); }}
            error={error}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Mensagens rápidas</h1>
          <p className="text-sm text-slate-500">
            {replies.length} atalho(s) — digite <code className="text-[10px] bg-slate-100 px-1 rounded">/</code> no chat para usar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary text-sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setEditing({})} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />Nova mensagem
          </button>
        </div>
      </div>

      <div className="page-content max-w-5xl space-y-4">
        {/* Estado vazio */}
        {!loading && replies.length === 0 && (
          <div className="card p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-brand-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">Nenhuma mensagem rápida ainda</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-5">
              Crie atalhos como <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">/ola</code>,{' '}
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">/preco</code> e{' '}
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">/agradeco</code> — depois é só digitar a barra no chat
              para responder em segundos.
            </p>
            <button onClick={() => setEditing({})} className="btn-primary inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" />Criar a primeira
            </button>
          </div>
        )}

        {/* Lista */}
        {replies.length > 0 && (
          <>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por atalho, título ou conteúdo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((r) => (
                <div key={r.id} className="card p-4 group hover:border-brand-300 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => copyShortcut(r.shortcut)}
                          className="font-mono text-sm font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                          title="Copiar atalho"
                        >
                          {r.shortcut}
                          {copied === r.shortcut
                            ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            : <Copy className="w-3 h-3 opacity-50" />}
                        </button>
                        {r.usage_count > 0 && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                            <TrendingUp className="w-2.5 h-2.5" />
                            usado {r.usage_count}x
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-medium text-slate-800 truncate">{r.title}</h3>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditing(r)}
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => remove(r)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 leading-relaxed line-clamp-3 whitespace-pre-wrap bg-slate-50 rounded p-2.5">
                    {highlightVars(r.body)}
                  </div>
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">
                Nada por aqui com "<strong>{search}</strong>".
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
