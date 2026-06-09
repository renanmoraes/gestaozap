import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, RefreshCw, CheckCircle2, XCircle, Wifi, AlertCircle, ChevronRight, Mail, Clock, Check, X, Tag,
} from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage, MSG } from '../../utils/messages';
import { formatPhone, maskPhoneInput } from '../../utils/phone';
import { formatDateBr } from '../../utils/timezone';

const PLANS = ['starter', 'pro', 'business'];
const PLAN_LABELS = { starter: 'Starter', pro: 'Pro', business: 'Business' };
const DEFAULT_APPROVE = { planSlug: 'starter', lifetime: false, trialDays: 7 };

function PendingApprovals({ items, onChange }) {
  const [busy, setBusy] = useState(null);
  const [approving, setApproving] = useState(null);
  const [approveForm, setApproveForm] = useState(DEFAULT_APPROVE);

  const act = async (id, action, body = {}) => {
    setBusy(`${id}:${action}`);
    try {
      await api.post(`/api/admin/tenants/${id}/${action}`, body);
      onChange();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.operationFailed));
    } finally {
      setBusy(null);
    }
  };

  const openApprove = (tenant) => {
    setApproving(tenant);
    setApproveForm(DEFAULT_APPROVE);
  };

  const confirmApprove = async () => {
    if (!approving) return;
    const payload = {
      planSlug: approveForm.planSlug,
      lifetime: approveForm.lifetime,
      ...(approveForm.lifetime ? {} : { trialDays: approveForm.trialDays }),
    };
    await act(approving.id, 'approve', payload);
    setApproving(null);
  };

  if (!items.length) return null;

  return (
    <>
      <div className="card p-5 border-amber-200 bg-amber-50/40">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-900">Aprovações pendentes</h3>
          <span className="badge-blue text-xs">{items.length}</span>
        </div>
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white border border-slate-200">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {t.name} <span className="text-xs text-slate-400 font-mono">/{t.slug}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                  <span className="uppercase">{t.document_type}: {t.document || '—'}</span>
                  <span className="font-mono">{formatPhone(t.registered_phone)}</span>
                  {t.affiliate_code && (
                    <span className="inline-flex items-center gap-1 text-brand-600">
                      <Tag className="w-3 h-3" />{t.affiliate_code}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => openApprove(t)}
                  disabled={busy === `${t.id}:approve`}
                  className="btn-primary text-xs flex items-center gap-1 px-3 py-1.5"
                >
                  <Check className="w-3.5 h-3.5" />Aprovar
                </button>
                <button
                  onClick={() => act(t.id, 'reject')}
                  disabled={busy === `${t.id}:reject`}
                  className="btn-secondary text-xs flex items-center gap-1 px-3 py-1.5"
                >
                  <X className="w-3.5 h-3.5" />Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {approving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="card w-full max-w-md p-5 space-y-4 shadow-xl">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Aprovar cadastro</h3>
              <p className="text-xs text-slate-500 mt-1">
                {approving.name} · <span className="font-mono">/{approving.slug}</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Plano inicial</label>
              <select className="input" value={approveForm.planSlug}
                onChange={(e) => setApproveForm((f) => ({ ...f, planSlug: e.target.value }))}>
                {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={approveForm.lifetime}
                  onChange={(e) => setApproveForm((f) => ({ ...f, lifetime: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600" />
                <span className="text-sm font-medium text-slate-800">Vitalício (sem vencimento)</span>
              </label>
              {!approveForm.lifetime && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Dias de trial</label>
                  <input type="number" className="input" min="1" value={approveForm.trialDays}
                    onChange={(e) => setApproveForm((f) => ({ ...f, trialDays: parseInt(e.target.value, 10) || 7 }))} />
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={confirmApprove} disabled={!!busy} className="btn-primary flex-1 justify-center">
                Confirmar aprovação
              </button>
              <button onClick={() => setApproving(null)} className="btn-secondary flex-1 justify-center">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TenantRow({ tenant }) {
  const navigate = useNavigate();

  const waColor = tenant.wa_status === 'connected'
    ? 'text-emerald-500' : tenant.wa_status === 'qr_ready' ? 'text-amber-500' : 'text-slate-300';

  const isLifetime = tenant.contract_status === 'active' && !tenant.contract_expires_at;
  const daysToExpiry = tenant.contract_expires_at
    ? Math.ceil((new Date(tenant.contract_expires_at) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  const goDetails = () => navigate(`/tenants/${tenant.id}`);

  return (
    <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={goDetails}>
      <td className="px-4 py-3 font-mono text-sm text-slate-700">
        {tenant.company_id ?? '—'}
      </td>
      <td className="px-4 py-3">
        <div>
          <div className="text-sm font-medium text-slate-900 hover:text-brand-600">{tenant.name}</div>
          <div className="text-xs text-slate-400 mt-0.5 font-mono">/{tenant.slug}</div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 font-mono whitespace-nowrap">
        {formatPhone(tenant.registered_phone)}
      </td>
      <td className="px-4 py-3">
        {tenant.plan_name
          ? <span className="badge-blue text-xs">{tenant.plan_name}</span>
          : <span className="text-xs text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 text-xs">
        {isLifetime ? (
          <span className="text-emerald-700 font-semibold">Vitalício</span>
        ) : tenant.contract_expires_at ? (
          <div>
            <div className="text-slate-700">
              {formatDateBr(tenant.contract_expires_at)}
            </div>
            {daysToExpiry != null && daysToExpiry <= 7 && daysToExpiry > 0 && (
              <div className="text-amber-600 text-[10px]">vence em {daysToExpiry}d</div>
            )}
            {daysToExpiry != null && daysToExpiry <= 0 && (
              <div className="text-red-600 text-[10px]">vencido</div>
            )}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Wifi className={`w-4 h-4 ${waColor}`} title={tenant.wa_status} />
      </td>
      <td className="px-4 py-3">
        {tenant.active
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : <XCircle className="w-4 h-4 text-red-400" />}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={(e) => { e.stopPropagation(); goDetails(); }}
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          Ver detalhes <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

export default function AdminTenants() {
  const [tenants, setTenants] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    slug: '', name: '', registeredPhone: '', contactEmail: '',
    planSlug: 'starter', expiryDays: 30, lifetime: false,
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/api/admin/tenants').then((r) => setTenants(r.data)).finally(() => setLoading(false));
    api.get('/api/admin/tenants?status=pending').then((r) => setPending(r.data)).catch(() => {});
  };

  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    setSuccessMsg(null);
    try {
      const payload = { ...form, expiryDays: form.lifetime ? 0 : form.expiryDays };
      const { data } = await api.post('/api/admin/tenants', payload);
      setShowForm(false);
      setForm({
        slug: '', name: '', registeredPhone: '', contactEmail: '',
        planSlug: 'starter', expiryDays: 30, lifetime: false,
      });
      const emailNote = data.emailSent ? 'Email de acesso enviado.' : 'Cliente criado (email não enviado — verifique Resend).';
      setSuccessMsg(`Cliente #${data.companyId} criado. ${emailNote}`);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Erro ao criar cliente');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Clientes</h2>
          <p className="text-sm text-slate-500">{tenants.length} cadastrado(s)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />Atualizar
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />Novo cliente
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="flex gap-2 items-start p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <Mail className="w-4 h-4 shrink-0 mt-0.5" />{successMsg}
        </div>
      )}

      <PendingApprovals items={pending} onChange={load} />

      {showForm && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Novo cliente</h3>
          {formError && (
            <div className="flex gap-2 items-start p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{formError}
            </div>
          )}
          <form onSubmit={create} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nome da empresa</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Slug (URL)</label>
              <input className="input" placeholder="farmacia-vida-plena" value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s/g, '-') })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email do responsável</label>
              <input type="email" className="input" placeholder="contato@empresa.com" value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Número WhatsApp</label>
              <input className="input font-mono" placeholder="(11) 98765-4321"
                value={formatPhone(form.registeredPhone)}
                onChange={(e) => setForm({ ...form, registeredPhone: maskPhoneInput(e.target.value) })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Plano</label>
              <select className="input" value={form.planSlug} onChange={(e) => setForm({ ...form, planSlug: e.target.value })}>
                {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Duração</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.lifetime}
                    onChange={(e) => setForm({ ...form, lifetime: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600" />
                  <span className="text-sm font-medium text-slate-800">Vitalício (sem vencimento)</span>
                </label>
                {!form.lifetime && (
                  <input type="number" className="input" min="1" value={form.expiryDays}
                    onChange={(e) => setForm({ ...form, expiryDays: parseInt(e.target.value) || 30 })}
                    placeholder="Dias de acesso" />
                )}
              </div>
            </div>
            <div className="col-span-2 flex items-end gap-2">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                {creating ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar e enviar acesso
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </form>
        </div>
      )}

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
                  {['ID', 'Cliente', 'Número', 'Plano', 'Vencimento', 'WA', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => <TenantRow key={t.id} tenant={t} />)}
                {!tenants.length && (
                  <tr><td colSpan={8} className="text-center py-12 text-sm text-slate-400">Nenhum cliente cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
