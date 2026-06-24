import { useEffect } from 'react';
import api from '../api';

// Bem abaixo do teardown por ociosidade (10 min) no backend, com margem para
// pings perdidos. Mantém a sessão viva enquanto a tela operacional está aberta.
const HEARTBEAT_MS = 90_000;

/**
 * Mantém a sessão WhatsApp conectada enquanto a tela operacional (Conversas /
 * Sessão) estiver aberta: religa ao entrar e pinga periodicamente para renovar
 * o timer de ociosidade no backend — assim o usuário não fica desconectado
 * recebendo/respondendo mensagens. Ao sair da tela, o ping para e a sessão volta
 * a cair sob demanda (modelo anti-OOM).
 */
export function useKeepWaAlive(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const ping = () => {
      // Não desperdiça ping com a aba em segundo plano.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      api.post('/api/session/keepalive').catch(() => {});
    };

    ping(); // religa imediatamente ao abrir a tela
    const id = setInterval(ping, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
