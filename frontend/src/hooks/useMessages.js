import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import { useSocket } from './useSocket';

/**
 * Hook para mensagens de uma conversa.
 * Items ficam em ordem cronológica (mais antiga primeiro).
 */
export function useMessages(chatId) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNext] = useState(null);
  const chatIdRef = useRef(chatId);

  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);

  const fetchPage = useCallback(async (before = null) => {
    if (!chatId) { setItems([]); return; }
    if (before) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (before) params.set('before', before);
      params.set('limit', '50');
      const { data } = await api.get(`/api/chats/${chatId}/messages?${params}`);
      if (before) {
        // Items são cronológicos (mais antigo → mais novo). Antigas vão na frente.
        setItems((prev) => [...data.items, ...prev]);
      } else {
        setItems(data.items);
      }
      setHasMore(data.hasMore);
      setNext(data.nextBefore);
    } catch (err) {
      console.warn('useMessages fetch:', err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [chatId]);

  useEffect(() => { fetchPage(null); }, [fetchPage]);

  // Atualizações via socket — só aplica se conversation_id bate
  useSocket({
    'chat:message_in': ({ conversationId, message }) => {
      if (conversationId !== chatIdRef.current) return;
      setItems((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    },
    'chat:message_out': ({ conversationId, message }) => {
      if (conversationId !== chatIdRef.current) return;
      setItems((prev) => {
        // Se já tem essa mensagem real, não faz nada
        if (prev.some((m) => m.id === message.id && !m._optimistic)) return prev;
        // Remove TODAS as otimistas com mesmo body (ou ambas sem body, só mídia).
        // Timestamp pode divergir muito entre client/WhatsApp, então só compara conteúdo.
        const newBody = (message.body || '').trim();
        const newHasMedia = Boolean(message.hasMedia ?? message.has_media);
        const filtered = prev.filter((m) => {
          if (!m._optimistic) return true;
          const mBody = (m.body || '').trim();
          const mHasMedia = Boolean(m.hasMedia ?? m.has_media);
          // Mesmo texto → é a otimista correspondente
          if (newBody && mBody && newBody === mBody) return false;
          // Ambas só mídia (sem texto) → considera dedup
          if (!newBody && !mBody && newHasMedia && mHasMedia) return false;
          return true;
        });
        return [...filtered, message];
      });
    },
    'chat:note_added': ({ conversationId, message }) => {
      if (conversationId !== chatIdRef.current) return;
      setItems((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    },
    'chat:message_status': ({ conversationId, messageId, status }) => {
      if (conversationId !== chatIdRef.current) return;
      setItems((prev) => prev.map((m) => m.id === messageId ? { ...m, status } : m));
    },
  });

  const addOptimistic = (msg) => setItems((prev) => [...prev, { ...msg, _optimistic: true }]);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    loadOlder: () => nextBefore && fetchPage(nextBefore),
    addOptimistic,
  };
}
