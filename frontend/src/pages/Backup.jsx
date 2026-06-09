import React, { useState, useEffect, useCallback } from 'react';
import { Database, Download, RotateCcw, Trash2, Save, Loader2, Inbox, Info, ShieldCheck } from 'lucide-react';
import api from '../api';
import { formatDateTimeBr } from '../utils/timezone';

const API_URL = import.meta.env.VITE_API_URL || '';

function fmtTs(ts) {
  if (!ts) return '—';
  return formatDateTimeBr(ts, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Backup() {
  const [info, setInfo] = useState({ autoHour: 3, retention: 7, backups: [] });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/backup');
      setInfo(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createNow = async () => {
    setCreating(true); setNotice(null);
    try {
      const r = await api.post('/api/backup');
      setNotice(`Backup criado: ${r.data.name}`);
      await load();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Erro ao criar backup');
    } finally {
      setCreating(false);
    }
  };

  const restore = async (name) => {
    if (!confirm(`Restaurar "${name}"?\n\nATENÇÃO: isso SUBSTITUI todos os contatos, campanhas, logs e imagens atuais pelos dados deste backup. Não dá para desfazer.`)) return;
    setActing(name); setNotice(null);
    try {
      const r = await api.post(`/api/backup/${name}/restore`);
      const cols = Object.entries(r.data.collections || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
      setNotice(`Backup restaurado. ${cols}${r.data.uploadsRestored ? ` · imagens: ${r.data.uploadsRestored}` : ''}`);
    } catch (err) {
      setNotice(err.response?.data?.error || 'Erro ao restaurar');
    } finally {
      setActing(null);
    }
  };

  const remove = async (name) => {
    if (!confirm(`Excluir o backup "${name}"?`)) return;
    setActing(name);
    try { await api.delete(`/api/backup/${name}`); await load(); }
    finally { setActing(null); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Backup</h1>
          <p className="text-sm text-slate-500 mt-0.5">Cópias de segurança de contatos, campanhas, logs e imagens</p>
        </div>
        <button onClick={createNow} disabled={creating} className="btn-primary">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Backup agora
        </button>
      </div>

      <div className="page-content">
        {notice && (
          <div className="flex items-start gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />{notice}
          </div>
        )}

        <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Backup automático diário às {info.autoHour}h · mantém os últimos {info.retention} (os mais antigos são apagados).
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando…
          </div>
        ) : info.backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Inbox className="w-8 h-8 mb-2" />
            <p className="text-sm">Nenhum backup ainda. Clique em “Backup agora”.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {info.backups.map((b) => (
                <div key={b.name} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Database className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{b.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{fmtTs(b.createdAt)} · {fmtSize(b.size)}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <a href={`${API_URL}/api/backup/${b.name}/download`}
                      className="btn-secondary py-1.5 px-3 text-xs" title="Baixar">
                      <Download className="w-3.5 h-3.5" />Baixar
                    </a>
                    <button onClick={() => restore(b.name)} disabled={acting === b.name}
                      className="btn-secondary py-1.5 px-3 text-xs" title="Restaurar">
                      {acting === b.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Restaurar
                    </button>
                    <button onClick={() => remove(b.name)} disabled={acting === b.name}
                      className="btn-danger py-1.5 px-3 text-xs" title="Excluir">
                      <Trash2 className="w-3.5 h-3.5" />
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
