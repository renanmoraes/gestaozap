import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useSocket } from './useSocket';

/**
 * Notificações globais de mensagens novas (vale em qualquer tela / aba):
 *  - Notificação do navegador quando a aba está oculta ou fora da tela de chat.
 *  - Contador de não-lidas no título da aba: "(N) ...".
 *  - Bolinha vermelha com a contagem desenhada sobre o favicon.
 * Montado uma vez no layout autenticado (TenantLayout).
 */
export function useChatNotifications(basePath = '') {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const baseTitleRef = useRef(null);
  const faviconBaseRef = useRef(null);

  const isOnChatScreen = () =>
    typeof window !== 'undefined' && window.location.pathname.includes('/chat');

  const refreshUnread = useCallback(() => {
    api.get('/api/chats/unread-count')
      .then((r) => setUnread(Number(r.data?.count) || 0))
      .catch(() => {});
  }, []);

  // Permissão + contagem inicial
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    refreshUnread();
    const onFocus = () => refreshUnread();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshUnread]);

  // Badge no título da aba
  useEffect(() => {
    if (baseTitleRef.current === null) {
      baseTitleRef.current = document.title.replace(/^\(\d+\+?\)\s*/, '');
    }
    const base = baseTitleRef.current || 'GestãoZap';
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
  }, [unread]);

  // Bolinha vermelha sobre o favicon (best-effort)
  useEffect(() => {
    let cancelled = false;
    try {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      if (faviconBaseRef.current === null) faviconBaseRef.current = link.href || '/favicon.ico';
      if (unread === 0) {
        link.href = faviconBaseRef.current;
        return undefined;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const r = 19;
        ctx.beginPath();
        ctx.arc(size - r, r, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 26px -apple-system, Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unread > 9 ? '9+' : String(unread), size - r, r + 1);
        try { link.href = canvas.toDataURL('image/png'); } catch (_) { /* tainted */ }
      };
      img.src = faviconBaseRef.current;
    } catch (_) { /* sem favicon manipulável */ }
    return () => { cancelled = true; };
  }, [unread]);

  // Eventos de chat em tempo real
  useSocket({
    'chat:message_in': (payload) => {
      const { conversationId, contactName, preview, message, avatarUrl, isGroup } = payload || {};
      // Reconcilia a contagem com o servidor (fonte da verdade).
      refreshUnread();
      // Só notifica quando o usuário NÃO está vendo o chat (outra aba ou outra tela).
      const away = (typeof document !== 'undefined' && document.hidden) || !isOnChatScreen();
      if (!away) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      try {
        const title = contactName || (isGroup ? 'Mensagem em grupo' : 'Nova mensagem');
        const body = preview || message?.body || 'Você recebeu uma nova mensagem';
        const n = new Notification(title, {
          body,
          tag: conversationId || undefined,   // mesma conversa substitui a anterior
          icon: avatarUrl || '/favicon.ico',
          renotify: false,
        });
        n.onclick = () => {
          window.focus();
          if (conversationId) navigate(`${basePath}/chat/${conversationId}`);
          n.close();
        };
      } catch (_) { /* notificação bloqueada */ }
    },
    'chat:read': () => refreshUnread(),
    'chat:read_all': () => setUnread(0),
    'chat:message_out': () => refreshUnread(),
  });

  return { unread, refreshUnread };
}
