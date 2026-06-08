import React, { useState, useEffect } from 'react';
import { Zap, LogIn, AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import api from '../api';
import { useTenant } from '../context/TenantContext';
import Terms from './Terms';

export default function Login() {
  const { login, acceptTerms } = useTenant();
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(null);
  const [showTerms, setShowTerms]   = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [email, setEmail]           = useState('');
  const [linkSent, setLinkSent]     = useState(false);
  const [magicToken, setMagicToken] = useState(null);

  // Extrai token da URL se presente (retorno do magic link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setMagicToken(token);
      verifyToken(token);
    }
    api.get('/api/auth/me').then((r) => setTenantInfo(r.data)).catch(() => {});
  }, []);

  const verifyToken = async (token) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/api/auth/verify-magic-link', { token });
      if (!data.termsAccepted) {
        setPendingData({ token: data.token, tenantData: data });
        setShowTerms(true);
      } else {
        login(data.token, data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Link inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMagicLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { data } = await api.post('/api/auth/send-magic-link', { email });
      setSuccess(data.message);
      setLinkSent(true);
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao enviar link. Tente novamente.');
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
          <div className="text-center mb-6">
            <h1 className="text-lg font-semibold text-slate-900">
              {tenantInfo?.tenantName || 'Acesse sua conta'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {linkSent ? 'Link enviado! Verifique seu email.' : 'Via magic link'}
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm mb-4">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {magicToken && loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <span className="w-6 h-6 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600">Verificando link...</p>
            </div>
          )}

          {!linkSent && !magicToken && (
            <form onSubmit={handleSendMagicLink}>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent mb-4"
              />
              <button
                type="submit"
                disabled={loading || !email}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                {loading ? 'Enviando…' : 'Enviar link de acesso'}
              </button>
            </form>
          )}

          {linkSent && (
            <button
              onClick={() => setLinkSent(false)}
              className="w-full px-3 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg"
            >
              Usar outro email
            </button>
          )}

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
