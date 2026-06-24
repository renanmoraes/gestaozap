import React, { useState } from 'react';
import { formatPhone } from '../../utils/phone';
import { formatRelativeChatTime } from '../../utils/timezone';
import { Check, CheckCheck, Users } from 'lucide-react';

function initialsOf(name = '') {
  const clean = String(name).trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Gradient determinístico a partir do nome
function colorOf(name = '') {
  const palette = [
    'from-brand-400 to-brand-600',
    'from-emerald-400 to-emerald-600',
    'from-amber-400 to-amber-600',
    'from-rose-400 to-rose-600',
    'from-sky-400 to-sky-600',
    'from-violet-400 to-violet-600',
    'from-teal-400 to-teal-600',
  ];
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function relativeTime(ts) {
  return formatRelativeChatTime(ts);
}

export default function ConversationItem({ conversation, active, onClick }) {
  const c = conversation;
  const [imgError, setImgError] = useState(false);
  const isGroup = Boolean(c.isGroup ?? c.is_group);
  const name = c.contactName || c.contact_name || (isGroup ? 'Grupo sem nome' : formatPhone(c.phone));
  const avatar = (c.avatarUrl || c.avatar_url) && !imgError ? (c.avatarUrl || c.avatar_url) : null;
  const unread = Number(c.unreadCount ?? c.unread_count ?? 0);
  const preview = c.lastMessagePreview || c.last_message_preview || 'Sem mensagens ainda';
  const lastAt = c.lastMessageAt || c.last_message_at;
  const fromMe = c.lastMessageFromMe ?? c.last_message_from_me;
  const tags = Array.isArray(c.tags) ? c.tags : [];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 flex gap-3 items-center transition-colors border-l-2
        ${active
          ? 'bg-brand-50 border-l-brand-600'
          : 'border-l-transparent hover:bg-slate-50'}`}
    >
      {/* Avatar — foto de perfil quando disponível, senão iniciais/ícone de grupo */}
      <div className={`w-11 h-11 rounded-full ${avatar ? '' : `bg-gradient-to-br ${colorOf(name)}`} text-white text-sm font-semibold flex items-center justify-center shrink-0 overflow-hidden`}>
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : isGroup ? <Users className="w-5 h-5" /> : initialsOf(name)}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-slate-900 truncate">{name}</span>
            {isGroup && (
              <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded font-medium shrink-0">grupo</span>
            )}
          </div>
          <span className={`text-xs shrink-0 ${unread > 0 ? 'text-brand-600 font-medium' : 'text-slate-400'}`}>
            {relativeTime(lastAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {fromMe && (
            <CheckCheck className="w-3 h-3 text-slate-400 shrink-0" />
          )}
          <p className={`text-xs truncate flex-1 ${unread > 0 ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
            {preview}
          </p>
          {unread > 0 && (
            <span className="bg-brand-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center shrink-0">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 rounded">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
