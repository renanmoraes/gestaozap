import React, { useState, useEffect } from 'react';
import {
  Link2, Copy, CheckCircle2, Users, DollarSign, Clock, TrendingUp, RefreshCw,
} from 'lucide-react';
import api from '../api';
import { formatDateBr } from '../utils/timezone';
import { dialog } from '../utils/dialog';

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      dialog.toast.success('Link copiado.');
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button type="button" onClick={copy} className="btn-secondary py-2 px-3 text-sm shrink-0">
      {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

const STATUS_LABELS = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  paid: 'Pago',
};

export default function Affiliate() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/api/affiliate/me')
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-brand-600 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-content">
        <div className="card p-8 text-center text-sm text-slate-500">
          Esta conta não está vinculada como afiliada.
        </div>
      </div>
    );
  }

  const { stats } = data;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Programa de afiliados</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Código <span className="font-mono font-bold text-brand-600">{data.code}</span>
            {' · '}{data.commissionPct}% de comissão
          </p>
        </div>
        <button type="button" onClick={load} className="btn-secondary text-sm">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      <div className="page-content space-y-5">
        <div className="card p-4 md:p-5 border-brand-100 bg-gradient-to-br from-brand-50/80 to-white">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-semibold text-slate-900">Seu link de indicação</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input font-mono text-xs sm:text-sm flex-1" readOnly value={data.link} />
            <CopyBtn text={data.link} />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Quem se cadastrar por este link entra com seu desconto de {data.discountPct}%.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            { label: 'Cadastros pelo link', value: stats.signups, icon: Users, color: 'text-slate-900' },
            { label: 'Contas aprovadas', value: stats.approved, icon: TrendingUp, color: 'text-brand-700' },
            { label: 'A receber', value: stats.pendingBrl, icon: Clock, color: 'text-amber-600', brl: true },
            { label: 'Já recebido', value: stats.paidBrl, icon: DollarSign, color: 'text-emerald-600', brl: true },
          ].map(({ label, value, icon: Icon, color, brl }) => (
            <div key={label} className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
              <div className={`text-xl md:text-2xl font-bold ${color}`}>
                {brl
                  ? `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : value}
              </div>
            </div>
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Suas indicações</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Cliente</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Comissão</th>
                  <th className="px-4 py-2.5 text-left">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.referrals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-slate-400 text-sm">
                      Nenhuma indicação ainda. Compartilhe seu link.
                    </td>
                  </tr>
                ) : data.referrals.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.tenantName}</div>
                      <div className="text-xs text-slate-400 font-mono">/{r.tenantSlug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge-${
                        r.status === 'paid' ? 'green' : r.status === 'confirmed' ? 'blue' : 'yellow'
                      } text-xs`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                      {r.approvalStatus !== 'approved' && (
                        <span className="block text-[10px] text-slate-400 mt-0.5">aguardando aprovação</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                      R$ {Number(r.commissionBrl).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {formatDateBr(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
