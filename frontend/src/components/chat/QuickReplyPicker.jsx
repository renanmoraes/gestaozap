import React, { useEffect, useMemo, useRef } from 'react';
import { Zap } from 'lucide-react';

/**
 * Dropdown que filtra mensagens rápidas pelo termo digitado após "/".
 * Navegação por setas, Enter para selecionar.
 */
export default function QuickReplyPicker({ replies, query, onPick, onClose, activeIndex, setActiveIndex }) {
  const containerRef = useRef(null);

  const filtered = useMemo(() => {
    const q = (query || '').toLowerCase().replace(/^\//, '');
    if (!q) return replies;
    return replies.filter((r) =>
      r.shortcut.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.body.toLowerCase().includes(q),
    );
  }, [replies, query]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [filtered, activeIndex, setActiveIndex]);

  if (!filtered.length) {
    return (
      <div ref={containerRef} className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Zap className="w-4 h-4 text-slate-300" />
          Nenhum atalho encontrado. Crie em <strong>Configurações → Mensagens rápidas</strong>.
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-brand-600" />
        <span className="text-xs font-medium text-slate-600">
          Mensagens rápidas — use ↑↓ e Enter para selecionar, Esc para fechar
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {filtered.map((r, idx) => (
          <button
            key={r.id}
            onClick={() => onPick(r)}
            onMouseEnter={() => setActiveIndex(idx)}
            className={`w-full text-left px-3 py-2.5 transition-colors ${
              activeIndex === idx ? 'bg-brand-50' : 'hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <code className={`text-xs font-mono font-bold ${activeIndex === idx ? 'text-brand-700' : 'text-slate-700'}`}>
                {r.shortcut}
              </code>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs font-medium text-slate-800 truncate">{r.title}</span>
            </div>
            <p className="text-xs text-slate-500 truncate">{r.body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
