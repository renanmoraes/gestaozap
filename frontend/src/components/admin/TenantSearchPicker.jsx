import React, { useState, useEffect } from 'react';
import { Search, X, Building2 } from 'lucide-react';
import api from '../../api';

export default function TenantSearchPicker({ value, onChange, disabled }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(value || null);

  useEffect(() => {
    setSelected(value || null);
  }, [value]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      setLoading(true);
      api.get('/api/admin/tenants/search', { params: { q: q.trim() } })
        .then((r) => setResults(r.data || []))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (tenant) => {
    setSelected(tenant);
    onChange?.(tenant);
    setQ('');
    setResults([]);
  };

  const clear = () => {
    setSelected(null);
    onChange?.(null);
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-brand-200 bg-brand-50">
        <Building2 className="w-4 h-4 text-brand-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">{selected.name}</div>
          <div className="text-xs text-slate-500 font-mono">
            #{selected.company_id} · /{selected.slug}
          </div>
        </div>
        {!disabled && (
          <button type="button" onClick={clear} className="p-1 rounded hover:bg-white text-slate-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Buscar cliente por nome, slug ou ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={disabled}
        />
      </div>
      {loading && <div className="text-xs text-slate-400 mt-1">Buscando…</div>}
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={t.has_affiliate}
              onClick={() => pick(t)}
              className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${
                t.has_affiliate ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <div className="text-sm font-medium text-slate-900">{t.name}</div>
              <div className="text-xs text-slate-500 font-mono">
                #{t.company_id} · /{t.slug}
                {t.has_affiliate && ' · já é afiliado'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
