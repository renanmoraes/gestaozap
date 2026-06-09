import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Edit2, Save, X, Wifi, WifiOff, AlertTriangle, CheckCircle2,
  Smartphone, MessageSquare, Users, FileText, CreditCard, Calendar,
  Shield, ShieldOff, PowerOff, Plus, Tag, Clock, Hash, Building2, RefreshCw,
} from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage, MSG } from '../../utils/messages';
import { formatPhone, maskPhoneInput } from '../../utils/phone';
import { formatDateBr, formatDateTimeBr } from '../../utils/timezone';

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
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'text-brand-600 border-brand-600'
          : 'text-slate-500 border-transparent hover:text-slate-800'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
      {badge != null && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
          {badge}
        </span>
      )}
    </button>
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
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/tenants')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" />
          Voltar para a lista de clientes
        </button>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
          {!editing ? (
            <>
              <button onClick={makeAffiliate} className="btn-secondary text-sm flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Tornar afiliado
              </button>
              <button onClick={() => setEdit(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" />
                Editar dados
              </button>
              <button
                onClick={toggleActive}
                className={`text-sm flex items-center gap-1.5 px-3 py-2 rounded-lg ${
                  t.active
                    ? 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                    : 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {t.active ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                {t.active ? 'Bloquear' : 'Reativar'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setEdit(false); load(); }} className="btn-secondary text-sm">
                Cancelar
              </button>
              <button onClick={save} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white text-lg font-bold flex items-center justify-center">
              {t.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              {editing ? (
                <div className="space-y-2">
                  <input className="input py-1.5" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <div className="flex gap-2">
                    <span className="text-xs text-slate-500 py-1">gestaozap.digital/</span>
                    <input className="input py-1 text-sm" placeholder="slug" value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-slate-900">{t.name}</h1>
                  <p className="text-sm text-slate-500 font-mono">/{t.slug}</p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            {t.active ? (
              <span className="badge-green flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" /> Ativo
              </span>
            ) : (
              <span className="badge-red flex items-center gap-1.5">
                <ShieldOff className="w-3 h-3" /> Bloqueado
              </span>
            )}
            {t.wa_status === 'connected' ? (
              <span className="badge-blue flex items-center gap-1.5">
                <Wifi className="w-3 h-3" /> WhatsApp conectado
              </span>
            ) : (
              <span className="badge-gray flex items-center gap-1.5">
                <WifiOff className="w-3 h-3" /> WhatsApp desconectado
              </span>
            )}
          </div>
        </div>

        {/* Dados rápidos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Número cadastrado</div>
            {editing ? (
              <input className="input py-1.5 text-sm font-mono"
                value={formatPhone(form.registeredPhone)}
                onChange={(e) => setForm({ ...form, registeredPhone: maskPhoneInput(e.target.value) })} />
            ) : (
              <div className="text-sm font-mono text-slate-800">{formatPhone(t.registered_phone)}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Plano atual</div>
            {editing ? (
              <select className="input py-1.5 text-sm" value={form.planSlug}
                onChange={(e) => setForm({ ...form, planSlug: e.target.value })}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <div className="text-sm text-slate-800">
                {t.plan_name || '—'}
                {t.price_brl && (
                  <span className="text-xs text-slate-400 ml-1">R$ {Number(t.price_brl).toFixed(2)}/mês</span>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Vencimento</div>
            {editing ? (
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={form.lifetime}
                    onChange={(e) => setForm({ ...form, lifetime: e.target.checked })} />
                  Vitalício ♾️
                </label>
                {!form.lifetime && (
                  <input type="number" className="input py-1 text-sm" min="1" value={form.expiryDays}
                    onChange={(e) => setForm({ ...form, expiryDays: parseInt(e.target.value) || 30 })}
                    placeholder="Dias" />
                )}
              </div>
            ) : isLifetime ? (
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
          <div>
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
            <Tag className="w-3 h-3 text-brand-600" />
            Indicado por <strong>{t.affiliate_name}</strong> · código <code className="font-mono">{t.affiliate_code}</code>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-2">
        <Tab active={tab === 'overview'} onClick={() => setTab('overview')} icon={Building2}>Visão geral</Tab>
        <Tab active={tab === 'whatsapp'} onClick={() => setTab('whatsapp')} icon={Smartphone}>WhatsApp</Tab>
        <Tab active={tab === 'contracts'} onClick={() => setTab('contracts')} icon={Calendar} badge={contracts.length}>Contratos</Tab>
        <Tab active={tab === 'payments'} onClick={() => setTab('payments')} icon={CreditCard} badge={payments.length}>Pagamentos</Tab>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Aceite dos Termos</span>
              </div>
              {t.terms_accepted_at ? (
                <div className="text-sm text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Aceito em {formatDateBr(t.terms_accepted_at)}
                  <span className="text-xs text-slate-400">(v{t.terms_version})</span>
                </div>
              ) : (
                <div className="text-sm text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
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
            <div className="flex items-start justify-between mb-3">
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
                className={`text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg ${
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
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Sessão WhatsApp</h3>
                <p className="text-xs text-slate-500">Estado da conexão e do dispositivo do cliente</p>
              </div>
              {t.wa_status === 'connected' && (
                <button onClick={disconnectWa} className="text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200">
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
        <div className="card overflow-hidden">
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
        <div className="card overflow-hidden">
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

      {/* DLQ */}
      {tab === 'dlq' && <DlqPanel tenantId={id} />}

      {/* Incidentes */}
      {tab === 'incidents' && <IncidentsPanel tenantId={id} />}
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
      <div className="card overflow-hidden">
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
