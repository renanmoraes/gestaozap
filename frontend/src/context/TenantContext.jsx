import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '../api';
import ChangePassword from '../pages/ChangePassword';
import SignupPending from '../pages/SignupPending';

const BLOCKING_STATES = ['pending_approval', 'rejected', 'trial_expired', 'no_contract', 'contract_expired'];

const TenantContext = createContext(null);

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant precisa estar dentro de TenantProvider');
  return ctx;
}

function getSlugFromHostname() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
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
  const [tenant, setTenant] = useState(null);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('gestaozap_token'));
  const [mustChangePwd, setMustChangePwd] = useState(false);
  const [waStatus, setWaStatus] = useState('disconnected');
  const [wrongPhone, setWrongPhone] = useState(null);
  const [accessState, setAccessState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(() => {
    const token = localStorage.getItem('gestaozap_token');
    if (!token) { setIsLoading(false); return Promise.resolve(); }

    return api.get('/api/auth/me')
      .then((r) => {
        setTenant(r.data);
        setAuthToken(token);
        setMustChangePwd(Boolean(r.data.user?.mustChangePwd));
        if (r.data.tenantId) localStorage.setItem('gestaozap_tenant_id', r.data.tenantId);
      })
      .catch(() => {
        localStorage.removeItem('gestaozap_token');
        localStorage.removeItem('gestaozap_tenant_id');
        setAuthToken(null);
        setTenant(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  useEffect(() => {
    if (!tenant?.tenantId) return;
    api.get('/api/session')
      .then((r) => { setWaStatus(r.data.status); setAccessState('active'); })
      .catch((err) => {
        const st = err.response?.status === 403 ? err.response?.data?.state : null;
        if (st) setAccessState(st);
      });
  }, [tenant]);

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
    setMustChangePwd(Boolean(tenantData?.user?.mustChangePwd));
  }, []);

  const logout = useCallback(() => {
    api.post('/api/auth/logout').catch(() => {});
    localStorage.removeItem('gestaozap_token');
    localStorage.removeItem('gestaozap_tenant_id');
    setAuthToken(null);
    setTenant(null);
    setMustChangePwd(false);
    setWaStatus('disconnected');
  }, []);

  const acceptTerms = useCallback(async () => {
    await api.post('/api/auth/terms');
    setTenant((t) => t ? { ...t, termsAccepted: true } : t);
  }, []);

  const onPasswordChanged = useCallback(async () => {
    setMustChangePwd(false);
    await loadSession();
  }, [loadSession]);

  if (mustChangePwd && authToken) {
    return <ChangePassword onSuccess={onPasswordChanged} />;
  }

  // Conta sem acesso ao produto (aprovação pendente, trial expirado, etc.)
  if (authToken && tenant && BLOCKING_STATES.includes(accessState)) {
    return <SignupPending state={accessState} onLogout={logout} />;
  }

  return (
    <TenantContext.Provider value={{
      tenant, authToken, waStatus, wrongPhone, isLoading, mustChangePwd,
      isAuthenticated: Boolean(authToken && tenant),
      login, logout, acceptTerms,
      slug: getSlugFromHostname(),
    }}>
      {children}
    </TenantContext.Provider>
  );
}
