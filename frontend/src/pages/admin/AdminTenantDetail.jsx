import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Edit2, Save, X, Wifi, WifiOff, AlertTriangle, CheckCircle2,
  Smartphone, MessageSquare, Users, FileText, CreditCard, Calendar,
  Shield, ShieldOff, PowerOff, Plus, Tag, Clock, Hash, Building2, RefreshCw, Sparkles, Mail,
} from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage, MSG } from '../../utils/messages';
import { formatPhone, maskPhoneInput } from '../../utils/phone';
import { formatDateBr, formatDateTimeBr, getCalendarDayKeyBr, toDateInputValueBr, addCalendarDaysBr } from '../../utils/timezone';

const PLANS = ['starter', 'pro', 'business'];

function StatCard({ icon: Icon, label, value, sub, color = 'slate', warning }) {
  const colors = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    brand: 'bg-brand-50 text-brand-700 border-brand-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <div className={`card p-4 ${warning ? 'ring-2 ring-amber-300' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Tab({ active, onClick, icon: Icon, children, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0 whitespace-nowrap ${
        active
          ? 'text-brand-600 border-brand-600'
          : 'text-slate-500 border-transparent hover:text-slate-800'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {children}
      {badge != null && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

/* ───────────── Form primitives (mobile-first) ───────────── */
function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1.5 leading-snug">{hint}</span>}
    </label>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-brand-600 shrink-0" />
      <h3 className="text-sm font-semibold text-slate-800">{children}</h3>
    </div>
  );
}

