import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let socket = null;

export function useSocket(events) {
  const handlersRef = useRef(events);
  handlersRef.current = events;

  useEffect(() => {
    if (!socket) socket = io(SOCKET_URL);

    const attached = Object.entries(handlersRef.current).map(([event, handler]) => {
      const wrapped = (...args) => handler(...args);
      socket.on(event, wrapped);
      return [event, wrapped];
    });

    return () => {
      attached.forEach(([event, wrapped]) => socket.off(event, wrapped));
    };
  }, []);

  return socket;
}
