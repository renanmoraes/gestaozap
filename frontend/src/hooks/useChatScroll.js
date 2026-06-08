import { useRef, useEffect, useCallback, useState } from 'react';

const NEAR_BOTTOM_THRESHOLD = 80;

/**
 * Auto-scroll inteligente:
 * - Cola no fim quando usuário está perto do fim
 * - Não força scroll se usuário rolou para cima
 * - Carrega mensagens antigas ao chegar no topo
 */
export function useChatScroll(items, { onLoadOlder, canLoadOlder } = {}) {
  const containerRef = useRef(null);
  const lastItemsLengthRef = useRef(0);
  const [nearBottom, setNearBottom] = useState(true);
  const [showJumpToBottom, setShowJump] = useState(false);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Detecta posição do scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNear = distFromBottom < NEAR_BOTTOM_THRESHOLD;
    setNearBottom(isNear);
    setShowJump(!isNear);

    // Topo → carregar mais antigas
    if (el.scrollTop < 60 && canLoadOlder && onLoadOlder) {
      const prevScrollHeight = el.scrollHeight;
      onLoadOlder();
      // Mantém posição visual após inserir mensagens antigas no topo
      setTimeout(() => {
        if (containerRef.current) {
          const newScrollHeight = containerRef.current.scrollHeight;
          containerRef.current.scrollTop = newScrollHeight - prevScrollHeight;
        }
      }, 50);
    }
  }, [onLoadOlder, canLoadOlder]);

  // Cola no fim quando nova mensagem chega E usuário estava perto do fim
  useEffect(() => {
    const currentLength = items?.length || 0;
    const grew = currentLength > lastItemsLengthRef.current;
    if (grew && nearBottom) {
      // Aguarda render
      requestAnimationFrame(() => scrollToBottom(false));
    }
    lastItemsLengthRef.current = currentLength;
  }, [items, nearBottom, scrollToBottom]);

  // Scroll inicial para o fim ao trocar de conversa
  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom(false));
  }, [scrollToBottom]); // só na montagem

  return {
    containerRef,
    handleScroll,
    scrollToBottom,
    showJumpToBottom,
    nearBottom,
  };
}
