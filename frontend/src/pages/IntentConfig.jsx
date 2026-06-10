import React, { useState, useEffect } from 'react';
import {
  Target, Plus, Edit2, Trash2, Save, X, LifeBuoy,
  Power, AlertCircle, Hash, Tag as TagIcon, RefreshCw, History,
} from 'lucide-react';
import api from '../api';
import { dialog } from '../utils/dialog';
import { apiErrorMessage } from '../utils/messages';
import { useSocket } from '../hooks/useSocket';

const REPROCESS_WINDOWS = [
  { key: '7d', label: 'Últimos 7 dias' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: '90d', label: 'Últimos 90 dias' },
  { key: 'all', label: 'Todo histórico' },
];

const EMPTY_RULE = {
  intentKey: '',
  name: '',
  description: '',
  keywords: [],
  regexPatterns: [],
  tags: [],
  priority: 0,
  minScore: '0.60',
  active: true,
};

function linesToArray(text) {
  return String(text || '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function arrayToLines(arr) {
  return Array.isArray(arr) ? arr.join('\n') : '';
}

function Chips({ items, variant = 'brand' }) {
  if (!items?.length) return <span className="text-xs text-slate-400">—</span>;
  const cls = variant === 'tag'
    ? 'bg-amber-50 text-amber-700 border-amber-100'
    : 'bg-brand-50 text-brand-700 border-brand-100';
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <span key={i} className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>
          {it}
        </span>
      ))}
    </div>
  );
}

