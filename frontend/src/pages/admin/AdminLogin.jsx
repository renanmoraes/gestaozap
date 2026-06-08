import React, { useState } from 'react';
import { ShieldCheck, AlertCircle, LogIn } from 'lucide-react';
import api from '../../api';

export default function AdminLogin({ onLogin }) {
  const [form, setForm] = useState({ companyId: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/api/auth/login', {
        companyId: form.companyId.trim(),
        email: form.email,
        password: form.password,
      }, {
        headers: { 'X-Tenant-Slug': 'admin' },
      });
      localStorage.setItem('gestaozap_admin_token', data.token);
      onLogin(data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg leading-none">GestãoZap</div>
            <div className="text-xs text-slate-400 mt-0.5">Painel Administrativo</div>
          </div>
        </div>

        <div className="card p-7 shadow-sm">
          <h1 className="text-base font-semibold text-slate-900 mb-5 text-center">Acesso restrito</h1>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Identificador da empresa</label>
              <input
                type="text"
                className="input font-mono"
                placeholder="Identificador"
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
                autoComplete="off"
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
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {loading
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <LogIn className="w-4 h-4" />}
              {loading ? 'Verificando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
