import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '../api';

const TenantContext = createContext(null);

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant precisa estar dentro de TenantProvider');
  return ctx;
}

function getSlugFromHostname() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null; // dev mode — backend usa DEFAULT_TENANT_ID
  }
  const parts = hostname.split('.');
  return parts.length >= 3 ? parts[0] : null;
}

let _socket = null;

function getSocket(tenantId) {
  if (!_socket) {
    const opts = { path: '/socket.io', auth: { tenantId: tenantId || '' } };
    const url = import.meta.env.VITE_API_URL || undefined;
    _socket = url ? io(url, opts) : io(opts);
  }
  return _socket;
}

export function TenantProvider({ children }) {
  const [tenant, setTenant]   = useState(null);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('gestaozap_token'));
  const [waStatus, setWaStatus] = useState('disconnected');
  const [wrongPhone, setWrongPhone] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verifica sessão ao montar
  useEffect(() => {
    const token = localStorage.getItem('gestaozap_token');
    if (!token) { setIsLoading(false); return; }

    api.get('/api/auth/me')
      .then((r) => {
        setTenant(r.data);
        setAuthToken(token);
        localStorage.setItem('gestaozap_tenant_id', r.data.tenantId);
      })
      .catch(() => {
        localStorage.removeItem('gestaozap_token');
        localStorage.removeItem('gestaozap_tenant_id');
        setAuthToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Busca status WA ao autenticar
  useEffect(() => {
    if (!tenant) return;
    api.get('/api/session').then((r) => setWaStatus(r.data.status)).catch(() => {});
  }, [tenant]);

  // Socket.IO — eventos de sessão WA
  useEffect(() => {
    const tenantId = localStorage.getItem('gestaozap_tenant_id') || '';
    const socket = getSocket(tenantId);

    socket.on('session:status', ({ status }) => setWaStatus(status));
    socket.on('session:ready', () => { setWaStatus('connected'); setWrongPhone(null); });
    socket.on('session:disconnected', () => setWaStatus('disconnected'));
    socket.on('session:wrong_phone', ({ message }) => {
      setWaStatus('disconnected');
      setWrongPhone(message);
    });

    return () => {
      socket.off('session:status');
      socket.off('session:ready');
      socket.off('session:disconnected');
      socket.off('session:wrong_phone');
    };
  }, []);

  const login = useCallback((token, tenantData) => {
    localStorage.setItem('gestaozap_token', token);
    if (tenantData?.tenantId) localStorage.setItem('gestaozap_tenant_id', tenantData.tenantId);
    setAuthToken(token);
    setTenant(tenantData);
  }, []);

  const logout = useCallback(() => {
    api.post('/api/auth/logout').catch(() => {});
    localStorage.removeItem('gestaozap_token');
    localStorage.removeItem('gestaozap_tenant_id');
    setAuthToken(null);
    setTenant(null);
    setWaStatus('disconnected');
  }, []);

  const acceptTerms = useCallback(async () => {
    await api.post('/api/auth/terms');
    setTenant((t) => t ? { ...t, termsAccepted: true } : t);
  }, []);

  return (
    <TenantContext.Provider value={{
      tenant, authToken, waStatus, wrongPhone, isLoading,
      isAuthenticated: Boolean(authToken && tenant),
      login, logout, acceptTerms,
      slug: getSlugFromHostname(),
    }}>
      {children}
    </TenantContext.Provider>
  );
}
