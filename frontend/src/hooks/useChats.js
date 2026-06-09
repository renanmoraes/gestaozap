import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { dialog } from '../utils/dialog';
import { apiErrorMessage, MSG } from '../utils/messages';
import { useSocket } from './useSocket';

/**
 * Hook para gerenciar a lista de conversas.
 * - Carrega via GET /api/chats
 * - Reage a chat:message_in/out/upserted/read/tags_changed via Socket.IO
 */
export function useChats({ search = '', tag = null, onlyUnread = false } = {}) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [hasMore, setHasMore]   = useState(false);
  const [nextCursor, setNext]   = useState(null);
  const [sync, setSync]         = useState({ active: false, done: 0, total: 0 });

  const fetchPage = useCallback(async (cursor = null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (tag) params.set('tag', tag);
      if (onlyUnread) params.set('unread', '1');
      if (cursor) params.set('cursor', cursor);
      const { data } = await api.get(`/api/chats?${params}`);
      if (cursor) {
        setItems((prev) => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setHasMore(data.hasMore);
      setNext(data.nextCursor);
    } catch (err) {
      console.warn('useChats fetch:', err.message);
    } finally {
      setLoading(false);
    }
  }, [search, tag, onlyUnread]);

  useEffect(() => { fetchPage(null); }, [fetchPage]);

  const reorderToTop = (conversationId, mutator = (c) => c) => {
    setItems((prev) => {
      const idx = prev.findIndex((c) => c.id === conversationId);
      if (idx === -1) {
        // Conversa nova — fetch da lista para puxar (busca apenas a primeira página)
        fetchPage(null);
        return prev;
      }
      const conv = mutator({ ...prev[idx] });
      const rest = prev.filter((_, i) => i !== idx);
      return [conv, ...rest];
    });
  };

  useSocket({
    'chat:message_in': ({ conversationId, message }) => {
      reorderToTop(conversationId, (c) => ({
        ...c,
        unread_count: (c.unread_count || c.unreadCount || 0) + 1,
        unreadCount:  (c.unread_count || c.unreadCount || 0) + 1,
        last_message_preview: message?.body || '📎 Mídia',
        lastMessagePreview:   message?.body || '📎 Mídia',
        last_message_at: message?.waTimestamp || message?.wa_timestamp || new Date().toISOString(),
        lastMessageAt:   message?.waTimestamp || message?.wa_timestamp || new Date().toISOString(),
      }));
    },
    'chat:message_out': ({ conversationId, message }) => {
      reorderToTop(conversationId, (c) => ({
        ...c,
        last_message_preview: message?.body || '📎 Mídia',
        lastMessagePreview:   message?.body || '📎 Mídia',
        last_message_at: message?.waTimestamp || message?.wa_timestamp || new Date().toISOString(),
        lastMessageAt:   message?.waTimestamp || message?.wa_timestamp || new Date().toISOString(),
        last_message_from_me: true,
        lastMessageFromMe:    true,
      }));
    },
    'chat:read': ({ conversationId }) => {
      setItems((prev) => prev.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0, unreadCount: 0 } : c,
      ));
    },
    'chat:tags_changed': ({ conversationId, tags }) => {
      setItems((prev) => prev.map((c) =>
        c.id === conversationId ? { ...c, tags } : c,
      ));
    },
    'chat:upserted': () => {
      // Refresh leve da primeira página
      fetchPage(null);
    },
    'chat:sync_started': ({ total }) => {
      setSync({ active: true, done: 0, total });
    },
    'chat:sync_progress': ({ done, total }) => {
      setSync({ active: true, done, total });
    },
    'chat:sync_done': ({ count, total }) => {
      setSync({ active: false, done: count || 0, total: total || 0 });
      fetchPage(null);
    },
  });

  const triggerSync = useCallback(async () => {
    try {
      await api.post('/api/chats/sync');
      setSync((s) => ({ ...s, active: true }));
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.syncFailed));
    }
  }, []);

  return {
    items,
    loading,
    hasMore,
    sync,
    loadMore: () => nextCursor && fetchPage(nextCursor),
    refresh: () => fetchPage(null),
    triggerSync,
  };
}
