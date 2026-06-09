import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Paperclip, StickyNote, X, Image as ImgIcon,
  Mic, FileText, Film, File,
} from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage, MSG } from '../../utils/messages';
import QuickReplyPicker from './QuickReplyPicker';
import {
  CHAT_ACCEPT,
  CHAT_UPLOAD_HINT,
  formatFileSize,
  validateChatFile,
} from '../../utils/upload';
import { formatTemplateDateBr, formatTemplateTimeBr } from '../../utils/timezone';

function iconForFile(file) {
  if (!file) return File;
  if (file.type.startsWith('image/')) return ImgIcon;
  if (file.type.startsWith('audio/')) return Mic;
  if (file.type.startsWith('video/')) return Film;
  return FileText;
}

export default function MessageInput({ chatId, contactName, onOptimisticSend, onNote, disabled, replies, onUseReply }) {
  const [body, setBody]           = useState('');
  const [file, setFile]           = useState(null);
  const [fileError, setFileError] = useState('');
  const [isNote, setIsNote]       = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sending, setSending]     = useState(false);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // Auto-resize
  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [body]);

  // Foco ao trocar de conversa
  useEffect(() => {
    taRef.current?.focus();
    setBody(''); setFile(null); setFileError(''); setIsNote(false); setShowPicker(false);
  }, [chatId]);

  // Detecta "/" no início → abre QuickReplyPicker
  useEffect(() => {
    const open = body.startsWith('/') && !isNote;
    setShowPicker(open);
    if (open) setActiveIndex(0);
  }, [body, isNote]);

  const applyReply = (reply) => {
    // Substitui variáveis automáticas: {nome}, {data}, {hora}.
    // As outras ({evento}, {local}, etc) ficam para o usuário preencher antes de enviar.
    const now = new Date();
    const filled = String(reply.body || '')
      .replace(/\{nome\}/gi, contactName || '')
      .replace(/\{data\}/gi, formatTemplateDateBr(now))
      .replace(/\{hora\}/gi, formatTemplateTimeBr(now));
    setBody(filled);
    setShowPicker(false);
    onUseReply?.(reply.id);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      // Move o cursor para o final
      if (taRef.current) taRef.current.setSelectionRange(filled.length, filled.length);
    });
  };

  const handleKey = (e) => {
    if (showPicker && replies?.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, replies.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        const q = body.toLowerCase().replace(/^\//, '');
        const list = q
          ? replies.filter((r) => r.shortcut.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q))
          : replies;
        if (list[activeIndex]) {
          e.preventDefault();
          applyReply(list[activeIndex]);
          return;
        }
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowPicker(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (selected) => {
    if (!selected) {
      setFile(null);
      setFileError('');
      return;
    }
    const result = validateChatFile(selected);
    if (!result.ok) {
      setFile(null);
      setFileError(result.error);
      return;
    }
    setFileError('');
    setFile(selected);
  };

  const handleSend = async () => {
    if (sending || disabled || fileError) return;
    const text = body.trim();
    if (!text && !file) return;

    setSending(true);
    try {
      if (isNote) {
        await onNote?.(text);
        setBody('');
      } else {
        // Optimistic
        const optimisticId = `tmp-${Date.now()}`;
        const mediaType = file
          ? (file.type.startsWith('image/') ? 'image'
            : file.type.startsWith('audio/') ? 'audio'
            : file.type.startsWith('video/') ? 'video'
            : 'document')
          : null;
        onOptimisticSend?.({
          id: optimisticId,
          direction: 'out',
          body: text,
          status: 'queued',
          waTimestamp: new Date().toISOString(),
          hasMedia: Boolean(file),
          mediaType,
        });

        const formData = new FormData();
        formData.append('body', text);
        if (file) formData.append('file', file);
        await api.post(`/api/chats/${chatId}/messages`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setBody(''); setFile(null); setFileError('');
      }
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.sendFailed));
    } finally {
      setSending(false);
      requestAnimationFrame(() => taRef.current?.focus());
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3 shrink-0">
      {/* Preview do arquivo */}
      {file && (() => {
        const Icon = iconForFile(file);
        const isImage = file.type.startsWith('image/');
        return (
          <div className="mb-2 flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
            {isImage ? (
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="w-10 h-10 rounded object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-700 truncate font-medium">{file.name}</div>
              <div className="text-[10px] text-slate-400">{formatFileSize(file.size)}</div>
            </div>
            <button onClick={() => { setFile(null); setFileError(''); }} className="p-1 text-slate-400 hover:text-red-500 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })()}

      {fileError && (
        <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 px-2.5 py-2 rounded-lg">
          {fileError}
        </div>
      )}

      {/* Toggle de nota */}
      {isNote && (
        <div className="mb-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-lg">
          <StickyNote className="w-3.5 h-3.5" />
          <span>Esta mensagem será salva como <strong>nota interna</strong> — o cliente não vê.</span>
        </div>
      )}

      <div className="relative flex items-end gap-2">
        {showPicker && replies?.length > 0 && (
          <QuickReplyPicker
            replies={replies}
            query={body}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            onPick={applyReply}
            onClose={() => setShowPicker(false)}
          />
        )}

        <button
          onClick={() => setIsNote((n) => !n)}
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            isNote ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:bg-slate-100'
          }`}
          title={isNote ? 'Trocar para mensagem normal' : 'Salvar como nota interna'}
        >
          <StickyNote className="w-4 h-4" />
        </button>

        {!isNote && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0"
              title={CHAT_UPLOAD_HINT}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={CHAT_ACCEPT}
              hidden
              onChange={(e) => {
                handleFileSelect(e.target.files[0] || null);
                e.target.value = '';
              }}
            />
          </>
        )}

        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={disabled || sending}
          placeholder={
            disabled
              ? 'WhatsApp desconectado'
              : isNote
                ? 'Escreva uma nota interna (só você vê)'
                : 'Mensagem — Enter para enviar · Shift+Enter para quebrar linha · / para mensagens rápidas'
          }
          className="flex-1 resize-none px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none disabled:bg-slate-50 disabled:text-slate-400 max-h-40"
        />

        <button
          onClick={handleSend}
          disabled={(!body.trim() && !file) || sending || disabled || Boolean(fileError)}
          className={`p-2.5 rounded-lg transition-colors shrink-0 ${
            (body.trim() || file) && !disabled
              ? 'bg-brand-600 text-white hover:bg-brand-700'
              : 'bg-slate-100 text-slate-400 cursor-default'
          }`}
          title="Enviar (Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {!isNote && (
        <p className="mt-2 text-[10px] text-slate-400 leading-snug">
          {CHAT_UPLOAD_HINT}
        </p>
      )}
    </div>
  );
}
