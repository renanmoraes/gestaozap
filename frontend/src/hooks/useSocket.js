import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

let socket = null;
let currentTenantId = null;

function getOrCreateSocket(tenantId) {
  // Reconectar se o tenantId mudou
  if (socket && currentTenantId !== tenantId) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    currentTenantId = tenantId;
    const opts = {
      path: '/socket.io',
      auth: { tenantId: tenantId || '' },
    };
    socket = SOCKET_URL ? io(SOCKET_URL, opts) : io(opts);
  }

  return socket;
}

export function useSocket(events, tenantId) {
  const handlersRef = useRef(events);
  handlersRef.current = events;

  // tenantId lido do localStorage como fallback
  const resolvedTenantId = tenantId || localStorage.getItem('gestaozap_tenant_id') || '';

  useEffect(() => {
    const s = getOrCreateSocket(resolvedTenantId);

    const attached = Object.entries(handlersRef.current).map(([event, handler]) => {
      const wrapped = (...args) => handler(...args);
      s.on(event, wrapped);
      return [event, wrapped];
    });

    return () => {
      attached.forEach(([event, wrapped]) => s.off(event, wrapped));
    };
  }, [resolvedTenantId]);

  return socket;
}
