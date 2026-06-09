import React, { useState, useEffect } from 'react';
import {
  Plus, RefreshCw, Edit2, CheckCircle2, XCircle, Link2, Copy, DollarSign,
  Users, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import api from '../../api';
import { formatDateBr } from '../../utils/timezone';

const BASE_URL = window.location.origin.replace('?admin=1', '');

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title="Copiar">
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function AffiliateRow({ aff, onRefresh }) {
  const [editing, setEditing]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [referrals, setReferrals] = useState([]);
  const [form, setForm] = useState({
    name: aff.name, email: aff.email || '', commissionPct: aff.commission_pct,
    discountPct: aff.discount_pct, active: aff.active, notes: aff.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const link = `${BASE_URL}/registrar?ref=${aff.code}`;

  const loadReferrals = async () => {
    if (referrals.length) return;
    const { data } = await api.get(`/api/admin/affiliates/${aff.id}/referrals`);
    setReferrals(data);
  };

  const toggle = () => { setExpanded((e) => !e); if (!expanded) loadReferrals(); };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/admin/affiliates/${aff.id}`, {
        name: form.name, email: form.email, active: form.active,
        commissionPct: form.commissionPct, discountPct: form.discountPct, notes: form.notes,
      });
      onRefresh(); setEditing(false);
    } catch (err) { alert(err.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const pay = async () => {
    if (!confirm('Marcar todas as comissões confirmadas como pagas?')) return;
    await api.post(`/api/admin/affiliates/${aff.id}/pay`);
    loadReferrals(); onRefresh();
  };

  const totalEarned = Number(aff.total_earned_brl || 0);
  const paidBrl = Number(aff.paid_brl || 0);
  const pendingBrl = Number(aff.pending_brl || 0);

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3">
          {editing ? (
            <input className="input py-1.5 text-sm" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          ) : (
            <div>
              <div className="text-sm font-medium text-slate-900">{aff.name}</div>
              <div className="text-xs text-slate-400">{aff.email || '—'}</div>
            </div>
          )}
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <code className="text-sm font-mono font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
              {aff.code}
            </code>
            <CopyBtn text={aff.code} />
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-xs text-slate-400 truncate max-w-32">{link}</span>
            <CopyBtn text={link} />
          </div>
        </td>

        <td className="px-4 py-3">
          {editing ? (
            <div className="flex gap-2">
              <input type="number" className="input py-1.5 text-sm w-16" min="0" max="100" step="0.5"
                value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} />
              <span className="text-sm text-slate-400 mt-1.5">%</span>
            </div>
          ) : (
            <span className="badge-green text-xs">{aff.commission_pct}% comissão</span>
          )}
        </td>

        <td className="px-4 py-3">
          {editing ? (
            <div className="flex gap-2">
              <input type="number" className="input py-1.5 text-sm w-16" min="0" max="100" step="0.5"
                value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
              <span className="text-sm text-slate-400 mt-1.5">%</span>
            </div>
          ) : (
            <span className="badge-blue text-xs">{aff.discount_pct}% desconto</span>
          )}
        </td>

        <td className="px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">
            R$ {totalEarned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400">
            {aff.total_referrals} indicação(ões) · Pago: R$ {paidBrl.toFixed(2)}
          </div>
        </td>

        <td className="px-4 py-3">
          {editing ? (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Ativo
            </label>
          ) : aff.active
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <XCircle className="w-4 h-4 text-red-400" />}
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <button onClick={save} disabled={saving} className="btn-primary text-xs py-1 px-2">
                  {saving ? '…' : 'Salvar'}
                </button>
                <button onClick={() => setEditing(false)} className="btn-secondary text-xs py-1 px-2">✕</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400" title="Editar">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                {pendingBrl > 0 && (
                  <button onClick={pay} className="p-1.5 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600" title="Marcar como pago">
                    <DollarSign className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={toggle} className="p-1.5 rounded hover:bg-slate-100 text-slate-400" title="Referências">
                  {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} className="px-4 pb-3 bg-slate-50">
            {referrals.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Nenhuma indicação registrada ainda.</p>
            ) : (
              <table className="w-full text-xs mt-1">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left pb-1 font-medium">Cliente</th>
                    <th className="text-left pb-1 font-medium">Plano</th>
                    <th className="text-left pb-1 font-medium">Desconto</th>
                    <th className="text-left pb-1 font-medium">Comissão</th>
                    <th className="text-left pb-1 font-medium">Status</th>
                    <th className="text-left pb-1 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {referrals.map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5 font-medium text-slate-800">{r.tenant_name}</td>
                      <td className="py-1.5">{r.plan_slug}</td>
                      <td className="py-1.5 text-red-500">−R$ {Number(r.discount_brl).toFixed(2)}</td>
                      <td className="py-1.5 text-emerald-600 font-semibold">+R$ {Number(r.commission_brl).toFixed(2)}</td>
                      <td className="py-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                          : r.status === 'confirmed' ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {r.status === 'paid' ? 'Pago' : r.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-1.5 text-slate-400">
                        {formatDateBr(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminAffiliates() {
  const [affiliatesList, setAffiliatesList] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showForm, setShowForm]             = useState(false);
  const [form, setForm]                     = useState({ name: '', email: '', code: '', commissionPct: 20, discountPct: 10, notes: '' });
  const [creating, setCreating]             = useState(false);
  const [formError, setFormError]           = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/api/admin/affiliates').then((r) => setAffiliatesList(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true); setFormError(null);
    try {
      await api.post('/api/admin/affiliates', form);
      setShowForm(false);
      setForm({ name: '', email: '', code: '', commissionPct: 20, discountPct: 10, notes: '' });
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Erro ao criar afiliado');
    } finally { setCreating(false); }
  };

  const totals = affiliatesList.reduce((acc, a) => ({
    earned: acc.earned + Number(a.total_earned_brl || 0),
    paid: acc.paid + Number(a.paid_brl || 0),
    pending: acc.pending + Number(a.pending_brl || 0),
    referrals: acc.referrals + Number(a.total_referrals || 0),
  }), { earned: 0, paid: 0, pending: 0, referrals: 0 });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Afiliados</h2>
          <p className="text-sm text-slate-500">
            {affiliatesList.length} afiliado(s) ·{' '}
            <span className="text-amber-600 font-medium">comissão paga apenas na 1ª parcela</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />Atualizar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />Novo afiliado
          </button>
        </div>
      </div>

      {/* Cards de totais */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total indicações', value: totals.referrals, icon: Users, format: 'int' },
          { label: 'Total gerado', value: totals.earned, icon: DollarSign, format: 'brl' },
          { label: 'A pagar', value: totals.pending, icon: DollarSign, format: 'brl', color: 'text-amber-600' },
          { label: 'Já pago', value: totals.paid, icon: CheckCircle2, format: 'brl', color: 'text-emerald-600' },
        ].map(({ label, value, icon: Icon, format, color }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
            <div className={`text-xl font-bold ${color || 'text-slate-900'}`}>
              {format === 'brl'
                ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : value}
            </div>
          </div>
        ))}
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Novo afiliado</h3>
          <p className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            A comissão é paga uma única vez, no <strong>primeiro pagamento</strong> do cliente indicado.
            Renovações não geram nova comissão.
          </p>
          {formError && (
            <div className="flex gap-2 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{formError}
            </div>
          )}
          <form onSubmit={create} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nome</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Código único <span className="text-slate-400 font-normal">(deixe vazio para gerar automático)</span>
              </label>
              <input className="input font-mono uppercase" placeholder="EX: JOAO25" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '') })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Observações</label>
              <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Comissão para o afiliado (%) <span className="text-slate-400 font-normal">— só 1ª parcela</span>
              </label>
              <input type="number" className="input" min="0" max="100" step="0.5" value={form.commissionPct}
                onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Desconto para o cliente (%)</label>
              <input type="number" className="input" min="0" max="100" step="0.5" value={form.discountPct}
                onChange={(e) => setForm({ ...form, discountPct: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={creating} className="btn-primary flex items-center gap-1.5">
                {creating ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar afiliado
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabela */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-12 text-center">
            <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Afiliado', 'Código / Link', 'Comissão', 'Desconto', 'Ganhos', 'Ativo', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {affiliatesList.map((a) => <AffiliateRow key={a.id} aff={a} onRefresh={load} />)}
                {!affiliatesList.length && (
                  <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">
                    Nenhum afiliado cadastrado. Crie o primeiro acima.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