function RuleEditor({ rule, onCancel, onSaved }) {
  const isNew = !rule.id;
  const [form, setForm] = useState({
    ...EMPTY_RULE,
    ...rule,
    keywords: arrayToLines(rule.keywords),
    regexPatterns: arrayToLines(rule.regexPatterns),
    tags: arrayToLines(rule.tags),
    minScore: rule.minScore != null ? String(rule.minScore) : '0.60',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.intentKey.trim()) {
      setError('Nome e chave da intenção são obrigatórios.');
      return;
    }
    setSaving(true);
    const payload = {
      intentKey: form.intentKey.trim(),
      name: form.name.trim(),
      description: form.description,
      keywords: linesToArray(form.keywords),
      regexPatterns: linesToArray(form.regexPatterns),
      tags: linesToArray(form.tags),
      priority: Number(form.priority) || 0,
      minScore: form.minScore,
      active: !!form.active,
    };
    try {
      if (isNew) await api.post('/api/intent-rules', payload);
      else await api.put(`/api/intent-rules/${rule.id}`, payload);
      dialog.toast.success(isNew ? 'Intenção criada' : 'Intenção atualizada');
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isNew ? 'Nova intenção' : `Editar — ${rule.name}`}
            </h2>
            <p className="text-xs text-slate-500">
              {rule.systemDefault ? 'Baseada em uma intenção padrão' : 'Intenção personalizada'}
            </p>
          </div>
        </div>
        <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Nome da intenção</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex.: Preço / valor / plano"
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Chave (intent_key)</label>
            <input
              value={form.intentKey}
              onChange={(e) => set('intentKey', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="ex.: pricing"
              disabled={!isNew}
              className="input disabled:bg-slate-50 disabled:text-slate-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">Identificador interno. Letras minúsculas, números e underline.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Descrição</label>
            <input
              value={form.description || ''}
              onChange={(e) => set('description', e.target.value)}
              placeholder="O que essa intenção representa"
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Prioridade</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => set('priority', e.target.value)}
                className="input"
              />
              <p className="text-[10px] text-slate-400 mt-1">Maior vence em caso de empate.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Score mínimo</label>
              <input
                type="number" step="0.05" min="0" max="1"
                value={form.minScore}
                onChange={(e) => set('minScore', e.target.value)}
                className="input"
              />
              <p className="text-[10px] text-slate-400 mt-1">De 0 a 1 (padrão 0,60).</p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={!!form.active} onChange={(e) => set('active', e.target.checked)} className="rounded" />
            <span className="text-sm text-slate-700">Intenção ativa</span>
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Palavras-chave</label>
            <textarea
              value={form.keywords}
              onChange={(e) => set('keywords', e.target.value)}
              rows={5}
              placeholder={'quanto custa\nvalor\nplano'}
              className="input font-mono text-xs"
            />
            <p className="text-[10px] text-slate-400 mt-1">Uma por linha (ou separadas por vírgula). Acentos e maiúsculas são ignorados.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Regex (avançado)</label>
            <textarea
              value={form.regexPatterns}
              onChange={(e) => set('regexPatterns', e.target.value)}
              rows={2}
              placeholder={'\\bquanto\\s+custa\\b'}
              className="input font-mono text-xs"
            />
            <p className="text-[10px] text-slate-400 mt-1">Opcional. Um padrão por linha.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Tags aplicadas</label>
            <textarea
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
              rows={2}
              placeholder={'interesse_preco\nlead_quente'}
              className="input font-mono text-xs"
            />
            <p className="text-[10px] text-slate-400 mt-1">Tags automáticas marcadas no contato quando a intenção é detectada.</p>
          </div>
        </div>

        <div className="lg:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5">
            <Save className="w-4 h-4" />
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RuleCard({ rule, onEdit, onToggle, onDelete }) {
  return (
    <div className={`card p-4 ${rule.active ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{rule.name}</h3>
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
              <Hash className="w-3 h-3" />{rule.intentKey}
            </span>
            {rule.systemDefault && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-600">padrão</span>
            )}
          </div>
          {rule.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{rule.description}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(rule)}
            title={rule.active ? 'Desativar' : 'Ativar'}
            className={`p-1.5 rounded ${rule.active ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            <Power className="w-4 h-4" />
          </button>
          <button onClick={() => onEdit(rule)} title="Editar" className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(rule)} title="Remover" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1">
            <Hash className="w-3 h-3" /> Palavras-chave
          </div>
          <Chips items={rule.keywords} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1">
            <TagIcon className="w-3 h-3" /> Tags
          </div>
          <Chips items={rule.tags} variant="tag" />
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-4 text-[11px] text-slate-400">
        <span>Prioridade <b className="text-slate-600">{rule.priority}</b></span>
        <span>Score mín. <b className="text-slate-600">{Number(rule.minScore).toFixed(2)}</b></span>
      </div>
    </div>
  );
}

export default function IntentConfig() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // rule object or {} for new
  const [error, setError] = useState('');
  const [reprocessing, setReprocessing] = useState(false);

  useSocket({
    'intent:history_reprocess_started': () => setReprocessing(true),
    'intent:history_reprocess_finished': (p) => {
      setReprocessing(false);
      dialog.toast.success(`Reprocessamento concluído: ${p?.detected ?? 0} intenção(ões) em ${p?.processed ?? 0} mensagem(ns).`);
    },
  });

  async function reprocess(window) {
    const ok = await dialog.confirm({
      title: 'Reprocessar histórico',
      message: 'Vamos reanalisar as mensagens recebidas já salvas para detectar intenções. Pode levar alguns minutos.',
      confirmLabel: 'Reprocessar',
    });
    if (!ok) return;
    try {
      await api.post('/api/intent-rules/reprocess', { window });
      setReprocessing(true);
      dialog.toast.info('Reprocessamento iniciado…');
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    }
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/intent-rules');
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggle(rule) {
    try {
      await api.put(`/api/intent-rules/${rule.id}`, { active: !rule.active });
      setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r)));
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    }
  }

  async function remove(rule) {
    const ok = await dialog.confirm({
      title: 'Remover intenção',
      message: `Remover a intenção "${rule.name}"? O histórico já capturado é mantido.`,
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/intent-rules/${rule.id}`);
      setRules((rs) => rs.filter((r) => r.id !== rule.id));
      dialog.toast.success('Intenção removida');
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    }
  }

  async function requestSupport() {
    try {
      await api.post('/api/intent-rules/support-request', {
        note: 'Quero ajuda para criar/ajustar regras de intenção.',
      });
      dialog.toast.success('Pedido enviado! O suporte da Wamio vai entrar em contato.');
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    }
  }

  if (editing) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Configurar Intenções</h1>
            <p className="text-sm text-slate-500">Crie e ajuste as regras que identificam intenções nas conversas</p>
          </div>
        </div>
        <div className="page-content max-w-5xl">
          <RuleEditor
            rule={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Configurar Intenções</h1>
          <p className="text-sm text-slate-500">Identifique automaticamente preço, teste, reclamações, cancelamentos e oportunidades nas conversas</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY_RULE })} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Nova intenção
        </button>
      </div>

      <div className="page-content max-w-5xl space-y-4">
        {/* CTA de suporte */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white text-brand-600 flex items-center justify-center shrink-0">
              <LifeBuoy className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">Precisa de ajuda para criar regras de intenção?</p>
              <p className="text-xs text-slate-500">Nosso time monta as regras junto com você.</p>
            </div>
          </div>
          <button onClick={requestSupport} className="btn-secondary whitespace-nowrap">Falar com o suporte</button>
        </div>

        {/* Reprocessar histórico */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              {reprocessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">Reprocessar histórico de intenções</p>
              <p className="text-xs text-slate-500">Reanalisa as mensagens recebidas já salvas com as regras atuais.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {REPROCESS_WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => reprocess(w.key)}
                disabled={reprocessing}
                className="btn-secondary text-xs py-1.5 disabled:opacity-50"
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">
            <Target className="w-8 h-8 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">Nenhuma intenção configurada ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onEdit={setEditing}
                onToggle={toggle}
                onDelete={remove}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
