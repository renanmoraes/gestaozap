import React, { useState, useEffect } from 'react';
import {
  CreditCard, Calendar, MessageSquare, TrendingUp, ChevronRight, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../api';
import { formatDateBr } from '../utils/timezone';

function PlanBadge({ slug }) {
  const colors = {
    starter: 'badge-blue',
    pro: 'badge-green',
    business: 'bg-amber-100 text-amber-700 border border-amber-200',
  };
  const labels = { starter: 'Starter', pro: 'Pro', business: 'Business' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[slug] || 'badge-gray'}`}>
      {labels[slug] || slug}
    </span>
  );
}

function UsageBar({ used, total }) {
  if (!total) return <span className="text-sm text-slate-400">Ilimitado</span>;
  const pct = Math.min(100, Math.round((used / total) * 100));
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-600';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{used.toLocaleString('pt-BR')} enviadas</span>
        <span>{total.toLocaleString('pt-BR')} incluídas</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Billing() {
  const [summary, setSummary]   = useState(null); // { contract, isLifetime, usage, daysUntilExpiry }
  const [history, setHistory]   = useState({ records: [], total: 0 });
  const [usage, setUsage]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [histPage, setHistPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/api/billing/summary'),
      api.get('/api/billing/history?limit=5&page=1'),
      api.get('/api/billing/usage?months=6'),
    ]).then(([sum, hist, use]) => {
      setSummary(sum.data);
      setHistory(hist.data);
      setUsage(use.data.months || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const loadMoreHistory = async (page) => {
    const { data } = await api.get(`/api/billing/history?limit=5&page=${page}`);
    setHistory(data);
    setHistPage(page);
  };

  if (loading) {
    return (
      <div className="page-content flex items-center justify-center py-20">
        <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const noContract = !summary?.contract;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Financeiro</h1>
          <p className="text-sm text-slate-500 mt-0.5">Plano, consumo e histórico de cobrança</p>
        </div>
      </div>

      <div className="page-content max-w-4xl space-y-6">

        {/* Sem contrato */}
        {noContract && (
          <div className="card p-6 flex items-start gap-4 border-amber-200 bg-amber-50">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-slate-900">Nenhum plano ativo</h3>
              <p className="text-sm text-slate-600 mt-1">
                Entre em contato com o suporte para contratar um plano e continuar usando a plataforma.
              </p>
            </div>
          </div>
        )}

        {/* Cards de resumo */}
        {summary?.contract && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Plano */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Plano</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl font-bold text-slate-900">
                  R$ {Number(summary.contract.price_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-sm text-slate-400">/mês</span>
              </div>
              <PlanBadge slug={summary.contract.plan_slug} />
            </div>

            {/* Vencimento */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Vencimento</span>
              </div>
              {summary.isLifetime ? (
                <>
                  <div className="text-xl font-bold text-slate-900 mb-1">♾️ Vitalício</div>
                  <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Acesso permanente
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold text-slate-900 mb-1">
                    {summary.daysUntilExpiry != null ? `${summary.daysUntilExpiry} dias` : '—'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {summary.contract.expires_at
                      ? formatDateBr(summary.contract.expires_at)
                      : '—'}
                  </div>
                  {summary.daysUntilExpiry != null && summary.daysUntilExpiry <= 7 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-red-600 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Renovação próxima
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Mensagens */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Este mês</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mb-2">
                {summary.usage.messagesSent.toLocaleString('pt-BR')}
              </div>
              <UsageBar
                used={summary.usage.messagesSent}
                total={summary.usage.messagesIncluded}
              />
            </div>
          </div>
        )}

        {/* Gráfico de uso */}
        {usage.length > 0 && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">Mensagens enviadas por mês</h2>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={usage} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v) => [v.toLocaleString('pt-BR'), 'Mensagens']}
                />
                <Bar dataKey="messages_sent" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Histórico de pagamentos */}
        <div className="card">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Histórico de pagamentos</h2>
          </div>

          {history.records.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              Nenhum registro de pagamento encontrado.
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {history.records.map((r) => (
                  <div key={r.id} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        {r.description || (r.type === 'subscription' ? 'Assinatura' : r.type)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {r.reference_month && `Ref. ${r.reference_month} · `}
                        {formatDateBr(r.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${r.status === 'paid' ? 'text-emerald-600' : r.status === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>
                        R$ {Number(r.amount_brl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className={`badge-${r.status === 'paid' ? 'green' : r.status === 'failed' ? 'red' : 'gray'} text-xs`}>
                        {r.status === 'paid' ? 'Pago' : r.status === 'failed' ? 'Falhou' : r.status === 'pending' ? 'Pendente' : r.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {history.total > 5 && (
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{history.total} registros no total</span>
                  <div className="flex gap-2">
                    {histPage > 1 && (
                      <button onClick={() => loadMoreHistory(histPage - 1)} className="btn-secondary text-xs py-1.5 px-3">
                        Anterior
                      </button>
                    )}
                    {histPage * 5 < history.total && (
                      <button onClick={() => loadMoreHistory(histPage + 1)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                        Próximos <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
