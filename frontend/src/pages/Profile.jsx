import React, { useState, useEffect, useRef } from 'react';
import { UserCircle, Upload, Trash2, Save, Loader2, KeyRound, ExternalLink, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api';
import { dialog } from '../utils/dialog';
import { apiErrorMessage } from '../utils/messages';
import { formatPhone } from '../utils/phone';
import { resolveCampaignImageUrl } from '../utils/upload';
import { useTenant } from '../context/TenantContext';
import BusinessHoursEditor from '../components/profile/BusinessHoursEditor';

const AVAILABILITY_OPTIONS = [
  { value: 'open', label: 'Aberto (segue horário)' },
  { value: 'closed_today', label: 'Fechado hoje' },
  { value: 'delivery_only', label: 'Só delivery / remoto' },
  { value: 'custom', label: 'Personalizado' },
];

function vitrineUrlFromSlug(slug) {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.origin}/app/promocao-do-dia`;
  }
  return `https://${slug}.gestaozap.digital/promocao-do-dia`;
}

export default function Profile() {
  const { reloadSession } = useTenant();
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState(null);
  const [emailForm, setEmailForm] = useState({ email: '', currentPassword: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/tenant/profile');
      setForm({
        name: res.data.name || '',
        slug: res.data.slug || '',
        logoUrl: res.data.logoUrl || null,
        registeredPhone: res.data.registeredPhone || '',
        profile: res.data.profile || {},
      });
      setEmailForm({ email: res.data.email || '', currentPassword: '' });
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setProfileField = (path, value) => {
    setForm((prev) => {
      const next = { ...prev, profile: { ...prev.profile } };
      if (path.startsWith('address.')) {
        const key = path.split('.')[1];
        next.profile.address = { ...next.profile.address, [key]: value };
      } else {
        next.profile[path] = value;
      }
      return next;
    });
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch('/api/tenant/profile', {
        name: form.name,
        profile: form.profile,
      });
      await reloadSession?.();
      dialog.toast.success('Perfil salvo');
      load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveEmail = async () => {
    if (!emailForm.currentPassword) {
      dialog.toast.error('Informe a senha atual para alterar o email');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/tenant/profile/email', emailForm);
      dialog.toast.success('Email atualizado');
      setEmailForm((f) => ({ ...f, currentPassword: '' }));
      load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onLogoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      dialog.toast.error('Logo: máximo 2 MB');
      return;
    }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await api.post('/api/tenant/profile/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((f) => ({ ...f, logoUrl: res.data.logoUrl }));
      dialog.toast.success('Logo atualizada');
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    if (!await dialog.confirm({ title: 'Remover logo', message: 'Remover a logo do perfil?' })) return;
    try {
      await api.delete('/api/tenant/profile/logo');
      setForm((f) => ({ ...f, logoUrl: null }));
      dialog.toast.success('Logo removida');
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    }
  };

  if (loading || !form) {
    return (
      <div className="page-content flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const logoSrc = resolveCampaignImageUrl(form.logoUrl);
  const vitrineUrl = vitrineUrlFromSlug(form.slug);
  const routePrefix = window.location.pathname.startsWith('/app') ? '/app' : '';

  return (
    <div className="page-content">
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="page-header !px-0 !pt-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <UserCircle className="w-5 h-5 text-brand-600" />
            Perfil
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Identidade da empresa e dados da vitrine de promoções</p>
        </div>
      </div>

      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Identidade</h2>

        <div className="flex flex-wrap items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="w-full h-full object-contain" />
            ) : (
              <UserCircle className="w-10 h-10 text-slate-300" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onLogoPick} />
            <button type="button" disabled={uploadingLogo} onClick={() => fileRef.current?.click()} className="btn btn-secondary text-xs">
              {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Enviar logo
            </button>
            {form.logoUrl && (
              <button type="button" onClick={removeLogo} className="btn btn-secondary text-xs text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
                Remover
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500">JPG, PNG ou WebP · até 2 MB</p>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Nome da empresa</label>
          <input
            className="input w-full"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Link (slug)</label>
          <input className="input w-full bg-slate-50 text-slate-500" value={form.slug} disabled readOnly />
          <p className="text-xs text-slate-500 mt-1">O slug não pode ser alterado aqui.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Vitrine pública</label>
          <input className="input w-full bg-slate-50 text-slate-500 text-sm" value={vitrineUrl} disabled readOnly />
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Acesso</h2>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Email de login</label>
          <input
            type="email"
            className="input w-full"
            value={emailForm.email}
            onChange={(e) => setEmailForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Senha atual (para confirmar email)</label>
          <input
            type="password"
            className="input w-full"
            value={emailForm.currentPassword}
            onChange={(e) => setEmailForm((f) => ({ ...f, currentPassword: e.target.value }))}
            autoComplete="current-password"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={saveEmail} disabled={saving} className="btn btn-secondary text-xs">
            Salvar email
          </button>
          <Link to={`${routePrefix}/change-password`} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            Alterar senha
          </Link>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">WhatsApp cadastrado</label>
          <input
            className="input w-full bg-slate-50 text-slate-500"
            value={formatPhone(form.registeredPhone)}
            disabled
            readOnly
          />
          <p className="text-xs text-slate-500 mt-1">Alteração somente via suporte — evita desvincular o número errado.</p>
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Informações para promoções</h2>
        <p className="text-xs text-slate-500">Aparecem na vitrine pública quando o addon estiver ativo.</p>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Slogan</label>
          <input
            className="input w-full"
            placeholder="Ex: Padaria artesanal desde 1998"
            value={form.profile.tagline || ''}
            onChange={(e) => setProfileField('tagline', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Endereço
            </label>
            <input
              className="input w-full mb-2"
              placeholder="Rua, número"
              value={form.profile.address?.line1 || ''}
              onChange={(e) => setProfileField('address.line1', e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="Bairro"
                value={form.profile.address?.neighborhood || ''}
                onChange={(e) => setProfileField('address.neighborhood', e.target.value)}
              />
              <input
                className="input"
                placeholder="Cidade"
                value={form.profile.address?.city || ''}
                onChange={(e) => setProfileField('address.city', e.target.value)}
              />
            </div>
            <input
              className="input w-24 mt-2"
              placeholder="UF"
              maxLength={2}
              value={form.profile.address?.state || ''}
              onChange={(e) => setProfileField('address.state', e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">Horário de funcionamento</label>
          <BusinessHoursEditor
            value={form.profile.businessHours}
            onChange={(businessHours) => setProfileField('businessHours', businessHours)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Disponibilidade</label>
          <select
            className="input w-full"
            value={form.profile.availabilityStatus || 'open'}
            onChange={(e) => setProfileField('availabilityStatus', e.target.value)}
          >
            {AVAILABILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Observação de disponibilidade</label>
          <input
            className="input w-full"
            placeholder="Ex: Delivery das 10h às 22h"
            value={form.profile.availabilityNote || ''}
            onChange={(e) => setProfileField('availabilityNote', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5" /> Instagram
          </label>
          <input
            className="input w-full"
            placeholder="https://instagram.com/sua_loja"
            value={form.profile.instagramUrl || ''}
            onChange={(e) => setProfileField('instagramUrl', e.target.value)}
          />
        </div>
      </section>

      <div className="flex justify-end pb-8">
        <button type="button" onClick={saveProfile} disabled={saving} className="btn btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar perfil
        </button>
      </div>
    </div>
    </div>
  );
}
