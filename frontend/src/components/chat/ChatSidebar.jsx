import React, { useState, useEffect, useMemo } from 'react';
import { X, Tag, StickyNote, User, Phone, Plus, Trash2, Target } from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage, MSG } from '../../utils/messages';
import { formatPhone } from '../../utils/phone';
import { formatDateBr, formatDateTimeBr } from '../../utils/timezone';
import { useTenant } from '../../context/TenantContext';
import { intentLabel, getTemperature, daysAgoLabel, TEMPERATURE_META } from '../../utils/intent';

export default function ChatSidebar({ conversation, messages, onClose, onTagsChange }) {
  const { hasFeature } = useTenant();
  const hasIntents = hasFeature('intencoes');
  const [tab, setTab] = useState('detalhes');
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState([]);
  const [intents, setIntents] = useState([]);

  const contactId = conversation?.contactId || conversation?.contact_id || null;

  useEffect(() => {
    setTags(Array.isArray(conversation?.tags) ? conversation.tags : []);
  }, [conversation?.id]);

  useEffect(() => {
    if (!hasIntents || !contactId) { setIntents([]); return; }
    let cancelled = false;
    api.get(`/api/intent-rules/contact/${contactId}`)
      .then(({ data }) => { if (!cancelled) setIntents(Array.isArray(data?.events) ? data.events : []); })
      .catch(() => { if (!cancelled) setIntents([]); });
    return () => { cancelled = true; };
  }, [hasIntents, contactId, conversation?.id]);

  const notes = useMemo(() => messages.filter((m) => m.direction === 'note'), [messages]);

  const addTag = async () => {
    const t = newTag.trim();
    if (!t || tags.includes(t)) { setNewTag(''); return; }
    const next = [...tags, t];
    setTags(next);
    setNewTag('');
    try {
      await api.put(`/api/chats/${conversation.id}/tags`, { tags: next });
      onTagsChange?.(next);
    } catch (e) {
      setTags(tags); // revert
      dialog.toast.error(apiErrorMessage(e, MSG.tagSaveFailed));
    }
  };

  const removeTag = async (t) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    try {
      await api.put(`/api/chats/${conversation.id}/tags`, { tags: next });
      onTagsChange?.(next);
    } catch (e) {
      setTags(tags); // revert
    }
  };

  if (!conversation) return null;
  const name = conversation.contactName || conversation.contact_name || formatPhone(conversation.phone);

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Detalhes</h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        {[
          { key: 'detalhes', label: 'Sobre', icon: User },
          { key: 'tags', label: 'Tags', icon: Tag },
          ...(hasIntents ? [{ key: 'intencoes', label: 'Intenções', icon: Target }] : []),
          { key: 'notas', label: `Notas${notes.length ? ` (${notes.length})` : ''}`, icon: StickyNote },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              tab === key
                ? 'text-brand-600 border-b-2 border-brand-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Detalhes */}
        {tab === 'detalhes' && (
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Nome</div>
              <div className="text-sm text-slate-800">{name}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Telefone</div>
              <div className="text-sm font-mono text-slate-800 flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {formatPhone(conversation.phone)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Conversa iniciada</div>
              <div className="text-sm text-slate-600">
                {formatDateBr(conversation.createdAt || conversation.created_at, {
                  day: '2-digit', month: 'long', year: 'numeric',
                })}
              </div>
            </div>
            {(conversation.contactId || conversation.contact_id) ? (
              <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                Este número está nos seus contatos.
              </div>
            ) : (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Esse número ainda não está nos seus contatos. Você pode salvar ele em <strong>Contatos</strong>.
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {tab === 'tags' && (
          <div>
            <p className="text-xs text-slate-500 mb-3">
              Use tags para organizar suas conversas. Ex: <em>vip, aguardando pgto, fechou</em>.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                placeholder="Nova tag"
                className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <button onClick={addTag} className="px-2 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 border border-brand-100 text-xs px-2 py-1 rounded-full">
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {!tags.length && <p className="text-xs text-slate-400">Sem tags ainda.</p>}
            </div>
          </div>
        )}

        {/* Intenções */}
        {tab === 'intencoes' && (
          <div>
            <p className="text-xs text-slate-500 mb-3">
              Intenções detectadas automaticamente nas mensagens deste contato.
            </p>
            {!contactId ? (
              <p className="text-xs text-slate-400">Vincule um contato para ver as intenções.</p>
            ) : !intents.length ? (
              <p className="text-xs text-slate-400">Nenhuma intenção detectada ainda.</p>
            ) : (
              <div className="space-y-2">
                {intents.map((ev) => {
                  const temp = getTemperature(ev.detectedAt || ev.detected_at);
                  const meta = TEMPERATURE_META[temp];
                  return (
                    <div key={ev.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{intentLabel(ev.intentKey || ev.intent_key)}</p>
                        <p className="text-[10px] text-slate-400">{daysAgoLabel(ev.detectedAt || ev.detected_at)}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Notas */}
        {tab === 'notas' && (
          <div className="space-y-3">
            {!notes.length ? (
              <p className="text-xs text-slate-400">
                Sem notas ainda. Use o botão <StickyNote className="inline w-3 h-3" /> no input de mensagem para criar uma nota interna.
              </p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">{n.body}</p>
                  <p className="text-[10px] text-amber-600 mt-1">
                    {formatDateTimeBr(n.waTimestamp || n.wa_timestamp)}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
