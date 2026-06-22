import React, { useState, useEffect, useRef } from 'react';
import {
  UserCircle, Upload, Trash2, Save, Loader2, KeyRound, ExternalLink,
  MapPin, Shield, Lock, Sparkles, Building2, X, Mail,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api';
import { dialog } from '../utils/dialog';
import { apiErrorMessage } from '../utils/messages';
import { formatPhone } from '../utils/phone';
import { resolveCampaignImageUrl } from '../utils/upload';
import { useTenant } from '../context/TenantContext';
import BusinessHoursEditor from '../components/profile/BusinessHoursEditor';
import './profile/profile.css';

const TABS = [
  { id: 'identity', label: 'Identidade', icon: Building2 },
  { id: 'security', label: 'Segurança', icon: Shield },
  { id: 'vitrine', label: 'Vitrine', icon: Sparkles },
];

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

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '—';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}••@${domain}`;
  return `${local.slice(0, 2)}•••@${domain}`;
}

/** Senha só existe em memória no momento do submit — nunca vem da API. */
function useEphemeralPassword() {
  const ref = useRef('');
  const set = (v) => { ref.current = v; };
  const get = () => ref.current;
  const clear = () => { ref.current = ''; };
  return { set, get, clear };
}

export default function Profile() {
  const { reloadSession } = useTenant();
  const fileRef = useRef(null);
  const emailPassword = useEphemeralPassword();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [tab, setTab] = useState('identity');
  const [form, setForm] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [emailEditing, setEmailEditing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPwdKey, setEmailPwdKey] = useState(0);
  const [sendingReset, setSendingReset] = useState(false);

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
      setLoginEmail(res.data.email || '');
      setNewEmail(res.data.email || '');
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => emailPassword.clear();
  }, []);

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

  const cancelEmailEdit = () => {
    setEmailEditing(false);
    setNewEmail(loginEmail);
    emailPassword.clear();
    setEmailPwdKey((k) => k + 1);
  };

  const sendResetEmail = async () => {
    if (!(await dialog.confirm({
      title: 'Redefinir senha por email',
      message: 'Isso vai gerar uma nova senha temporária e enviar para o seu email de login. Você precisará trocar a senha no próximo acesso. Continuar?',
    }))) return;
    setSendingReset(true);
    try {
      const res = await api.post('/api/auth/send-reset-email');
      dialog.toast.success(
        res.data.emailSent
          ? `Email de redefinição enviado para ${maskEmail(loginEmail)}.`
          : 'Senha redefinida, mas o email não pôde ser enviado. Entre em contato com o suporte.',
      );
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSendingReset(false);
    }
  };

  const saveEmail = async () => {
    const pwd = emailPassword.get();
    if (!pwd) {
      dialog.toast.error('Digite sua senha atual para confirmar');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/tenant/profile/email', {
        email: newEmail.trim(),
        currentPassword: pwd,
      });
      emailPassword.clear();
      setEmailEditing(false);
      setLoginEmail(newEmail.trim().toLowerCase());
      dialog.toast.success('Email atualizado');
    } catch (err) {
      emailPassword.clear();
      setEmailPwdKey((k) => k + 1);
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
    <div className="page-content profile-page">
      <div className="profile-shell">
        <header className="profile-hero">
          <div className="profile-hero-logo">
            {logoSrc ? (
              <img src={logoSrc} alt="" />
            ) : (
              <UserCircle className="w-10 h-10 text-stone-500" />
            )}
          </div>
          <div>
            <h1>{form.name || 'Sua empresa'}</h1>
            <span className="profile-hero-slug">{form.slug}</span>
            <p className="profile-hero-meta">{vitrineUrl}</p>
          </div>
        </header>

        <nav className="profile-tabs" aria-label="Seções do perfil">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`profile-tab ${tab === id ? 'profile-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {label}
              </span>
            </button>
          ))}
        </nav>

        {tab === 'identity' && (
          <section className="profile-panel">
            <h2 className="profile-panel-title">Marca e presença</h2>

            <div className="profile-logo-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onLogoPick}
              />
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
            <p className="profile-field-hint mb-4">JPG, PNG ou WebP · até 2 MB · aparece na vitrine pública</p>

            <div className="profile-field">
              <label>Nome da empresa</label>
              <input
                className="input w-full"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="profile-field">
              <label>Link fixo (slug)</label>
              <input className="input w-full profile-readonly" value={form.slug} disabled readOnly />
              <p className="profile-field-hint">Alteração apenas pelo suporte ou admin.</p>
            </div>
          </section>
        )}

        {tab === 'security' && (
          <section className="profile-panel">
            <div className="profile-shield-note">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Sua senha nunca é exibida nem armazenada nesta tela.
                Só pedimos confirmação no momento de alterar o email.
              </span>
            </div>

            <h2 className="profile-panel-title">Acesso à conta</h2>

            <div className="profile-security-row">
              <div>
                <div className="profile-security-label">Email de login</div>
                <div className="profile-security-value">{maskEmail(loginEmail)}</div>
              </div>
              {!emailEditing && (
                <button type="button" className="btn btn-secondary text-xs" onClick={() => setEmailEditing(true)}>
                  Alterar email
                </button>
              )}
            </div>

            {emailEditing && (
              <div className="profile-email-form">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-stone-800">Novo email</span>
                  <button type="button" onClick={cancelEmailEdit} className="p-1 text-stone-400 hover:text-stone-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="profile-field">
                  <label>Novo email</label>
                  <input
                    type="email"
                    className="input w-full"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="profile-field">
                  <label>Senha atual (confirmação)</label>
                  <input
                    key={emailPwdKey}
                    type="password"
                    className="input w-full"
                    onChange={(e) => emailPassword.set(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Digite sua senha atual"
                  />
                  <p className="profile-field-hint">A senha não fica salva — usada só nesta confirmação.</p>
                </div>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={saveEmail} disabled={saving} className="btn btn-primary text-xs">
                    Confirmar email
                  </button>
                  <button type="button" onClick={cancelEmailEdit} className="btn btn-secondary text-xs">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="profile-security-row">
              <div>
                <div className="profile-security-label">Senha</div>
                <div className="profile-security-value">••••••••</div>
              </div>
              <Link to={`${routePrefix}/change-password`} className="btn btn-secondary text-xs inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                Alterar senha
              </Link>
            </div>

            <div className="profile-security-row">
              <div>
                <div className="profile-security-label">Redefinição por email</div>
                <div className="profile-security-value text-xs text-stone-400">Envia nova senha temporária para o email cadastrado</div>
              </div>
              <button
                type="button"
                disabled={sendingReset}
                onClick={sendResetEmail}
                className="btn btn-secondary text-xs inline-flex items-center gap-1.5"
              >
                {sendingReset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Enviar por email
              </button>
            </div>

            <div className="profile-security-row">
              <div>
                <div className="profile-security-label">WhatsApp cadastrado</div>
                <div className="profile-security-value">{formatPhone(form.registeredPhone)}</div>
              </div>
            </div>
            <p className="profile-field-hint mt-2">
              Número vinculado ao disparo — alteração somente via suporte.
            </p>
          </section>
        )}

        {tab === 'vitrine' && (
          <>
            <section className="profile-panel">
              <h2 className="profile-panel-title">Informações públicas</h2>
              <p className="text-sm text-stone-600 mb-4">
                Exibidas em <strong>/promocao-do-dia</strong> quando o addon estiver ativo.
              </p>

              <div className="profile-field">
                <label>Slogan</label>
                <input
                  className="input w-full"
                  placeholder="Ex: Padaria artesanal desde 1998"
                  value={form.profile.tagline || ''}
                  onChange={(e) => setProfileField('tagline', e.target.value)}
                />
              </div>

              <div className="profile-field">
                <label className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Endereço
                </label>
                <input
                  className="input w-full mb-2"
                  placeholder="Rua, número"
                  value={form.profile.address?.line1 || ''}
                  onChange={(e) => setProfileField('address.line1', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2 mb-2">
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
                  className="input w-24"
                  placeholder="UF"
                  maxLength={2}
                  value={form.profile.address?.state || ''}
                  onChange={(e) => setProfileField('address.state', e.target.value.toUpperCase())}
                />
              </div>

              <div className="profile-field">
                <label className="flex items-center gap-1">
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

            <section className="profile-panel">
              <h2 className="profile-panel-title">Horários e disponibilidade</h2>

              <div className="profile-field">
                <label>Horário de funcionamento</label>
                <BusinessHoursEditor
                  value={form.profile.businessHours}
                  onChange={(businessHours) => setProfileField('businessHours', businessHours)}
                />
              </div>

              <div className="profile-field">
                <label>Disponibilidade</label>
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

              <div className="profile-field">
                <label>Observação</label>
                <input
                  className="input w-full"
                  placeholder="Ex: Delivery das 10h às 22h"
                  value={form.profile.availabilityNote || ''}
                  onChange={(e) => setProfileField('availabilityNote', e.target.value)}
                />
              </div>
            </section>
          </>
        )}

        {tab !== 'security' && (
          <div className="profile-footer">
            <button type="button" onClick={saveProfile} disabled={saving} className="btn btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar alterações
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
