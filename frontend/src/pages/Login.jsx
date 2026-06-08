import React, { useState, useEffect } from 'react';
import { Zap, LogIn, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../api';
import { useTenant } from '../context/TenantContext';
import Terms from './Terms';

export default function Login() {
  const { login, acceptTerms } = useTenant();
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [showTerms, setShowTerms]   = useState(false);
  const [pendingData, setPendingData] = useState(null); // { token, tenantData }
  const [tenantInfo, setTenantInfo] = useState(null);

  // Tenta buscar nome do tenant pelo subdomínio (funciona mesmo sem token)
  useEffect(() => {
    api.get('/api/auth/me').then((r) => setTenantInfo(r.data)).catch(() => {});
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/api/auth/login');
      if (!data.termsAccepted) {
        // Precisa aceitar os termos antes de entrar
        setPendingData({ token: data.token, tenantData: data });
        setShowTerms(true);
      } else {
        login(data.token, data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível conectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptTerms = async () => {
    try {
      await acceptTerms();
      if (pendingData) login(pendingData.token, pendingData.tenantData);
    } catch {
      setError('Erro ao registrar aceite dos termos. Tente novamente.');
      setShowTerms(false);
    }
  };

  if (showTerms) {
    return (
      <Terms
        onAccept={handleAcceptTerms}
        onDecline={() => { setShowTerms(false); setPendingData(null); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg leading-none">GestãoZap</div>
            <div className="text-xs text-slate-400 mt-0.5">Disparos profissionais</div>
          </div>
        </div>

        <div className="card p-7 shadow-sm">
          {tenantInfo?.tenantName && (
            <div className="text-center mb-6">
              <h1 className="text-lg font-semibold text-slate-900">{tenantInfo.tenantName}</h1>
              <p className="text-sm text-slate-500 mt-1">Bem-vindo de volta</p>
            </div>
          )}

          {!tenantInfo?.tenantName && (
            <div className="text-center mb-6">
              <h1 className="text-lg font-semibold text-slate-900">Acesse sua conta</h1>
              <p className="text-sm text-slate-500 mt-1">Plataforma de disparos via WhatsApp</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <LogIn className="w-4 h-4" />
            }
            {loading ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="text-xs text-slate-400 text-center mt-4">
            Ao entrar, você concorda com os nossos{' '}
            <button
              onClick={() => setShowTerms(true)}
              className="underline hover:text-slate-600"
            >
              Termos de Uso
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
