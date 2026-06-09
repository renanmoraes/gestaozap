import React from 'react';
import { Zap, Clock, XCircle, CalendarX, LogOut } from 'lucide-react';

const STATES = {
  pending_approval: {
    icon: Clock,
    color: 'amber',
    title: 'Conta em análise',
    message: 'Recebemos seu cadastro e ele está sendo analisado. Você receberá um email assim que for aprovado e seu período de teste grátis começar.',
  },
  rejected: {
    icon: XCircle,
    color: 'red',
    title: 'Cadastro não aprovado',
    message: 'Infelizmente seu cadastro não foi aprovado no momento. Entre em contato com o suporte em caso de dúvidas.',
  },
  trial_expired: {
    icon: CalendarX,
    color: 'amber',
    title: 'Seu teste grátis terminou',
    message: 'O período de teste da sua conta foi encerrado. Para continuar enviando mensagens, entre em contato para ativar seu plano.',
  },
  no_contract: {
    icon: CalendarX,
    color: 'slate',
    title: 'Sem plano ativo',
    message: 'Sua conta ainda não tem um plano ativo. Entre em contato com o suporte para começar.',
  },
  contract_expired: {
    icon: CalendarX,
    color: 'amber',
    title: 'Plano expirado',
    message: 'Seu plano expirou. Para voltar a usar a conta, regularize o pagamento ou entre em contato com o suporte.',
  },
};

const COLOR_BG = { amber: 'bg-amber-100', red: 'bg-red-100', slate: 'bg-slate-100' };
const COLOR_FG = { amber: 'text-amber-600', red: 'text-red-600', slate: 'text-slate-500' };

export default function SignupPending({ state = 'pending_approval', onLogout }) {
  const cfg = STATES[state] || STATES.pending_approval;
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="font-bold text-slate-900 text-lg">GestãoZap</div>
        </div>

        <div className="card p-8 text-center shadow-sm">
          <div className={`w-14 h-14 rounded-full ${COLOR_BG[cfg.color]} flex items-center justify-center mx-auto mb-4`}>
            <Icon className={`w-7 h-7 ${COLOR_FG[cfg.color]}`} />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">{cfg.title}</h1>
          <p className="text-sm text-slate-500 mb-6">{cfg.message}</p>
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" /> Sair
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
