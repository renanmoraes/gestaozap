import React, { useState } from 'react';
import { Check, FileText, Info, Phone, Users } from 'lucide-react';
import { formatPhone } from '../../utils/phone';

function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ConversationHeader({ conversation, onMarkRead, onOpenTemplate, onToggleSidebar, sidebarOpen }) {
  if (!conversation) return null;
  const [imgError, setImgError] = useState(false);
  const isGroup = Boolean(conversation.isGroup ?? conversation.is_group);
  const name = conversation.contactName || conversation.contact_name || (isGroup ? 'Grupo sem nome' : formatPhone(conversation.phone));
  const rawAvatar = conversation.avatarUrl || conversation.avatar_url;
  const avatar = rawAvatar && !imgError ? rawAvatar : null;
  const tags = Array.isArray(conversation.tags) ? conversation.tags : [];
  const unread = Number(conversation.unreadCount ?? conversation.unread_count ?? 0);

  return (
    <header className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3 shrink-0">
      <div className={`w-10 h-10 rounded-full ${avatar ? '' : 'bg-gradient-to-br from-brand-400 to-brand-600'} text-white text-sm font-semibold flex items-center justify-center shrink-0 overflow-hidden`}>
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : isGroup ? <Users className="w-5 h-5" /> : initialsOf(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-900 truncate">{name}</h2>
          {isGroup && (
            <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-medium">grupo</span>
          )}
          {tags.map((t) => (
            <span key={t} className="text-[10px] bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
          {isGroup ? <Users className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
          {isGroup ? 'Conversa em grupo' : formatPhone(conversation.phone)}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {unread > 0 && (
          <button
            onClick={onMarkRead}
            className="text-xs text-slate-600 hover:text-brand-600 flex items-center gap-1 px-2 py-1.5 rounded hover:bg-slate-100"
            title="Marcar como lida"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Lida</span>
          </button>
        )}
        <button
          onClick={onOpenTemplate}
          className="text-xs text-slate-600 hover:text-brand-600 flex items-center gap-1 px-2 py-1.5 rounded hover:bg-slate-100"
          title="Disparar template existente"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Template</span>
        </button>
        <button
          onClick={onToggleSidebar}
          className={`p-1.5 rounded hover:bg-slate-100 ${sidebarOpen ? 'text-brand-600 bg-brand-50' : 'text-slate-600'}`}
          title="Detalhes e notas"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
