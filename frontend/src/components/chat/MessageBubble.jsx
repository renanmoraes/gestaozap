import React from 'react';
import {
  Check, CheckCheck, Clock, AlertCircle, FileText, StickyNote,
  Download, Mic, Film, File,
} from 'lucide-react';
import AudioPlayer from './AudioPlayer';
import { formatTimeBr } from '../../utils/timezone';

function statusIcon(status) {
  if (status === 'queued') return <Clock className="w-3 h-3 text-slate-400" />;
  if (status === 'sent') return <Check className="w-3 h-3 text-slate-400" />;
  if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-slate-400" />;
  if (status === 'read') return <CheckCheck className="w-3 h-3 text-emerald-500" />;
  if (status === 'failed') return <AlertCircle className="w-3 h-3 text-red-500" />;
  return null;
}

function formatTime(ts) {
  if (!ts) return '';
  return formatTimeBr(ts);
}

export default function MessageBubble({ message }) {
  const m = message;
  const dir = m.direction;
  const ts = m.waTimestamp || m.wa_timestamp;
  const hasMedia = m.hasMedia ?? m.has_media;
  const mediaUrl = m.mediaUrl ?? m.media_url;
  const mediaType = m.mediaType ?? m.media_type;

  // Nota interna — centralizada, fundo âmbar
  if (dir === 'note') {
    return (
      <div className="flex justify-center my-3 px-4">
        <div className="max-w-md bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1 text-amber-700">
            <StickyNote className="w-3 h-3" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">Nota interna · só você vê</span>
          </div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">{m.body}</p>
          <p className="text-[10px] text-amber-600 mt-1 text-right">{formatTime(ts)}</p>
        </div>
      </div>
    );
  }

  const isOut = dir === 'out';
  const bubble = isOut
    ? 'bg-emerald-50 text-emerald-900 border border-emerald-100 rounded-2xl rounded-br-sm'
    : 'bg-white text-slate-800 border border-slate-200 rounded-2xl rounded-bl-sm';

  // Loader para mensagem otimista enquanto sobe
  const isUploading = m._optimistic && hasMedia;

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-1.5 px-4`}>
      <div className={`max-w-[70%] ${bubble} px-3 py-2 shadow-sm`}>
        {hasMedia && (mediaUrl || isUploading) && (
          <div className="mb-1.5">
            {/* IMAGEM */}
            {mediaType === 'image' && mediaUrl && (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={mediaUrl}
                  alt="Imagem"
                  className="rounded-lg max-w-full max-h-80 object-cover cursor-zoom-in"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </a>
            )}

            {/* ÁUDIO — player custom estilo WhatsApp */}
            {mediaType === 'audio' && mediaUrl && (
              <AudioPlayer
                src={mediaUrl}
                mime={m.mediaMime || m.media_mime}
                variant={isOut ? 'out' : 'in'}
              />
            )}

            {/* VÍDEO — player nativo */}
            {mediaType === 'video' && mediaUrl && (
              <video
                src={mediaUrl}
                controls
                preload="metadata"
                className="rounded-lg max-w-full max-h-80"
              />
            )}

            {/* DOCUMENTO / outros — link com ícone */}
            {(mediaType === 'document' || mediaType === 'other' || !mediaType) && mediaUrl && (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                className={`flex items-center gap-2.5 p-2 rounded-lg ${isOut ? 'bg-emerald-100/60 hover:bg-emerald-100' : 'bg-slate-100 hover:bg-slate-200'} transition-colors`}
              >
                <div className={`w-9 h-9 rounded ${isOut ? 'bg-emerald-200' : 'bg-white'} flex items-center justify-center shrink-0`}>
                  <FileText className={`w-4 h-4 ${isOut ? 'text-emerald-700' : 'text-slate-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {decodeURIComponent((mediaUrl.split('/').pop() || 'arquivo').replace(/^chat-/, ''))}
                  </div>
                  <div className="text-[10px] opacity-60 flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    Toque para baixar
                  </div>
                </div>
              </a>
            )}

            {/* Estado upload */}
            {isUploading && !mediaUrl && (
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded ${isOut ? 'bg-emerald-100/60' : 'bg-slate-100'}`}>
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span className="text-xs opacity-80">
                  Enviando {mediaType === 'audio' ? 'áudio' : mediaType === 'video' ? 'vídeo' : 'arquivo'}…
                </span>
              </div>
            )}
          </div>
        )}

        {m.body && (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
        )}
        <div className={`flex items-center gap-1 justify-end text-[10px] mt-1 ${isOut ? 'text-emerald-700/70' : 'text-slate-400'}`}>
          <span>{formatTime(ts)}</span>
          {isOut && statusIcon(m.status)}
        </div>
      </div>
    </div>
  );
}
