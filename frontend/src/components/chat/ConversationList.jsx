import React, { useState, useMemo } from 'react';
import { Search, Inbox, MessageCircle, Filter, X, RefreshCw, Loader2, CheckCheck } from 'lucide-react';
import ConversationItem from './ConversationItem';

export default function ConversationList({ conversations, loading, selectedId, onSelect, search, setSearch, tag, setTag, onlyUnread, setOnlyUnread, sync, onSync, onMarkAllRead }) {
  const [showFilters, setShowFilters] = useState(false);

  const hasUnread = useMemo(
    () => conversations.some((c) => (c.unread_count ?? c.unreadCount ?? 0) > 0),
    [conversations],
  );

  const allTags = useMemo(() => {
    const s = new Set();
    conversations.forEach((c) => (c.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [conversations]);

  return (
    <aside className="w-[360px] shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-brand-600" />
            <h1 className="text-base font-semibold text-slate-900">Conversas</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onMarkAllRead}
              disabled={!hasUnread}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40 disabled:hover:bg-transparent"
              title="Marcar todas como lidas"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
            <button
              onClick={onSync}
              disabled={sync?.active}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-600 disabled:opacity-50"
              title="Recarregar conversas do WhatsApp"
            >
              <RefreshCw className={`w-4 h-4 ${sync?.active ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowFilters((s) => !s)}
              className={`p-1.5 rounded-lg transition-colors ${showFilters || tag || onlyUnread ? 'bg-brand-50 text-brand-600' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Procurar por nome, número ou texto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filtros */}
        {showFilters && (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600" />
              Só não lidas
            </label>
            {allTags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTag(tag === t ? null : t)}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${
                      tag === t
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner de sincronização */}
      {sync?.active && (
        <div className="px-4 py-3 bg-brand-50 border-b border-brand-100 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-brand-600 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-brand-800">
              Carregando suas conversas do WhatsApp…
            </div>
            {sync.total > 0 && (
              <>
                <div className="text-[10px] text-brand-600 mt-0.5">
                  {sync.done} de {sync.total} chats
                </div>
                <div className="h-1 bg-brand-100 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${Math.round((sync.done / sync.total) * 100)}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Inbox className="w-12 h-12 text-slate-200 mb-3" />
            <p className="text-sm text-slate-500">
              {search || tag || onlyUnread
                ? 'Nada encontrado por aqui.'
                : 'Ainda não há conversas — assim que alguém te chamar, aparece nesta lista.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {conversations.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                active={c.id === selectedId}
                onClick={() => onSelect(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
