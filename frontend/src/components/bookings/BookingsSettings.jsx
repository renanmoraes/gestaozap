import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock, Ban, Users, Tag, Plus, Trash2, Save, Loader2, CalendarOff, Bell, Link2, Unlink,
} from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage } from '../../utils/messages';
import BookingHoursEditor from './BookingHoursEditor';

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120];

const emptyEventType = () => ({
  name: '',
  durationMin: 30,
  priceBrl: '',
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 120,
  maxAdvanceDays: 60,
  staffIds: [],
});

function formatMoney(value) {
  if (value == null || value === '') return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function BookingsSettings({ onReload }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [businessHours, setBusinessHours] = useState(null);
  const [eventForm, setEventForm] = useState(null);
  const [blockForm, setBlockForm] = useState({
    startsAt: '',
    endsAt: '',
    allDay: false,
    reason: '',
    staffId: '',
  });
  const [vacationForm, setVacationForm] = useState({
    fromDate: '',
    toDate: '',
    reason: '',
  });
  const [staffForm, setStaffForm] = useState(null);
  const [reminderForm, setReminderForm] = useState({
    reminderEmailEnabled: true,
    reminderWhatsappEnabled: true,
    reminderHoursBefore: '24, 1',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/bookings/settings');
      setSettings(res.data);
      setBusinessHours(res.data.businessHours || {});
      const p = res.data.page || {};
      setReminderForm({
        reminderEmailEnabled: p.reminderEmailEnabled !== false,
        reminderWhatsappEnabled: p.reminderWhatsappEnabled !== false,
        reminderHoursBefore: (p.reminderHoursBefore || [24, 1]).join(', '),
      });
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveHours = async () => {
    setSaving(true);
    try {
      await api.put('/api/bookings/availability', { businessHours });
      dialog.toast.success('Horários salvos');
      await load();
      onReload?.();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveReminders = async () => {
    const hours = reminderForm.reminderHoursBefore
      .split(/[,;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => n > 0 && n <= 168);
    if (!hours.length) {
      dialog.toast.error('Informe horas válidas (ex: 24, 1)');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/bookings/page', {
        reminderEmailEnabled: reminderForm.reminderEmailEnabled,
        reminderWhatsappEnabled: reminderForm.reminderWhatsappEnabled,
        reminderHoursBefore: hours,
      });
      dialog.toast.success('Lembretes salvos');
      await load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveEventType = async () => {
    if (!eventForm?.name?.trim()) {
      dialog.toast.error('Informe o nome do atendimento');
      return;
    }
    setSaving(true);
    try {
      if (eventForm.id) {
        await api.patch(`/api/bookings/event-types/${eventForm.id}`, eventForm);
        dialog.toast.success('Atendimento atualizado');
      } else {
        await api.post('/api/bookings/event-types', eventForm);
        dialog.toast.success('Atendimento criado');
      }
      setEventForm(null);
      await load();
      onReload?.();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeEventType = async (id, name) => {
    const ok = await dialog.confirm({ title: 'Desativar atendimento', message: `Desativar "${name}"?`, danger: true });
    if (!ok) return;
    try {
      await api.delete(`/api/bookings/event-types/${id}`);
      dialog.toast.success('Atendimento desativado');
      await load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    }
  };

  const saveBlock = async () => {
    if (!blockForm.startsAt || !blockForm.endsAt) {
      dialog.toast.error('Informe início e fim do bloqueio');
      return;
    }
    setSaving(true);
    try {
      const toIso = (v) => (v ? new Date(v).toISOString() : null);
      await api.post('/api/bookings/blocks', {
        startsAt: toIso(blockForm.startsAt),
        endsAt: toIso(blockForm.endsAt),
        allDay: blockForm.allDay,
        reason: blockForm.reason,
        staffId: blockForm.staffId || null,
      });
      dialog.toast.success('Bloqueio criado');
      setBlockForm({ startsAt: '', endsAt: '', allDay: false, reason: '', staffId: '' });
      await load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveVacation = async () => {
    if (!vacationForm.fromDate) {
      dialog.toast.error('Informe a data inicial');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/bookings/exceptions', vacationForm);
      dialog.toast.success('Férias / fechamento registrado');
      setVacationForm({ fromDate: '', toDate: '', reason: '' });
      await load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveStaff = async () => {
    if (!staffForm?.name?.trim()) {
      dialog.toast.error('Informe o nome do funcionário');
      return;
    }
    setSaving(true);
    try {
      if (staffForm.id) {
        await api.patch(`/api/bookings/staff/${staffForm.id}`, staffForm);
        dialog.toast.success('Funcionário atualizado');
      } else {
        await api.post('/api/bookings/staff', staffForm);
        dialog.toast.success('Funcionário cadastrado');
      }
      setStaffForm(null);
      await load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeStaff = async (id, name) => {
    const ok = await dialog.confirm({ title: 'Desativar funcionário', message: `Desativar "${name}"?`, danger: true });
    if (!ok) return;
    try {
      await api.delete(`/api/bookings/staff/${id}`);
      dialog.toast.success('Funcionário desativado');
      await load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    }
  };

  const connectGoogle = async () => {
    setSaving(true);
    try {
      const res = await api.get('/api/bookings/google-calendar/connect');
      if (res.data?.url) window.location.href = res.data.url;
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const disconnectGoogle = async () => {
    const ok = await dialog.confirm({
      title: 'Desconectar Google Calendar',
      message: 'Os horários ocupados do Google deixarão de bloquear novos agendamentos.',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete('/api/bookings/google-calendar');
      dialog.toast.success('Google Calendar desconectado');
      await load();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="card p-6 text-sm text-slate-600">
        Configuração de agendamentos indisponível. Tente recarregar a página.
      </div>
    );
  }

  const activeStaff = (settings.staff || []).filter((s) => s.isActive);
  const activeTypes = (settings.eventTypes || []).filter((t) => t.isActive);
  const google = settings.googleCalendar || {};

  return (
    <div className="space-y-8">
      {/* Google Calendar — única integração de calendário por enquanto */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-brand-600" />
              Google Calendar
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Conecte o calendário da empresa para bloquear horários já ocupados. Por enquanto, apenas Google — Outlook em breve.
            </p>
          </div>
          {google.connected ? (
            <button type="button" className="btn btn-secondary text-sm text-red-600" onClick={disconnectGoogle}>
              <Unlink className="w-4 h-4" />
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={saving || google.configured === false}
              onClick={connectGoogle}
            >
              Conectar com Google
            </button>
          )}
        </div>
        {google.configured === false && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Integração Google ainda não configurada no servidor (GOOGLE_CALENDAR_CLIENT_ID).
          </p>
        )}
        {google.connected && (
          <div className="text-sm text-slate-700 space-y-1">
            <p>Conta: <strong>{google.googleEmail || 'Google conectado'}</strong></p>
            {google.lastSyncAt && (
              <p className="text-xs text-slate-500">
                Última consulta: {new Date(google.lastSyncAt).toLocaleString('pt-BR')}
              </p>
            )}
            {google.lastSyncError && (
              <p className="text-xs text-red-600">Erro recente: {google.lastSyncError}</p>
            )}
          </div>
        )}
      </section>

      {/* Lembretes */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-brand-600" />
              Lembretes automáticos
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              E-mail e WhatsApp para o cliente. WhatsApp só é enviado com consentimento explícito na página pública.
            </p>
          </div>
          <button type="button" className="btn btn-primary text-sm" disabled={saving} onClick={saveReminders}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar lembretes
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={reminderForm.reminderEmailEnabled}
              onChange={(e) => setReminderForm({ ...reminderForm, reminderEmailEnabled: e.target.checked })}
              className="rounded border-slate-300 text-brand-600"
            />
            Enviar confirmação e lembretes por e-mail
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={reminderForm.reminderWhatsappEnabled}
              onChange={(e) => setReminderForm({ ...reminderForm, reminderWhatsappEnabled: e.target.checked })}
              className="rounded border-slate-300 text-brand-600"
            />
            Enviar confirmação e lembretes por WhatsApp
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Lembrar quantas horas antes? (separado por vírgula)</span>
            <input
              className="input mt-1 max-w-xs"
              value={reminderForm.reminderHoursBefore}
              onChange={(e) => setReminderForm({ ...reminderForm, reminderHoursBefore: e.target.value })}
              placeholder="24, 1"
            />
          </label>
        </div>
      </section>

      {/* Tipos de atendimento */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-600" />
              Tipos de atendimento
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Duração, preço opcional e quem pode atender. Máximo {settings.limits?.maxEventTypes || 3} no plano gratuito.
            </p>
          </div>
          {!eventForm && activeTypes.length < (settings.limits?.maxEventTypes || 3) && (
            <button type="button" className="btn btn-secondary text-sm" onClick={() => setEventForm(emptyEventType())}>
              <Plus className="w-4 h-4" />
              Novo tipo
            </button>
          )}
        </div>

        {eventForm && (
          <div className="mb-4 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-slate-600">Nome</span>
                <input
                  className="input mt-1"
                  value={eventForm.name}
                  onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                  placeholder="Ex: Corte de cabelo"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Duração</span>
                <select
                  className="input mt-1"
                  value={eventForm.durationMin}
                  onChange={(e) => setEventForm({ ...eventForm, durationMin: Number(e.target.value) })}
                >
                  {DURATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Preço (opcional)</span>
                <input
                  className="input mt-1"
                  type="number"
                  min="0"
                  step="0.01"
                  value={eventForm.priceBrl}
                  onChange={(e) => setEventForm({ ...eventForm, priceBrl: e.target.value })}
                  placeholder="0,00"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Antecedência mínima (min)</span>
                <input
                  className="input mt-1"
                  type="number"
                  min="0"
                  value={eventForm.minNoticeMin}
                  onChange={(e) => setEventForm({ ...eventForm, minNoticeMin: Number(e.target.value) })}
                />
              </label>
            </div>
            {activeStaff.length > 0 && (
              <div>
                <p className="text-sm text-slate-600 mb-2">Quem pode atender este serviço?</p>
                <div className="flex flex-wrap gap-2">
                  {activeStaff.map((s) => {
                    const checked = (eventForm.staffIds || []).includes(s.id);
                    return (
                      <label key={s.id} className="inline-flex items-center gap-1.5 text-sm bg-white border border-slate-200 rounded-full px-3 py-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const ids = new Set(eventForm.staffIds || []);
                            if (e.target.checked) ids.add(s.id);
                            else ids.delete(s.id);
                            setEventForm({ ...eventForm, staffIds: [...ids] });
                          }}
                          className="rounded border-slate-300 text-brand-600"
                        />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Sem seleção = um único calendário para toda a empresa.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary text-sm" disabled={saving} onClick={saveEventType}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
              <button type="button" className="btn btn-secondary text-sm" onClick={() => setEventForm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-slate-100">
          {activeTypes.map((t) => (
            <li key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{t.name}</p>
                <p className="text-xs text-slate-500">
                  {t.durationMin} min
                  {t.priceBrl ? ` · ${formatMoney(t.priceBrl)}` : ''}
                  {(t.staffIds || []).length > 0 && ` · ${t.staffIds.length} funcionário(s)`}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={() => setEventForm({ ...t, priceBrl: t.priceBrl || '' })}
                >
                  Editar
                </button>
                {activeTypes.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary text-xs text-red-600"
                    onClick={() => removeEventType(t.id, t.name)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Horários */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-600" />
              Horário de funcionamento
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Define quando clientes podem agendar. Use intervalo para almoço.
            </p>
          </div>
          <button type="button" className="btn btn-primary text-sm" disabled={saving} onClick={saveHours}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar horários
          </button>
        </div>
        <BookingHoursEditor value={businessHours} onChange={setBusinessHours} />
      </section>

      {/* Bloqueios */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-1">
          <Ban className="w-4 h-4 text-brand-600" />
          Bloqueios e férias
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Bloqueie horários pontuais (reunião, almoço avulso) ou registre férias/fechamento por data.
        </p>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-800">Bloqueio de horário</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-slate-600">Início</span>
                <input
                  type="datetime-local"
                  className="input mt-1"
                  value={blockForm.startsAt}
                  onChange={(e) => setBlockForm({ ...blockForm, startsAt: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Fim</span>
                <input
                  type="datetime-local"
                  className="input mt-1"
                  value={blockForm.endsAt}
                  onChange={(e) => setBlockForm({ ...blockForm, endsAt: e.target.value })}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Motivo</span>
              <input
                className="input mt-1"
                value={blockForm.reason}
                onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                placeholder="Ex: Almoço, reunião interna"
              />
            </label>
            {activeStaff.length > 0 && (
              <label className="block text-sm">
                <span className="text-slate-600">Funcionário (opcional)</span>
                <select
                  className="input mt-1"
                  value={blockForm.staffId}
                  onChange={(e) => setBlockForm({ ...blockForm, staffId: e.target.value })}
                >
                  <option value="">Toda a empresa</option>
                  {activeStaff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="btn btn-secondary text-sm" disabled={saving} onClick={saveBlock}>
              Adicionar bloqueio
            </button>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-800 flex items-center gap-1">
              <CalendarOff className="w-4 h-4" />
              Férias / dia fechado
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-slate-600">De</span>
                <input
                  type="date"
                  className="input mt-1"
                  value={vacationForm.fromDate}
                  onChange={(e) => setVacationForm({ ...vacationForm, fromDate: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Até</span>
                <input
                  type="date"
                  className="input mt-1"
                  value={vacationForm.toDate}
                  onChange={(e) => setVacationForm({ ...vacationForm, toDate: e.target.value })}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-slate-600">Motivo</span>
              <input
                className="input mt-1"
                value={vacationForm.reason}
                onChange={(e) => setVacationForm({ ...vacationForm, reason: e.target.value })}
                placeholder="Ex: Férias coletivas"
              />
            </label>
            <button type="button" className="btn btn-secondary text-sm" disabled={saving} onClick={saveVacation}>
              Registrar fechamento
            </button>
          </div>
        </div>

        {(settings.blocks?.length > 0 || settings.exceptions?.length > 0) && (
          <div className="mt-6 space-y-4">
            {settings.exceptions?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Dias fechados</h4>
                <ul className="space-y-1">
                  {settings.exceptions.slice(0, 20).map((e) => (
                    <li key={e.id} className="flex items-center justify-between text-sm py-1">
                      <span>
                        {e.dateLocal}
                        {e.reason ? ` — ${e.reason}` : ''}
                      </span>
                      <button
                        type="button"
                        className="text-red-600 text-xs hover:underline"
                        onClick={async () => {
                          await api.delete(`/api/bookings/exceptions/${e.id}`);
                          await load();
                        }}
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {settings.blocks?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Bloqueios</h4>
                <ul className="space-y-1">
                  {settings.blocks.slice(0, 20).map((b) => (
                    <li key={b.id} className="flex items-center justify-between text-sm py-1">
                      <span>
                        {new Date(b.startsAt).toLocaleString('pt-BR')}
                        {' → '}
                        {new Date(b.endsAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {b.reason ? ` — ${b.reason}` : ''}
                      </span>
                      <button
                        type="button"
                        className="text-red-600 text-xs hover:underline"
                        onClick={async () => {
                          await api.delete(`/api/bookings/blocks/${b.id}`);
                          await load();
                        }}
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Funcionários */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-600" />
              Funcionários
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Cadastre quem atende. Com mais de um, o sistema libera horário se alguém estiver disponível.
            </p>
          </div>
          {!staffForm && (
            <button type="button" className="btn btn-secondary text-sm" onClick={() => setStaffForm({ name: '', email: '' })}>
              <Plus className="w-4 h-4" />
              Novo funcionário
            </button>
          )}
        </div>

        {staffForm && (
          <div className="mb-4 p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-slate-600">Nome</span>
                <input
                  className="input mt-1"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">E-mail (opcional)</span>
                <input
                  type="email"
                  className="input mt-1"
                  value={staffForm.email || ''}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary text-sm" disabled={saving} onClick={saveStaff}>
                Salvar
              </button>
              <button type="button" className="btn btn-secondary text-sm" onClick={() => setStaffForm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-slate-100">
          {activeStaff.length === 0 ? (
            <li className="py-4 text-sm text-slate-500">Nenhum funcionário cadastrado — um único calendário para a empresa.</li>
          ) : (
            activeStaff.map((s) => (
              <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{s.name}</p>
                  {s.email && <p className="text-xs text-slate-500">{s.email}</p>}
                </div>
                <div className="flex gap-1">
                  <button type="button" className="btn btn-secondary text-xs" onClick={() => setStaffForm({ ...s })}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-secondary text-xs text-red-600" onClick={() => removeStaff(s.id, s.name)}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
