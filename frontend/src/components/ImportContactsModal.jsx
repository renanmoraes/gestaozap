import React, { useState } from 'react';
import {
  X, Smartphone, MessageCircle, Search, Loader2, AlertTriangle, CheckCircle2,
  RefreshCw, ArrowRight, ArrowLeft, Filter,
} from 'lucide-react';
import api from '../api';
import { formatPhone } from '../utils/phone';

const SOURCES = [
  {
    id: 'agenda',
    title: 'Da agenda do telefone',
    desc: 'Lê os contatos salvos no seu WhatsApp.',
    icon: Smartphone,
  },
  {
    id: 'chats',
    title: 'Das conversas abertas',
    desc: 'Pega os números de quem já trocou mensagem com você.',
    icon: MessageCircle,
  },
  {
    id: 'both',
    title: 'Tudo junto',
    desc: 'Agenda + conversas, sem duplicar.',
    icon: Search,
  },
];

function StatusBadge({ status }) {
  if (status === 'new') return <span className="badge-green text-[10px]">novo</span>;
  if (status === 'conflict') return <span className="badge-yellow text-[10px]">nome diferente</span>;
  return <span className="badge-gray text-[10px]">já existe</span>;
}

export default function ImportContactsModal({ onClose, onComplete }) {
  const [step, setStep]       = useState('source'); // source | preview | applying | done
  const [source, setSource]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState(null); // resposta do preview
  const [items, setItems]     = useState([]);   // items com decisões
  const [filter, setFilter]   = useState('all'); // all | new | conflict | duplicate
  const [searchTerm, setSearch] = useState('');
  const [error, setError]     = useState(null);
  const [result, setResult]   = useState(null);

  const loadPreview = async (src) => {
    setSource(src);
    setStep('preview');
    setLoading(true);
    setError(null);
    try {
      const { data: resp } = await api.get(`/api/contacts/import/preview?source=${src}`);
      setData(resp);
      setItems(resp.items.map((it) => ({
        ...it,
        action: it.defaultAction,
        selected: it.status === 'new', // por padrão importa só os novos
      })));
    } catch (err) {
      setError(err.response?.data?.error || 'Não rolou ler seus contatos agora.');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setStep('applying');
    try {
      const payload = items
        .filter((it) => it.selected)
        .map((it) => ({ phone: it.phone, name: it.name, action: it.action }));

      const { data: resp } = await api.post('/api/contacts/import/apply', { items: payload });
      setResult(resp);
      setStep('done');
      onComplete?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao importar');
      setStep('preview');
    }
  };

  const toggle = (idx, key, value) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  };

  const bulkSelect = (status, selected) => {
    setItems((prev) => prev.map((it) =>
      it.status === status ? { ...it, selected } : it,
    ));
  };

  const filtered = items.filter((it) => {
    if (filter !== 'all' && it.status !== filter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return it.name.toLowerCase().includes(q) || it.phone.includes(q);
    }
    return true;
  });

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Importar contatos</h2>
            <p className="text-xs text-slate-500">Traga seus contatos do WhatsApp para a plataforma — sem duplicar.</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* STEP 1: Escolher fonte */}
          {step === 'source' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">
                De onde você quer trazer os contatos?
              </p>
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadPreview(s.id)}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-brand-500 hover:bg-brand-50 transition-all flex items-center gap-4 group"
                >
                  <div className="w-12 h-12 rounded-lg bg-brand-50 group-hover:bg-brand-100 text-brand-600 flex items-center justify-center">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.desc}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600" />
                </button>
              ))}
            </div>
          )}

          {/* STEP 2: Preview / revisão */}
          {step === 'preview' && (
            <>
              {loading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 text-brand-600 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Lendo seus contatos do WhatsApp…</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                  <p className="text-sm text-red-600">{error}</p>
                  <button onClick={() => loadPreview(source)} className="btn-secondary text-xs mt-4 inline-flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />Tentar de novo
                  </button>
                </div>
              ) : data && (
                <div className="space-y-4">
                  {/* Resumo */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { key: 'total', label: 'Encontrados', val: data.summary.total, color: 'slate' },
                      { key: 'new', label: 'Novos', val: data.summary.new, color: 'emerald' },
                      { key: 'conflict', label: 'Conflitos', val: data.summary.conflicts, color: 'amber' },
                      { key: 'duplicate', label: 'Já existem', val: data.summary.duplicates, color: 'slate' },
                    ].map((s) => (
                      <div key={s.key} className={`p-3 rounded-lg border ${
                        s.color === 'emerald' ? 'bg-emerald-50 border-emerald-200' :
                        s.color === 'amber' ? 'bg-amber-50 border-amber-200' :
                        'bg-slate-50 border-slate-200'
                      }`}>
                        <div className={`text-xl font-bold ${
                          s.color === 'emerald' ? 'text-emerald-700' :
                          s.color === 'amber' ? 'text-amber-700' : 'text-slate-700'
                        }`}>
                          {s.val}
                        </div>
                        <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Filtros */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      { id: 'all', label: 'Tudo' },
                      { id: 'new', label: `Novos (${data.summary.new})` },
                      { id: 'conflict', label: `Conflitos (${data.summary.conflicts})` },
                      { id: 'duplicate', label: `Já existem (${data.summary.duplicates})` },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`text-xs px-2.5 py-1 rounded-full ${
                          filter === f.id
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                    <div className="relative flex-1 min-w-[140px]">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar por nome ou número…"
                        value={searchTerm}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  {/* Bulk actions */}
                  {filter !== 'all' && filtered.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => bulkSelect(filter, true)}
                        className="text-brand-600 hover:text-brand-700 font-medium"
                      >
                        Selecionar todos {filter === 'new' ? 'novos' : filter === 'conflict' ? 'conflitos' : 'duplicados'}
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        onClick={() => bulkSelect(filter, false)}
                        className="text-slate-500 hover:text-slate-700"
                      >
                        Desmarcar todos
                      </button>
                    </div>
                  )}

                  {/* Lista */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="max-h-[40vh] overflow-y-auto divide-y divide-slate-100">
                      {filtered.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-400">
                          Nada para mostrar com esse filtro.
                        </div>
                      ) : filtered.map((it) => {
                        const idx = items.findIndex((x) => x.phone === it.phone);
                        return (
                          <div key={it.phone} className="px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={it.selected}
                              onChange={(e) => toggle(idx, 'selected', e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-brand-600"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-800 truncate">{it.name}</span>
                                <StatusBadge status={it.status} />
                                {it.origin === 'chats' && (
                                  <span className="text-[9px] text-slate-500 bg-slate-100 px-1 rounded">de conversa</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 font-mono">{formatPhone(it.phone)}</div>
                              {it.status === 'conflict' && it.existing && (
                                <div className="text-[11px] text-amber-600 mt-1">
                                  Na sua base: <strong>{it.existing.name}</strong> · no WhatsApp: <strong>{it.name}</strong>
                                </div>
                              )}
                            </div>

                            {/* Ação por item */}
                            {it.selected && (it.status === 'conflict' || it.status === 'duplicate') && (
                              <select
                                value={it.action}
                                onChange={(e) => toggle(idx, 'action', e.target.value)}
                                className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-brand-500"
                              >
                                <option value="skip">Pular</option>
                                {it.status === 'conflict' && (
                                  <option value="overwrite_name">Atualizar nome para "{it.name.slice(0, 20)}"</option>
                                )}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* STEP 3: Aplicando */}
          {step === 'applying' && (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-600">Importando seus contatos…</p>
            </div>
          )}

          {/* STEP 4: Done */}
          {step === 'done' && result && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Pronto!</h3>
              <p className="text-sm text-slate-600 mb-5">
                Seus contatos foram importados.
              </p>
              <div className="inline-flex gap-6 text-sm bg-slate-50 rounded-lg px-5 py-3">
                <div>
                  <div className="text-xl font-bold text-emerald-700">{result.created}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Novos</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-brand-700">{result.updated}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Atualizados</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-500">{result.skipped}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Pulados</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          {step === 'preview' && !loading && data && (
            <>
              <button
                onClick={() => { setStep('source'); setData(null); }}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Trocar fonte
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  <strong>{selectedCount}</strong> selecionado(s) para importar
                </span>
                <button
                  onClick={apply}
                  disabled={selectedCount === 0}
                  className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  Importar {selectedCount > 0 && `${selectedCount} `}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="btn-primary text-sm w-full">
              Fechar
            </button>
          )}
          {(step === 'source' || step === 'applying') && (
            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 ml-auto">
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
