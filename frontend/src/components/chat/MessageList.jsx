import React from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { useChatScroll } from '../../hooks/useChatScroll';
import { formatDayLabelBr, isSameCalendarDayBr, parseMessageTimestamp } from '../../utils/timezone';

function messageTs(m) {
  return parseMessageTimestamp(m?.waTimestamp ?? m?.wa_timestamp);
}

function isSameDay(a, b) {
  const da = parseMessageTimestamp(a);
  const db = parseMessageTimestamp(b);
  if (!da || !db) return false;
  return isSameCalendarDayBr(da, db);
}

function formatDay(ts) {
  return formatDayLabelBr(ts);
}

export default function MessageList({ messages, loading, loadingMore, hasMore, onLoadOlder }) {
  const { containerRef, handleScroll, showJumpToBottom, scrollToBottom } = useChatScroll(
    messages,
    { onLoadOlder, canLoadOlder: hasMore && !loadingMore },
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
      </div>
    );
  }

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6">
        <p className="text-sm text-slate-400 text-center max-w-sm">
          Sem mensagens ainda nessa conversa. Escreva a primeira aí embaixo para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-slate-50 min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto py-4"
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          </div>
        )}
        {hasMore && !loadingMore && (
          <div className="flex justify-center py-2">
            <button onClick={onLoadOlder} className="text-xs text-slate-400 hover:text-slate-600 underline">
              Carregar mensagens antigas
            </button>
          </div>
        )}

        {messages.map((m, idx) => {
          const prev = messages[idx - 1];
          const ts = messageTs(m);
          const prevTs = prev ? messageTs(prev) : null;
          const showDay = !prevTs || !ts || !isSameDay(prevTs, ts);
          return (
            <React.Fragment key={m.id || `m-${idx}`}>
              {showDay && (
                <div className="flex justify-center my-3 sticky top-0 z-10">
                  <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
                    {formatDay(ts || Date.now())}
                  </span>
                </div>
              )}
              <MessageBubble message={m} />
            </React.Fragment>
          );
        })}
      </div>

      {showJumpToBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 right-4 w-9 h-9 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center text-slate-500 hover:text-brand-600 transition-colors"
          title="Voltar ao fim"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
