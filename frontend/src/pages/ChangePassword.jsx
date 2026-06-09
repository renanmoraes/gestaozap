import React, { useState } from 'react';
import { KeyRound, AlertCircle } from 'lucide-react';
import api from '../api';

export default function ChangePassword({ onSuccess, oldPassword: initialOldPassword = '' }) {
  const [oldPassword, setOldPassword] = useState(initialOldPassword);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/change-password', { oldPassword, newPassword });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess?.();
    } catch (err) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(err.response?.data?.error || 'Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-brand-600" />
            <h1 className="text-lg font-semibold text-slate-900">Alterar senha</h1>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            Por segurança, defina uma nova senha antes de continuar.
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!initialOldPassword && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Senha atual</label>
                <input
                  type="password"
                  className="input"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Nova senha</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Confirmar nova senha</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
