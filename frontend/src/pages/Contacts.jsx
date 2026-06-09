import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Tag, Pencil, Trash2, UserX, UserCheck, Upload, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api';
import { useSocket } from '../hooks/useSocket';
import { formatPhone, maskPhoneInput } from '../utils/phone';
import ImportContactsModal from '../components/ImportContactsModal';
import { Smartphone } from 'lucide-react';

const PAGE_SIZE = 50;

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [optedOutCount, setOptedOutCount] = useState(0);
  const [page, setPage] = useState(1);
  const [tag, setTag] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', tags: '' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', tags: '' });
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showWaImport, setShowWaImport] = useState(false);
  const [showOptedOut, setShowOptedOut] = useState(false);
  const [optOutToast, setOptOutToast] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tag, searchDebounced, showOptedOut]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        optedOut: showOptedOut ? 'all' : 'hide',
      };
      if (tag) params.tag = tag;
      if (searchDebounced) params.q = searchDebounced;
      const res = await api.get('/api/contacts', { params });
      setContacts(res.data.items || []);
      setTotal(res.data.total ?? 0);
      setTotalPages(res.data.totalPages ?? 1);
      setOptedOutCount(res.data.optedOutCount ?? 0);
      setAllTags(res.data.tags || []);
    } finally {
      setLoading(false);
    }
  }, [page, tag, searchDebounced, showOptedOut]);

  useEffect(() => { load(); }, [load]);

  useSocket({
    'contact:opted-out': ({ name, phone }) => {
      setOptOutToast({ name, phone });
      load();
      setTimeout(() => setOptOutToast(null), 4000);
    },
  });

  const add = async (e) => {
    e.preventDefault();
    await api.post('/api/contacts', { ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) });
    setForm({ name: '', phone: '', tags: '' });
    setPage(1);
    load();
  };

  const remove = async (id) => {
    if (!confirm('Remover contato?')) return;
    await api.delete(`/api/contacts/${id}`);
    load();
  };

  const saveEdit = async (id) => {
    await api.put(`/api/contacts/${id}`, { ...editForm, tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean) });
    setEditingId(null);
    load();
  };

  const startEdit = (c) => {
    setEditingId(c._id);
    setEditForm({ name: c.name, phone: c.phone, tags: (c.tags || []).join(', ') });
  };

  const toggleOptOut = async (c) => {
    if (c.optedOut) await api.post(`/api/contacts/${c._id}/opt-in`);
    else await api.post(`/api/contacts/${c._id}/opt-out`);
    load();
  };

  const importContacts = async () => {
    const rows = importText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed = rows.map((row) => {
      const [name, phone, ...tagParts] = row.split(/[,;\t]+/);
      return { name: name?.trim(), phone: phone?.trim(), tags: tagParts.map((t) => t.trim()).filter(Boolean) };
    }).filter((c) => c.name && c.phone);
    if (!parsed.length) return;
    await api.post('/api/contacts/import', { contacts: parsed });
    setImportText('');
    setShowImport(false);
    setPage(1);
    load();
  };

  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Contatos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total.toLocaleString('pt-BR')} no total · {optedOutCount.toLocaleString('pt-BR')} opt-out
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowOptedOut((v) => !v)}
            className={`btn-secondary text-xs ${showOptedOut ? 'border-amber-300 text-amber-700 bg-amber-50' : ''}`}>
            <UserX className="w-3.5 h-3.5" />
            {showOptedOut ? 'Ocultar opt-out' : 'Ver opt-out'}
          </button>
          <button
            onClick={() => {
              const a = document.createElement('a');
              a.href = '/api/contacts/export';
              a.download = '';
              a.click();
            }}
            className="btn-secondary text-xs flex items-center gap-1.5"
            title="Baixar backup JSON com todos os contatos"
          >
            <Download className="w-3.5 h-3.5" />
            Backup
          </button>
          <button onClick={() => setShowWaImport(true)} className="btn-primary">
            <Smartphone className="w-4 h-4" />Importar do WhatsApp
          </button>
          <button onClick={() => setShowImport((v) => !v)} className="btn-secondary">
            <Upload className="w-4 h-4" />Colar lista
          </button>
        </div>
      </div>

      <div className="page-content">
        {showImport && (
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Upload className="w-4 h-4 text-brand-600" />Importar contatos
            </h2>
            <p className="text-xs text-slate-500">Uma linha por contato: <code className="bg-slate-100 px-1 rounded">Nome, Telefone, Tag1, Tag2</code></p>
            <textarea className="input resize-none font-mono text-xs" rows={6}
              placeholder={"João Silva, 5511999999999, familia\nMaria Santos, 5521888888888, amigos"}
              value={importText} onChange={(e) => setImportText(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={importContacts} className="btn-primary"><Upload className="w-4 h-4" />Importar</button>
              <button onClick={() => setShowImport(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="card p-5 space-y-4 h-fit">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-600" />Novo contato
            </h2>
            <form onSubmit={add} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome</label>
                <input className="input" placeholder="Nome completo" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Telefone (com DDD)</label>
                <input className="input font-mono" placeholder="(11) 98765-4321"
                  value={formatPhone(form.phone)}
                  onChange={(e) => setForm({ ...form, phone: maskPhoneInput(e.target.value) })} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tags (separadas por vírgula)</label>
                <input className="input" placeholder="familia, vip, amigos" value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <button type="submit" className="btn-primary w-full justify-center">
                <Plus className="w-4 h-4" />Adicionar
              </button>
            </form>
          </div>

          <div className="xl:col-span-2 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" placeholder="Buscar por nome ou telefone…"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {allTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                  <button onClick={() => setTag('')}
                    className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${!tag ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-600 hover:border-brand-400'}`}>
                    Todos
                  </button>
                  {allTags.map((t) => (
                    <button key={t} onClick={() => setTag(t)}
                      className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${tag === t ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-600 hover:border-brand-400'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Users className="w-8 h-8 mb-2" />
                  <p className="text-sm">Nenhum contato encontrado</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {contacts.map((c) => (
                      <div key={c._id} className={`px-5 py-3 ${c.optedOut ? 'bg-slate-50' : ''}`}>
                        {editingId === c._id ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input className="input text-xs" value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                              <input className="input text-xs font-mono" value={formatPhone(editForm.phone)}
                                onChange={(e) => setEditForm({ ...editForm, phone: maskPhoneInput(e.target.value) })} />
                            </div>
                            <input className="input text-xs" placeholder="tags separadas por vírgula"
                              value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} />
                            <div className="flex gap-2">
                              <button onClick={() => saveEdit(c._id)} className="btn-primary text-xs py-1.5">Salvar</button>
                              <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1.5">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-slate-900">{c.name}</span>
                                {c.optedOut && <span className="badge-red">opt-out</span>}
                                {(c.tags || []).map((t) => (
                                  <span key={t} className="badge-gray">{t}</span>
                                ))}
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5 font-mono">{formatPhone(c.phone)}</div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => toggleOptOut(c)} title={c.optedOut ? 'Reativar' : 'Opt-out'}
                                className={`p-2 rounded-lg transition-colors ${c.optedOut ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}>
                                {c.optedOut ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                              </button>
                              <button onClick={() => startEdit(c)} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => remove(c._id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-xs text-slate-500">
                        {pageStart}–{pageEnd} de {total.toLocaleString('pt-BR')}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                          className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          Anterior
                        </button>
                        <span className="text-xs text-slate-500 tabular-nums">
                          Página {page} de {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page >= totalPages}
                          className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
                        >
                          Próxima
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {optOutToast && (
        <div className="fixed bottom-4 right-4 z-50 card px-4 py-3 flex items-center gap-3 shadow-lg border-l-4 border-l-amber-500">
          <span className="text-lg">📵</span>
          <div>
            <p className="text-sm font-medium text-slate-900">{optOutToast.name} saiu do evento</p>
            <p className="text-xs text-slate-500 font-mono">{formatPhone(optOutToast.phone)}</p>
          </div>
        </div>
      )}
      {showWaImport && (
        <ImportContactsModal
          onClose={() => setShowWaImport(false)}
          onComplete={() => { setPage(1); load(); }}
        />
      )}
    </>
  );
}
