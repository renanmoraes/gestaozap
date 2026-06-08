import React, { useState } from 'react';
import { Zap, LogIn, AlertCircle, KeyRound } from 'lucide-react';
import api from '../api';
import { useTenant } from '../context/TenantContext';
import Terms from './Terms';
import ChangePassword from './ChangePassword';

export default function Login() {
  const { login, acceptTerms } = useTenant();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [form, setForm] = useState({ companyId: '', email: '', password: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/api/auth/login', {
        companyId: form.companyId.trim(),
        email: form.email,
        password: form.password,
      });

      if (data.user?.mustChangePwd) {
        localStorage.setItem('gestaozap_token', data.token);
        if (data.tenantId) localStorage.setItem('gestaozap_tenant_id', data.tenantId);
        setPendingData(data);
        setShowChangePwd(true);
        return;
      }

      if (!data.termsAccepted) {
        localStorage.setItem('gestaozap_token', data.token);
        if (data.tenantId) localStorage.setItem('gestaozap_tenant_id', data.tenantId);
        setPendingData(data);
        setShowTerms(true);
        return;
      }

      login(data.token, data);
    } catch (err) {
      setError(err.response?.data?.error || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChanged = () => {
    setShowChangePwd(false);
    if (pendingData && !pendingData.termsAccepted) {
      setShowTerms(true);
    } else if (pendingData) {
      login(localStorage.getItem('gestaozap_token'), { ...pendingData, user: { ...pendingData.user, mustChangePwd: false } });
    }
  };

  const handleAcceptTerms = async () => {
    try {
      await acceptTerms();
      if (pendingData) login(pendingData.token || localStorage.getItem('gestaozap_token'), pendingData);
    } catch {
      setError('Erro ao registrar aceite dos termos. Tente novamente.');
      setShowTerms(false);
    }
  };

  if (showChangePwd) {
    return <ChangePassword onSuccess={handlePasswordChanged} oldPassword={form.password} />;
  }

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
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg leading-none">GestãoZap</div>
            <div className="text-xs text-slate-400 mt-0.5">Acesse sua conta</div>
          </div>
        </div>

        <div className="card p-7 shadow-sm">
          <div className="text-center mb-6">
            <h1 className="text-lg font-semibold text-slate-900">Entrar</h1>
            <p className="text-sm text-slate-500 mt-1">Use os dados enviados no seu email de boas-vindas</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Identificador da empresa</label>
              <input
                type="text"
                className="input font-mono"
                placeholder="Ex: A1B2C3D4E5"
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                className="input"
                placeholder="seu@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Senha</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {loading
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <LogIn className="w-4 h-4" />}
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-4 flex items-center justify-center gap-1">
            <KeyRound className="w-3 h-3" />
            No primeiro acesso você precisará alterar a senha
          </p>
        </div>
      </div>
    </div>
  );
}
