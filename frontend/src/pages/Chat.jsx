import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useChats } from '../hooks/useChats';
import { useMessages } from '../hooks/useMessages';
import ConversationList from '../components/chat/ConversationList';
import ConversationHeader from '../components/chat/ConversationHeader';
import MessageList from '../components/chat/MessageList';
import MessageInput from '../components/chat/MessageInput';
import ChatSidebar from '../components/chat/ChatSidebar';
import TemplateSendPicker from '../components/chat/TemplateSendPicker';
import EmptyChat from '../components/chat/EmptyChat';
import UpsellBanner from '../components/UpsellBanner';
import { useTenant } from '../context/TenantContext';

export default function Chat() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { hasFeature } = useTenant();

  // Filtros da lista
  const [search, setSearch]         = useState('');
  const [tag, setTag]               = useState(null);
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Estado de UI
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [templateOpen, setTemplateOpen] = useState(false);

  // Quick replies (carrega 1x)
  const [quickReplies, setQuickReplies] = useState([]);

  // Hooks de dados
  const { items: conversations, loading: convsLoading, sync, triggerSync } = useChats({
    search, tag, onlyUnread,
  });

  const [activeConv, setActiveConv] = useState(null);
  const { items: messages, loading: msgsLoading, loadingMore, hasMore, loadOlder, addOptimistic } = useMessages(chatId);

  useEffect(() => {
    api.get('/api/quick-replies').then((r) => setQuickReplies(r.data)).catch(() => {});
  }, []);

  // Carrega detalhes da conversa selecionada + marca como lida
  useEffect(() => {
    if (!chatId) { setActiveConv(null); return; }
    api.get(`/api/chats/${chatId}`)
      .then((r) => {
        setActiveConv(r.data);
        // Marca como lida ao abrir
        api.post(`/api/chats/${chatId}/read`).catch(() => {});
      })
      .catch(() => {
        setActiveConv(null);
        navigate('/chat', { replace: true });
      });
  }, [chatId, navigate]);

  const selectChat = useCallback((id) => navigate(`/chat/${id}`), [navigate]);

  const handleNote = async (body) => {
    if (!chatId) return;
    await api.post(`/api/chats/${chatId}/notes`, { body });
  };

  const handleUseReply = (replyId) => {
    api.post(`/api/quick-replies/${replyId}/use`).catch(() => {});
  };

  const handleTagsChange = (newTags) => {
    setActiveConv((c) => c ? { ...c, tags: newTags } : c);
  };

  return (
    <div className="h-[100vh] flex bg-slate-50 overflow-hidden">
      <ConversationList
        conversations={conversations}
        loading={convsLoading}
        selectedId={chatId}
        onSelect={selectChat}
        search={search}
        setSearch={setSearch}
        tag={tag}
        setTag={setTag}
        onlyUnread={onlyUnread}
        setOnlyUnread={setOnlyUnread}
        sync={sync}
        onSync={triggerSync}
      />

      {/* Painel central */}
      <main className="flex-1 flex flex-col h-full min-w-0">
        <UpsellBanner context="chat" className="m-2 shrink-0" />
        {!activeConv ? (
          <EmptyChat />
        ) : (
          <>
            <ConversationHeader
              conversation={activeConv}
              onMarkRead={() => api.post(`/api/chats/${chatId}/read`).catch(() => {})}
              onOpenTemplate={() => setTemplateOpen(true)}
              onToggleSidebar={() => setSidebarOpen((s) => !s)}
              sidebarOpen={sidebarOpen}
            />
            <MessageList
              messages={messages}
              loading={msgsLoading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadOlder={loadOlder}
            />
            <MessageInput
              chatId={chatId}
              contactName={activeConv?.contactName || activeConv?.contact_name}
              onOptimisticSend={addOptimistic}
              onNote={handleNote}
              replies={quickReplies}
              onUseReply={handleUseReply}
              bookingEnabled={hasFeature('agendamentos')}
              promotionLinksEnabled={hasFeature('vitrine-promocoes')}
            />
          </>
        )}
      </main>

      {/* Sidebar direita */}
      {activeConv && sidebarOpen && (
        <ChatSidebar
          conversation={activeConv}
          messages={messages}
          onClose={() => setSidebarOpen(false)}
          onTagsChange={handleTagsChange}
        />
      )}

      {/* Modal de template */}
      {templateOpen && activeConv && (
        <TemplateSendPicker
          chatId={chatId}
          onClose={() => setTemplateOpen(false)}
        />
      )}
    </div>
  );
}
