import React, { useMemo } from 'react';
import { Tag } from 'lucide-react';

export default function ProductHashtagPicker({
  items, query, onPick, onClose, activeIndex, setActiveIndex,
}) {
  const filtered = useMemo(() => {
    const q = (query || '').toLowerCase().replace(/^#/, '');
    if (!q) return items;
    return items.filter((r) =>
      r.hashtag.toLowerCase().includes(q)
      || r.title.toLowerCase().includes(q),
    );
  }, [items, query]);

  if (!filtered.length) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Tag className="w-4 h-4 text-slate-300" />
          Nenhuma promoção com código. Publique uma promoção na vitrine.
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Tag className="w-3.5 h-3.5 text-brand-600" />
        <span className="text-xs font-medium text-slate-600">Produtos / promoções — Enter para inserir link</span>
      </div>
      <div className="divide-y divide-slate-100">
        {filtered.map((r, idx) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r)}
            onMouseEnter={() => setActiveIndex(idx)}
            className={`w-full text-left px-3 py-2.5 transition-colors ${
              activeIndex === idx ? 'bg-brand-50' : 'hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <code className="text-xs font-mono font-bold text-brand-700">{r.hashtag}</code>
              <span className="text-xs text-slate-500 truncate">{r.title}</span>
            </div>
            <p className="text-xs text-slate-500 truncate">{r.url}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