function Toggle({ checked, onChange, label, desc, activeColor = 'brand' }) {
  const on = checked
    ? (activeColor === 'emerald' ? 'bg-emerald-500' : 'bg-brand-600')
    : 'bg-slate-300';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300 transition-colors active:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {desc && <span className="block text-xs text-slate-500 mt-0.5 leading-snug">{desc}</span>}
      </span>
      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${on}`}>
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

function TenantEditForm({ tenant, form, setForm, saving, onSave, onCancel }) {
  const initials = (tenant.name || '?').slice(0, 2).toUpperCase();
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave(); }}
      className="card overflow-hidden"
    >
      {/* Cabeçalho do formulário */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/70">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white text-base font-bold flex items-center justify-center shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900 leading-tight">Editar cliente</h2>
          <p className="text-xs text-slate-500 truncate">Atualize os dados de {tenant.name}</p>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-7">
        {/* Identificação */}
        <section className="space-y-4">
          <SectionTitle icon={Building2}>Identificação</SectionTitle>

          <Field label="Nome do cliente">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome da empresa"
            />
          </Field>

          <Field label="Link público" hint="Endereço da página pública do cliente.">
            <div className="flex items-stretch rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent transition-shadow">
              <span className="flex items-center px-3 text-xs sm:text-sm text-slate-500 bg-slate-50 border-r border-slate-200 whitespace-nowrap select-none">
                gestaozap.digital/
              </span>
              <input
                className="flex-1 min-w-0 px-3 py-2 text-sm text-slate-900 outline-none font-mono"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                placeholder="slug"
              />
            </div>
          </Field>

          <Field label="Número cadastrado">
            <input
              className="input font-mono"
              inputMode="numeric"
              value={formatPhone(form.registeredPhone)}
              onChange={(e) => setForm({ ...form, registeredPhone: maskPhoneInput(e.target.value) })}
              placeholder="(11) 99999-9999"
            />
          </Field>

          <Field label="E-mail de acesso" hint="Usado para login do cliente e para receber o reset de senha.">
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                className="input pl-9"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="cliente@email.com"
              />
            </div>
          </Field>

          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field label="Tipo">
              <select
                className="input"
                value={form.documentType}
                onChange={(e) => setForm({ ...form, documentType: e.target.value })}
              >
                <option value="">—</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
              </select>
            </Field>
            <Field label="Documento">
              <input
                className="input font-mono"
                inputMode="numeric"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value.replace(/\D/g, '') })}
                placeholder="Somente números"
              />
            </Field>
          </div>
        </section>

        {/* Plano e vigência */}
        <section className="space-y-4">
          <SectionTitle icon={CreditCard}>Plano e vigência</SectionTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Plano">
              <select
                className="input capitalize"
                value={form.planSlug}
                onChange={(e) => setForm({ ...form, planSlug: e.target.value })}
              >
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>

            {!form.lifetime && (
              <Field label="Dias até o vencimento">
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={form.expiryDays}
                  onChange={(e) => setForm({ ...form, expiryDays: parseInt(e.target.value) || 30 })}
                  placeholder="30"
                />
              </Field>
            )}
          </div>

          <Toggle
            checked={form.lifetime}
            onChange={(v) => setForm({ ...form, lifetime: v })}
            label="Acesso vitalício ♾️"
            desc="O contrato não expira. Desligue para definir um prazo em dias."
          />
        </section>

        {/* Status */}
        <section className="space-y-4">
          <SectionTitle icon={Shield}>Status da conta</SectionTitle>
          <Toggle
            checked={form.active}
            onChange={(v) => setForm({ ...form, active: v })}
            label="Cliente ativo"
            desc="Quando desligado, o cliente fica bloqueado e não consegue acessar."
            activeColor="emerald"
          />
        </section>
      </div>

      {/* Barra de ações — fixa no rodapé no mobile */}
      <div className="flex gap-3 px-4 sm:px-6 py-3 border-t border-slate-100 bg-white sticky bottom-0 pb-safe">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 sm:flex-none justify-center">
          <X className="w-4 h-4" />
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar alterações
        </button>
      </div>
    </form>
  );
}

export default function AdminTenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);
  const [tab, setTab]       = useState('overview');
  const [editing, setEdit]  = useState(false);
  const [saving, setSaving] = useState(false);

  // Form de edição
  const [form, setForm] = useState({
    name: '', registeredPhone: '', slug: '', active: true,
    email: '', document: '', documentType: '',
    planSlug: '', lifetime: false, expiryDays: 30,
  });

  const load = () => {
    setLoad(true);
    api.get(`/api/admin/tenants/${id}`)
      .then((r) => {
        setData(r.data);
        const t = r.data.tenant;
        setForm({
          name: t.name,
          registeredPhone: t.registered_phone,
          slug: t.slug,
          active: t.active,
          email: t.email || '',
          document: t.document || '',
          documentType: t.document_type || '',
          planSlug: t.plan_slug || 'starter',
          lifetime: Boolean(t.contract_id && !t.contract_expires_at),
          expiryDays: 30,
        });
      })
      .catch((err) => {
        if (err.response?.status === 404) navigate('/tenants');
      })
      .finally(() => setLoad(false));
  };

  useEffect(load, [id]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        registeredPhone: form.registeredPhone,
        slug: form.slug,
        active: form.active,
        email: form.email.trim(),
        document: form.document,
        documentType: form.documentType || null,
        planSlug: form.planSlug,
        lifetime: form.lifetime,
        expiryDays: form.lifetime ? 0 : form.expiryDays,
      };
      await api.patch(`/api/admin/tenants/${id}`, payload);
      setEdit(false);
      load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.adminSaveFailed));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    const verb = data.tenant.active ? 'bloquear' : 'reativar';
    if (!(await dialog.confirm({ title: verb === 'bloquear' ? 'Bloquear cliente' : 'Reativar cliente', message: MSG.blockTenant(data.tenant.name, verb) }))) return;
    await api.patch(`/api/admin/tenants/${id}`, { active: !data.tenant.active });
    load();
  };

  const disconnectWa = async () => {
    if (!(await dialog.confirm({ title: 'Desconectar WhatsApp', message: MSG.disconnectWa, danger: true }))) return;
    await api.post(`/api/admin/tenants/${id}/disconnect-wa`);
    setTimeout(load, 800);
  };

  const makeAffiliate = async () => {
    try {
      const { data } = await api.post(`/api/admin/tenants/${id}/make-affiliate`, {
        commissionPct: 20,
        discountPct: 10,
      });
      dialog.toast.success(
        data.created
          ? `Afiliado criado com código ${data.affiliate.code}.`
          : `Cliente já vinculado como afiliado (${data.affiliate.code}).`,
      );
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, 'Não conseguimos vincular como afiliado.'));
    }
  };

  const resetPassword = async () => {
    if (!(await dialog.confirm({
      title: 'Resetar senha',
      message: `Isso vai gerar uma nova senha temporária e enviar por email para ${data?.tenant?.email || 'o email cadastrado'}. O cliente precisará trocar a senha no próximo acesso. Confirmar?`,
      danger: false,
    }))) return;
    try {
      const { data: r } = await api.post(`/api/admin/tenants/${id}/reset-password`);
      dialog.toast.success(
        r.emailSent
          ? `Senha resetada e email enviado para ${r.email}.`
          : `Senha resetada, mas o email não foi enviado (${r.email}).`,
      );
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, 'Não foi possível resetar a senha.'));
    }
  };

  const extendContract = async () => {
    const days = parseInt(prompt('Estender por quantos dias?', '30'));
    if (!days || days < 1) return;
    try {
      await api.post(`/api/admin/tenants/${id}/extend`, { days });
      load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.extendContractFailed));
    }
  };

  // Estado de anti-bloqueio (kill switch + quality gate)
  const [antiBlock, setAntiBlock] = useState(null);
  const loadAntiBlock = () => {
    api.get(`/api/admin/tenants/${id}/anti-block`).then((r) => setAntiBlock(r.data)).catch(() => {});
  };
  useEffect(() => {
    loadAntiBlock();
    const t = setInterval(loadAntiBlock, 15000); // refresh a cada 15s
    return () => clearInterval(t);
  }, [id]);

  const toggleKillSwitch = async () => {
    if (antiBlock?.killSwitch) {
      if (!(await dialog.confirm({ title: 'Liberar envios', message: MSG.unlockKillSwitch }))) return;
      await api.post(`/api/admin/tenants/${id}/kill-switch`, { action: 'off' });
    } else {
      const reason = prompt('Motivo para travar envios? (será visível no log)', 'suspeita_de_bloqueio');
      if (!reason) return;
      await api.post(`/api/admin/tenants/${id}/kill-switch`, { action: 'on', reason, ttlSec: 86400 });
    }
    setTimeout(loadAntiBlock, 300);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-brand-600 animate-spin" />
      </div>
    );
  }

  const { tenant: t, stats, runtime, payments, contracts } = data;
  const isLifetime = !t.contract_expires_at && t.contract_id;
  const daysToExpiry = t.contract_expires_at
    ? Math.max(0, Math.ceil((new Date(t.contract_expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="space-y-5">
      {/* Topbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button onClick={() => navigate('/tenants')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 self-start">
          <ArrowLeft className="w-4 h-4" />
          Voltar<span className="hidden sm:inline">&nbsp;para a lista de clientes</span>
        </button>
        {!editing && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <button onClick={() => setEdit(true)} className="btn-primary justify-center col-span-2 sm:col-span-1">
              <Edit2 className="w-4 h-4" />Editar cliente
            </button>
            <button onClick={resetPassword} className="btn-secondary justify-center">
              <Mail className="w-4 h-4" />Resetar senha
            </button>
            <button onClick={makeAffiliate} className="btn-secondary justify-center">
              <Tag className="w-4 h-4" />Afiliado
            </button>
            <button
              onClick={toggleActive}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                t.active
                  ? 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              {t.active ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
              {t.active ? 'Bloquear' : 'Reativar'}
            </button>
            <button onClick={load} className="btn-secondary justify-center" aria-label="Atualizar">
              <RefreshCw className="w-4 h-4" />Atualizar
            </button>
          </div>
        )}
      </div>

      {editing && (
        <TenantEditForm
          tenant={t}
          form={form}
          setForm={setForm}
          saving={saving}
          onSave={save}
          onCancel={() => { setEdit(false); load(); }}
        />
      )}

      {!editing && (
      <>
      {/* Header card */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white text-base sm:text-lg font-bold flex items-center justify-center shrink-0">
            {t.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight break-words">{t.name}</h1>
            <p className="text-sm text-slate-500 font-mono">/{t.slug}</p>
            {t.email && (
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 break-all">
                <Mail className="w-3 h-3 shrink-0" />{t.email}
              </p>
            )}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {t.active ? (
            <span className="badge-green"><CheckCircle2 className="w-3 h-3" /> Ativo</span>
          ) : (
            <span className="badge-red"><ShieldOff className="w-3 h-3" /> Bloqueado</span>
          )}
          {t.wa_status === 'connected' ? (
            <span className="badge-blue"><Wifi className="w-3 h-3" /> WhatsApp conectado</span>
          ) : (
            <span className="badge-gray"><WifiOff className="w-3 h-3" /> WhatsApp desconectado</span>
          )}
        </div>

        {/* Dados rápidos */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Número</div>
            <div className="text-sm font-mono text-slate-800 break-all">{formatPhone(t.registered_phone)}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Plano atual</div>
            <div className="text-sm text-slate-800">
              {t.plan_name || '—'}
              {t.price_brl && (
                <span className="block text-xs text-slate-400">R$ {Number(t.price_brl).toFixed(2)}/mês</span>
              )}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Vencimento</div>
            {isLifetime ? (
              <div className="text-sm text-emerald-700 font-semibold">♾️ Vitalício</div>
            ) : daysToExpiry != null ? (
              <div className="text-sm text-slate-800">
                {daysToExpiry} dias
                <div className="text-xs text-slate-400">
                  {formatDateBr(t.contract_expires_at)}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-400">Sem contrato</div>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Criado em</div>
            <div className="text-sm text-slate-800">
              {formatDateBr(t.created_at)}
            </div>
            <div className="text-xs text-slate-400">
              {Math.floor((new Date() - new Date(t.created_at)) / (1000 * 60 * 60 * 24))} dias atrás
            </div>
          </div>
        </div>

        {!editing && t.affiliate_name && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-600">
            <Tag className="w-3 h-3 text-brand-600 shrink-0" />
            <span className="break-words">Indicado por <strong>{t.affiliate_name}</strong> · código <code className="font-mono">{t.affiliate_code}</code></span>
          </div>
        )}
      </div>

      {/* Tabs — roláveis horizontalmente no mobile */}
      <div className="border-b border-slate-200 flex gap-1 sm:gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
        <Tab active={tab === 'overview'} onClick={() => setTab('overview')} icon={Building2}>Visão geral</Tab>
        <Tab active={tab === 'whatsapp'} onClick={() => setTab('whatsapp')} icon={Smartphone}>WhatsApp</Tab>
        <Tab active={tab === 'contracts'} onClick={() => setTab('contracts')} icon={Calendar} badge={contracts.length}>Contratos</Tab>
        <Tab active={tab === 'payments'} onClick={() => setTab('payments')} icon={CreditCard} badge={payments.length}>Pagamentos</Tab>
        <Tab active={tab === 'features'} onClick={() => setTab('features')} icon={Sparkles}>Features</Tab>
        <Tab active={tab === 'dlq'} onClick={() => setTab('dlq')} icon={AlertTriangle}>DLQ</Tab>
        <Tab active={tab === 'incidents'} onClick={() => setTab('incidents')} icon={Shield}>Incidentes</Tab>
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Aviso de plano estourado */}
          {stats.overLimit && (
            <div className="card p-4 flex items-start gap-3 bg-amber-50 border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-900">Cliente passou do plano este mês</div>
                <div className="text-sm text-amber-700">
                  Enviou {stats.messagesThisMonth.toLocaleString('pt-BR')} mensagens, mas o plano inclui só {stats.messagesIncluded.toLocaleString('pt-BR')}.
                  Excedente: <strong>{stats.messagesExtra.toLocaleString('pt-BR')}</strong> mensagens.
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={MessageSquare}
              label="Mensagens este mês"
              value={stats.messagesThisMonth.toLocaleString('pt-BR')}
              sub={stats.messagesIncluded ? `de ${stats.messagesIncluded.toLocaleString('pt-BR')} incluídas` : 'plano ilimitado'}
              color={stats.overLimit ? 'amber' : 'brand'}
              warning={stats.overLimit}
            />
            <StatCard
              icon={Hash}
              label="Total enviadas"
              value={stats.messagesTotal.toLocaleString('pt-BR')}
              sub={stats.messagesFailed > 0 ? `${stats.messagesFailed} com falha` : 'Sem falhas'}
              color="emerald"
            />
            <StatCard
              icon={Users}
              label="Contatos ativos"
              value={stats.contacts.toLocaleString('pt-BR')}
              sub={stats.optedOut > 0 ? `${stats.optedOut} optaram por sair` : 'Nenhum opt-out'}
            />
            <StatCard
              icon={FileText}
              label="Templates"
              value={stats.campaigns.toLocaleString('pt-BR')}
              sub={`${stats.conversations} conversa(s)`}
            />
          </div>

          {/* Termos */}
          <div className="card p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm font-medium text-slate-700">Aceite dos Termos</span>
              </div>
              {t.terms_accepted_at ? (
                <div className="text-sm text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Aceito em {formatDateBr(t.terms_accepted_at)}
                  <span className="text-xs text-slate-400">(v{t.terms_version})</span>
                </div>
              ) : (
                <div className="text-sm text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Ainda não aceitou
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp tab */}
      {tab === 'whatsapp' && (
        <div className="space-y-4">
          {/* Painel anti-bloqueio */}
          <div className={`card p-5 ${antiBlock?.killSwitch ? 'bg-red-50 border-red-200' : antiBlock?.qualityGateBreached ? 'bg-amber-50 border-amber-200' : ''}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-2">
                  {antiBlock?.killSwitch ? <ShieldOff className="w-4 h-4 text-red-500" /> :
                   antiBlock?.qualityGateBreached ? <AlertTriangle className="w-4 h-4 text-amber-500" /> :
                   <Shield className="w-4 h-4 text-emerald-500" />}
                  Anti-bloqueio
                </h3>
                <p className="text-xs text-slate-500">
                  {antiBlock?.killSwitch
                    ? `Envios bloqueados: ${antiBlock.killSwitch.reason}`
                    : antiBlock?.qualityGateBreached
                      ? 'Taxa de erro acima do limite — pausa automática preventiva'
                      : 'Tudo dentro dos parâmetros saudáveis'}
                </p>
              </div>
              <button
                onClick={toggleKillSwitch}
                className={`text-xs flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg w-full sm:w-auto shrink-0 ${
                  antiBlock?.killSwitch
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
              >
                {antiBlock?.killSwitch ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
                {antiBlock?.killSwitch ? 'Liberar envios' : 'Travar envios'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Taxa de erro recente</div>
                <div className={`text-base font-bold ${(antiBlock?.errorRate || 0) > 0.02 ? 'text-red-600' : 'text-slate-700'}`}>
                  {((antiBlock?.errorRate || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Limite</div>
                <div className="text-base font-bold text-slate-700">
                  {((antiBlock?.qualityGateThreshold || 0.02) * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Quality gate</div>
                <div className={`text-base font-bold ${antiBlock?.qualityGateBreached ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {antiBlock?.qualityGateBreached ? 'Acionado' : 'OK'}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Sessão WhatsApp</h3>
                <p className="text-xs text-slate-500">Estado da conexão e do dispositivo do cliente</p>
              </div>
              {t.wa_status === 'connected' && (
                <button onClick={disconnectWa} className="text-xs flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 w-full sm:w-auto shrink-0">
                  <PowerOff className="w-3.5 h-3.5" />
                  Desconectar agora
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Status</span>
                <span className={`text-sm font-medium ${
                  t.wa_status === 'connected' ? 'text-emerald-600' :
                  t.wa_status === 'qr_ready' ? 'text-amber-600' : 'text-slate-500'
                }`}>
                  {t.wa_status === 'connected' ? '✓ Conectado' :
                   t.wa_status === 'qr_ready' ? 'Aguardando QR scan' : 'Desconectado'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Número cadastrado</span>
                <span className="text-sm font-mono text-slate-800">{formatPhone(t.registered_phone)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Número conectado</span>
                <span className="text-sm font-mono text-slate-800">
                  {t.connected_phone ? formatPhone(t.connected_phone) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Último visto</span>
                <span className="text-sm text-slate-800">
                  {t.last_seen_at
                    ? formatDateTimeBr(t.last_seen_at)
                    : 'Nunca'}
                </span>
              </div>
            </div>
          </div>

          {/* Runtime info */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Dispositivo conectado</h3>
            {runtime.browserConnected ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-emerald-700 mb-3">
                  <CheckCircle2 className="w-4 h-4" />
                  Browser ativo neste servidor
                </div>
                {runtime.info && (
                  <div className="space-y-2 text-sm">
                    {runtime.info.pushname && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Nome do WhatsApp</span>
                        <span className="text-slate-800">{runtime.info.pushname}</span>
                      </div>
                    )}
                    {runtime.info.platform && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Plataforma</span>
                        <span className="text-slate-800 capitalize">{runtime.info.platform}</span>
                      </div>
                    )}
                    {runtime.info.wid && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">WID</span>
                        <span className="text-slate-800 font-mono text-xs">{runtime.info.wid}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : runtime.inMemory ? (
              <div className="text-sm text-amber-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Instância em memória mas sem browser ativo — provavelmente aguardando QR.
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                Nenhuma instância wwebjs ativa para este cliente no momento.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contracts tab */}
      {tab === 'contracts' && (
        <div className="card overflow-x-auto">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Histórico de contratos</h3>
            {t.contract_id && t.contract_expires_at && (
              <button onClick={extendContract} className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100">
                <Plus className="w-3.5 h-3.5" />
                Estender prazo
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Plano</th>
                <th className="px-4 py-2.5 text-left">Início</th>
                <th className="px-4 py-2.5 text-left">Vencimento</th>
                <th className="px-4 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-slate-400">Sem contratos registrados.</td></tr>
              ) : contracts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{c.plan_name || '—'}</div>
                    {c.price_brl && <div className="text-xs text-slate-500">R$ {Number(c.price_brl).toFixed(2)}/mês</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateBr(c.started_at)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.expires_at ? formatDateBr(c.expires_at) : <span className="text-emerald-700">Vitalício</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge-${
                      c.status === 'active' ? 'green' :
                      c.status === 'expired' ? 'red' :
                      c.status === 'cancelled' ? 'gray' : 'yellow'
                    } text-xs`}>
                      {c.status === 'active' ? 'Ativo' : c.status === 'expired' ? 'Expirado' : c.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments tab */}
      {tab === 'payments' && (
        <div className="card overflow-x-auto">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Pagamentos recentes</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left">Descrição</th>
                <th className="px-4 py-2.5 text-left">Tipo</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">Sem pagamentos registrados.</td></tr>
              ) : payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-slate-800">{p.description || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs capitalize">{p.type}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">R$ {Number(p.amount_brl).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge-${p.status === 'paid' ? 'green' : p.status === 'failed' ? 'red' : 'gray'} text-xs`}>
                      {p.status === 'paid' ? 'Pago' : p.status === 'failed' ? 'Falhou' : p.status === 'pending' ? 'Pendente' : p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {formatDateBr(p.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Features */}
      {tab === 'features' && <FeaturesPanel tenantId={id} contractExpiresAt={t.contract_expires_at} />}

      {/* DLQ */}
      {tab === 'dlq' && <DlqPanel tenantId={id} />}

      {/* Incidentes */}
      {tab === 'incidents' && <IncidentsPanel tenantId={id} />}
      </>
      )}
    </div>
  );
}

/* ──────────────────────── Features Panel ──────────────────────── */
function defaultAccessUntilDate() {
  return addCalendarDaysBr(getCalendarDayKeyBr(), 30);
}

function toDateInputValue(iso) {
  if (!iso) return defaultAccessUntilDate();
  const key = toDateInputValueBr(iso);
  return key || defaultAccessUntilDate();
}

function FeaturesPanel({ tenantId, contractExpiresAt }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toggling, setToggling] = React.useState(null);
  const [enableModal, setEnableModal] = React.useState(null);
  const [enableForm, setEnableForm] = React.useState({
    expiresAt: defaultAccessUntilDate(),
    isComplimentary: false,
  });

  const load = () => {
    setLoading(true);
    api.get(`/api/admin/tenants/${tenantId}/features`)
      .then((r) => setRows(r.data))
      .finally(() => setLoading(false));
  };

  React.useEffect(load, [tenantId]);

  const openEnableModal = (feature, renew = false) => {
    const sub = feature.subscription;
    setEnableForm({
      expiresAt: renew && sub?.expiresAt
        ? toDateInputValue(sub.expiresAt)
        : defaultAccessUntilDate(),
      isComplimentary: !!sub?.isComplimentary,
    });
    setEnableModal(feature);
  };

  const closeEnableModal = () => setEnableModal(null);

  const confirmEnable = async () => {
    if (!enableModal) return;
    setToggling(enableModal.slug);
    try {
      await api.post(`/api/admin/tenants/${tenantId}/features/${enableModal.slug}`, {
        action: 'enable',
        expiresAt: enableForm.expiresAt,
        isComplimentary: enableForm.isComplimentary,
      });
      closeEnableModal();
      load();
      dialog.toast.success('Addon liberado');
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const disable = async (slug) => {
    setToggling(slug);
    try {
      await api.post(`/api/admin/tenants/${tenantId}/features/${slug}`, { action: 'disable' });
      load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const enableFree = async (slug) => {
    setToggling(slug);
    try {
      await api.post(`/api/admin/tenants/${tenantId}/features/${slug}`, { action: 'enable' });
      load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const formatMoney = (v) => {
    const n = parseFloat(v);
    return Number.isNaN(n) ? v : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <RefreshCw className="w-5 h-5 text-brand-600 animate-spin inline-block" />
      </div>
    );
  }

  const isLifetime = !contractExpiresAt;

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-start gap-2 text-sm text-slate-600">
        <Sparkles className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          {isLifetime ? (
            <p>Contrato <strong>vitalício</strong> — addons pagos são cobrados à parte.</p>
          ) : (
            <p>Contrato com vencimento em <strong>{formatDateBr(contractExpiresAt)}</strong>.</p>
          )}
          <p className="text-xs text-slate-500">
            Cobrança de addons: todo dia <strong>05</strong> (vencimento do pagamento).
            Isso <strong>não bloqueia</strong> o acesso — o addon só encerra na data de vigência que você definir ao liberar.
          </p>
        </div>
      </div>

      {(() => {
        const ActionButtons = ({ f }) => {
          const active = f.tenantActive;
          if (f.includedViaPlan) {
            return <span className="text-xs text-slate-400">—</span>;
          }
          return active ? (
            <>
              {!f.isFree && (
                <button type="button" disabled={toggling === f.slug} onClick={() => openEnableModal(f, true)}
                  className="text-xs px-3 py-2 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 font-medium">
                  Renovar
                </button>
              )}
              <button type="button" disabled={toggling === f.slug} onClick={() => disable(f.slug)}
                className="text-xs px-3 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium">
                Revogar
              </button>
            </>
          ) : (
            <button type="button" disabled={toggling === f.slug}
              onClick={() => (f.isFree ? enableFree(f.slug) : openEnableModal(f))}
              className="text-xs px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium">
              Liberar
            </button>
          );
        };
        const StatusBadge = ({ f }) => {
          const sub = f.subscription;
          if (f.includedViaPlan) {
            return (
              <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                Incluído no plano
              </span>
            );
          }
          if (!f.tenantActive) return <span className="text-xs text-slate-500">Inativo</span>;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Ativo{sub?.expiresAt ? ` até ${formatDateBr(sub.expiresAt)}` : ''}
              </span>
              {sub?.isComplimentary && (
                <span className="text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">Cortesia</span>
              )}
            </div>
          );
        };

        return (
          <>
            {/* Mobile: cards */}
            <div className="md:hidden space-y-3">
              {rows.map((f) => (
                <div key={f.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{f.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{f.slug}</div>
                    </div>
                    <span className="text-xs text-slate-600 shrink-0 mt-0.5">
                      {f.isFree ? 'Grátis' : `${formatMoney(f.priceBrl)}/mês`}
                    </span>
                  </div>
                  <div className="mt-2"><StatusBadge f={f} /></div>
                  <div className="mt-3 flex gap-2">
                    <ActionButtons f={f} />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: tabela */}
            <div className="hidden md:block card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Feature</th>
                      <th className="px-4 py-2.5 text-left">Preço</th>
                      <th className="px-4 py-2.5 text-left">Status no tenant</th>
                      <th className="px-4 py-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((f) => (
                      <tr key={f.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{f.name}</div>
                          <div className="text-xs text-slate-500 font-mono">{f.slug}</div>
                        </td>
                        <td className="px-4 py-3">{f.isFree ? 'Grátis' : `${formatMoney(f.priceBrl)}/mês`}</td>
                        <td className="px-4 py-3"><StatusBadge f={f} /></td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5"><ActionButtons f={f} /></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {enableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="card w-full max-w-md p-5 space-y-4 shadow-xl">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Liberar addon</h3>
              <p className="text-xs text-slate-500 mt-1">
                {enableModal.name} · {formatMoney(enableModal.priceBrl)}/mês
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Acesso válido até
              </label>
              <input
                type="date"
                className="input w-full"
                value={enableForm.expiresAt}
                min={getCalendarDayKeyBr()}
                onChange={(e) => setEnableForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
              />
              <p className="text-xs text-slate-500 mt-1">
                O addon encerra automaticamente após esta data. O vencimento de pagamento (dia 05) não revoga o acesso.
              </p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableForm.isComplimentary}
                onChange={(e) => setEnableForm((prev) => ({ ...prev, isComplimentary: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-brand-600 mt-0.5"
              />
              <span className="text-sm text-slate-800">
                <span className="font-medium">Liberação gratuita (cortesia)</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Não entra na cobrança mensal, mesmo sendo addon pago.
                </span>
              </span>
            </label>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={confirmEnable}
                disabled={!!toggling || !enableForm.expiresAt}
                className="btn-primary flex-1 justify-center"
              >
                Confirmar liberação
              </button>
              <button type="button" onClick={closeEnableModal} className="btn-secondary flex-1 justify-center">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── DLQ Panel ──────────────────────── */
function DlqPanel({ tenantId }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [redriving, setRedriving] = React.useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/api/admin/tenants/${tenantId}/dlq?limit=100`)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  };
  React.useEffect(load, [tenantId]);

  const redriveAll = async () => {
    if (!(await dialog.confirm({ title: 'Re-enfileirar DLQ', message: MSG.redriveDlq }))) return;
    setRedriving(true);
    try {
      const { data: r } = await api.post(`/api/admin/tenants/${tenantId}/dlq/redrive`, {});
      dialog.toast.success(MSG.redriven(r.redriven, r.campaigns));
      load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, 'Não conseguimos re-enfileirar.'));
    } finally {
      setRedriving(false);
    }
  };

  if (loading) return <div className="py-8 text-center"><RefreshCw className="w-5 h-5 text-brand-600 animate-spin inline-block" /></div>;
  if (!data || !data.items.length) return (
    <div className="card p-8 text-center">
      <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
      <p className="text-sm text-slate-600">Sem mensagens na DLQ. Tudo limpo aqui.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Resumo por motivo */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">DLQ — mensagens descartadas</h3>
          <button onClick={redriveAll} disabled={redriving} className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 flex items-center gap-1.5">
            {redriving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
            Re-enfileirar tudo
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {data.byReason.map((r) => (
            <span key={r.reason} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
              <strong>{r.n}</strong> · {r.reason}
            </span>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left">Contato</th>
              <th className="px-4 py-2.5 text-left">Telefone</th>
              <th className="px-4 py-2.5 text-left">Motivo</th>
              <th className="px-4 py-2.5 text-left">Quando</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-3 text-slate-800">{it.name}</td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{it.phone}</td>
                <td className="px-4 py-3 text-amber-700 text-xs">{it.error || '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{formatDateTimeBr(it.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────── Incidents Panel ──────────────────────── */
function IncidentsPanel({ tenantId }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = () => {
    setLoading(true);
    api.get(`/api/admin/tenants/${tenantId}/incidents?limit=50`)
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  };
  React.useEffect(load, [tenantId]);

  const resolve = async (id) => {
    await api.post(`/api/admin/incidents/${id}/resolve`);
    load();
  };

  if (loading) return <div className="py-8 text-center"><RefreshCw className="w-5 h-5 text-brand-600 animate-spin inline-block" /></div>;
  if (!items.length) return (
    <div className="card p-8 text-center">
      <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
      <p className="text-sm text-slate-600">Nenhum incidente registrado para este cliente.</p>
    </div>
  );

  const colorFor = (sev) => sev === 'critical'
    ? 'bg-red-50 border-red-200 text-red-700'
    : sev === 'warning'
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-slate-50 border-slate-200 text-slate-600';

  return (
    <div className="space-y-2">
      {items.map((ev) => (
        <div key={ev.id} className={`card p-4 border ${colorFor(ev.severity)}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase">{ev.severity}</span>
                <span className="text-sm font-medium text-slate-900">{ev.kind}</span>
                {ev.resolved && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">resolvido</span>}
              </div>
              <pre className="text-[11px] mt-1.5 overflow-x-auto bg-white/40 p-2 rounded">{JSON.stringify(ev.payload, null, 2)}</pre>
              <div className="text-[10px] text-slate-500 mt-1">{formatDateTimeBr(ev.created_at)}</div>
            </div>
            {!ev.resolved && (
              <button onClick={() => resolve(ev.id)} className="text-xs px-2 py-1 bg-white/60 hover:bg-white rounded text-slate-700 shrink-0">
                Marcar resolvido
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
