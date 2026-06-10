import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronLeft, ChevronRight, Clock, ExternalLink, Loader2, MapPin,
} from 'lucide-react';
import { resolveCampaignImageUrl } from '../../utils/upload';
import './agendar.css';

const REDIRECT_URL = 'https://gestaozap.digital';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

function parseQuery() {
  const q = new URLSearchParams(window.location.search);
  return {
    eventTypeId: q.get('tipo') || q.get('eventTypeId') || '',
    date: q.get('date') || '',
    month: q.get('month') || '',
  };
}

function formatPrice(value) {
  if (value == null || value === '') return null;
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function mondayOffsetFirstWeek(date) {
  return (date.getDay() + 6) % 7;
}

function buildMonthGrid(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = endOfMonth(first).getDate();
  const offset = mondayOffsetFirstWeek(first);
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  return cells;
}

function formatAddress(addr) {
  if (!addr) return null;
  const parts = [addr.line1, addr.neighborhood, addr.city, addr.state].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function availabilityBadge(profile) {
  if (!profile) return null;
  if (profile.availabilityStatus === 'closed_today') {
    return { text: 'Fechado hoje', tone: 'closed' };
  }
  if (profile.availabilityStatus === 'delivery_only') {
    return { text: 'Delivery / remoto', tone: 'delivery' };
  }
  if (profile.isOpenNow === true) {
    return { text: 'Aberto agora', tone: 'open' };
  }
  if (profile.isOpenNow === false && profile.availabilityStatus === 'open') {
    return { text: 'Fechado no momento', tone: 'closed' };
  }
  if (profile.availabilityStatus === 'custom' && profile.availabilityNote) {
    return { text: profile.availabilityNote, tone: 'custom' };
  }
  return null;
}

function normalizeExternalUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  return raw.startsWith('http') ? raw : `https://${raw}`;
}

function formatSlotTime(iso, timeZone) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatFullDateTime(iso, timeZone) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function staffInitials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

async function fetchPage() {
  const res = await fetch('/api/public/bookings/page', {
    credentials: 'include',
    redirect: 'manual',
  });
  if (res.status === 302 || res.type === 'opaqueredirect') {
    window.location.replace(REDIRECT_URL);
    return null;
  }
  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    if (data.inactive) {
      window.location.replace(REDIRECT_URL);
      return null;
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível carregar agendamentos');
  }
  return res.json();
}

async function fetchSlots({ eventTypeId, dateKey, staffId, timeZone }) {
  const params = new URLSearchParams({
    eventTypeId,
    from: dateKey,
    to: dateKey,
    tz: timeZone,
  });
  if (staffId) params.set('staffId', staffId);
  const res = await fetch(`/api/public/bookings/availability?${params}`, {
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro ao carregar horários');
  const day = data.days?.find((d) => d.date === dateKey);
  return day?.slots || [];
}

async function createBooking(body) {
  const res = await fetch('/api/public/bookings', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, inviteeTimezone: TZ }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível confirmar');
  return data;
}

function BookingHeader({ page, profile, tenantName }) {
  const logoSrc = profile?.logoUrl ? resolveCampaignImageUrl(profile.logoUrl) : null;
  const title = page?.title || profile?.name || tenantName || 'Agendamento';
  const address = formatAddress(profile?.address);
  const badge = availabilityBadge(profile);
  const instagram = normalizeExternalUrl(profile?.instagramUrl);

  return (
    <header className="agendar-header">
      {logoSrc && (
        <div className="agendar-logo-wrap">
          <img src={logoSrc} alt="" className="agendar-logo" />
        </div>
      )}
      <h1>{title}</h1>
      {profile?.tagline && <p className="agendar-tagline">{profile.tagline}</p>}
      {page?.description && <p className="agendar-desc">{page.description}</p>}

      {(badge || profile?.todayHoursLabel) && (
        <div className="agendar-meta">
          {badge && (
            <span className={`agendar-badge agendar-badge--${badge.tone}`}>
              {badge.text}
            </span>
          )}
          {profile?.todayHoursLabel && (
            <span className="agendar-hours">{profile.todayHoursLabel}</span>
          )}
        </div>
      )}

      {profile?.availabilityNote && profile.availabilityStatus !== 'custom' && (
        <p className="agendar-note">{profile.availabilityNote}</p>
      )}

      {(address || instagram) && (
        <div className="agendar-contact">
          {address && (
            <span className="agendar-address">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {address}
            </span>
          )}
          {instagram && (
            <a
              href={instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="agendar-social"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Instagram
            </a>
          )}
        </div>
      )}
    </header>
  );
}

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function DateCalendar({
  viewMonth,
  onViewMonthChange,
  selectedDate,
  onSelectDate,
  maxAdvanceDays,
}) {
  const today = startOfToday();
  const maxDate = addDays(today, maxAdvanceDays || 60);
  const minMonth = startOfMonth(today);
  const maxMonth = startOfMonth(maxDate);
  const currentMonth = startOfMonth(viewMonth);

  const canPrev = currentMonth > minMonth;
  const canNext = currentMonth < maxMonth;

  const monthLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(viewMonth);

  const cells = buildMonthGrid(viewMonth);

  const goPrev = () => {
    if (!canPrev) return;
    onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  };

  const goNext = () => {
    if (!canNext) return;
    onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  };

  const isSelectable = (d) => {
    const t = d.getTime();
    const min = today.getTime();
    const max = maxDate.getTime();
    return t >= min && t <= max;
  };

  return (
    <div className="agendar-calendar">
      <div className="agendar-calendar-nav">
        <button
          type="button"
          className="agendar-calendar-arrow"
          onClick={goPrev}
          disabled={!canPrev}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="agendar-calendar-month">{monthLabel}</span>
        <button
          type="button"
          className="agendar-calendar-arrow"
          onClick={goNext}
          disabled={!canNext}
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="agendar-calendar-weekdays" aria-hidden>
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="agendar-calendar-grid" role="grid" aria-label="Calendário">
        {cells.map((d, i) => {
          if (!d) {
            return <span key={`empty-${i}`} className="agendar-cal-cell is-empty" />;
          }
          const selectable = isSelectable(d);
          const isSelected = selectedDate && toDateKey(selectedDate) === toDateKey(d);
          const isToday = toDateKey(d) === toDateKey(today);
          return (
            <button
              key={toDateKey(d)}
              type="button"
              role="gridcell"
              disabled={!selectable}
              aria-selected={isSelected}
              aria-label={new Intl.DateTimeFormat('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(d)}
              className={`agendar-cal-cell${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${!selectable ? ' is-disabled' : ''}`}
              onClick={() => onSelectDate(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <p className="agendar-calendar-hint">
        Agende com até {maxAdvanceDays || 60} dias de antecedência
      </p>
    </div>
  );
}

function ProgressBar({ step, total }) {
  return (
    <div className="agendar-progress" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={i < step ? 'is-done' : i === step ? 'is-active' : ''}
        />
      ))}
    </div>
  );
}

export default function BookingPublic() {
  const query = useMemo(() => parseQuery(), []);
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [step, setStep] = useState('service');
  const [eventType, setEventType] = useState(null);
  const [staff, setStaff] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(startOfToday()));
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consentEmail, setConsentEmail] = useState(true);
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);

  const privacyUrl = 'https://gestaozap.digital/privacidade';

  const timeZone = pageData?.page?.timezone || 'America/Sao_Paulo';
  const eventTypes = pageData?.eventTypes || [];
  const allStaff = pageData?.staff || [];

  const staffForType = useMemo(() => {
    if (!eventType?.staffIds?.length) return [];
    return allStaff.filter((s) => eventType.staffIds.includes(s.id));
  }, [eventType, allStaff]);

  const needsStaffPick = staffForType.length > 1;

  const steps = useMemo(() => {
    const s = [];
    if (eventTypes.length > 1) s.push('service');
    if (needsStaffPick) s.push('staff');
    s.push('datetime', 'form', 'done');
    return s;
  }, [eventTypes.length, needsStaffPick]);

  const stepIndex = confirmed ? steps.length - 1 : Math.max(0, steps.indexOf(step));

  const maxAdvanceDays = eventType?.maxAdvanceDays ?? 60;

  useEffect(() => {
    fetchPage()
      .then((json) => {
        if (!json) return;
        setPageData(json);

        const types = json.eventTypes || [];
        let initial = types.find((t) => t.id === query.eventTypeId) || types[0] || null;
        if (types.length === 1) initial = types[0];

        if (initial) {
          setEventType(initial);
          const linked = (json.staff || []).filter((s) => (initial.staffIds || []).includes(s.id));
          if (linked.length === 1) setStaff(linked[0]);

          const skipService = types.length === 1 || Boolean(query.eventTypeId && types.some((t) => t.id === query.eventTypeId));
          if (linked.length > 1) {
            setStep(skipService ? 'staff' : 'service');
          } else if (skipService) {
            setStep('datetime');
          } else {
            setStep('service');
          }
        }

        const initialDate = (() => {
          if (query.date) {
            const d = parseDateKey(query.date);
            if (d && d >= startOfToday()) return d;
          }
          if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
            const [y, m] = query.month.split('-').map(Number);
            const first = new Date(y, m - 1, 1);
            if (first >= startOfToday()) return first;
          }
          return startOfToday();
        })();
        setSelectedDate(initialDate);
        setViewMonth(startOfMonth(initialDate));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!eventType || !selectedDate || step !== 'datetime') return;
    if (needsStaffPick && !staff) return;

    const dateKey = toDateKey(selectedDate);
    setSlotsLoading(true);
    setSelectedSlot(null);
    fetchSlots({
      eventTypeId: eventType.id,
      dateKey,
      staffId: staff?.id,
      timeZone,
    })
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [eventType, selectedDate, staff, step, needsStaffPick, timeZone]);

  const goBack = useCallback(() => {
    if (step === 'form') {
      setStep('datetime');
      return;
    }
    if (step === 'datetime') {
      if (needsStaffPick) setStep('staff');
      else if (eventTypes.length > 1) setStep('service');
      return;
    }
    if (step === 'staff') setStep(eventTypes.length > 1 ? 'service' : 'staff');
  }, [step, needsStaffPick, eventTypes.length]);

  const pickService = (t) => {
    setEventType(t);
    setStaff(null);
    setSelectedSlot(null);
    setViewMonth(startOfMonth(startOfToday()));
    const linked = allStaff.filter((s) => (t.staffIds || []).includes(s.id));
    if (linked.length === 1) {
      setStaff(linked[0]);
      setStep('datetime');
    } else if (linked.length > 1) {
      setStep('staff');
    } else {
      setStep('datetime');
    }
  };

  const pickStaff = (s) => {
    setStaff(s);
    setSelectedSlot(null);
    setStep('datetime');
  };

  const pickSlot = (slot) => {
    setSelectedSlot(slot);
    setStep('form');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!eventType || !selectedSlot) return;
    if (consentWhatsapp && !phone.trim()) {
      setError('Informe seu WhatsApp para receber lembretes');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createBooking({
        eventTypeId: eventType.id,
        startsAt: selectedSlot,
        inviteeName: name.trim(),
        inviteeEmail: email.trim(),
        inviteePhone: phone.trim() || null,
        staffId: staff?.id || null,
        consentEmail,
        consentWhatsapp,
      });
      setConfirmed({
        ...result,
        eventName: eventType.name,
        formatted: formatFullDateTime(selectedSlot, timeZone),
        consentEmail,
        consentWhatsapp,
      });
      setStep('done');
    } catch (err) {
      setError(err.message);
      if (err.message.includes('reservado')) {
        setStep('datetime');
        setSelectedSlot(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="agendar-page agendar-loading">
        <div className="agendar-spinner" role="status" aria-label="Carregando" />
      </div>
    );
  }

  if (error && !pageData) {
    return (
      <div className="agendar-page">
        <div className="agendar-shell agendar-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!eventTypes.length) {
    return (
      <div className="agendar-page">
        <div className="agendar-shell">
          <BookingHeader page={pageData?.page} profile={pageData?.profile} tenantName={pageData?.profile?.name} />
          <div className="agendar-card agendar-empty-slots">
            Agendamentos indisponíveis no momento.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agendar-page">
      <div className="agendar-shell">
        <BookingHeader
          page={pageData.page}
          profile={pageData.profile}
          tenantName={pageData?.profile?.name || pageData?.page?.title}
        />

        {!confirmed && <ProgressBar step={stepIndex} total={steps.length - 1} />}

        {error && pageData && (
          <div className="agendar-card" style={{ marginBottom: '0.75rem', borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '0.875rem' }}>
            {error}
            <button type="button" className="agendar-back" style={{ marginTop: '0.5rem' }} onClick={() => setError(null)}>
              Fechar
            </button>
          </div>
        )}

        {step === 'service' && (
          <div className="agendar-card">
            <h2>O que você precisa?</h2>
            <p className="agendar-lead">Escolha o tipo de atendimento</p>
            <div className="agendar-service-list">
              {eventTypes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`agendar-service-btn${eventType?.id === t.id ? ' is-selected' : ''}`}
                  onClick={() => pickService(t)}
                >
                  <div>
                    <strong>{t.name}</strong>
                    <small>{t.durationMin} min</small>
                  </div>
                  <div className="agendar-service-meta">
                    {t.priceBrl ? (
                      <span className="agendar-price">{formatPrice(t.priceBrl)}</span>
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400 inline" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'staff' && (
          <div className="agendar-card">
            <button type="button" className="agendar-back" onClick={goBack}>
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <h2>Com quem?</h2>
            <p className="agendar-lead">Escolha o profissional para {eventType?.name}</p>
            <div className="agendar-staff-grid">
              {staffForType.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`agendar-staff-btn${staff?.id === s.id ? ' is-selected' : ''}`}
                  onClick={() => pickStaff(s)}
                >
                  <div className="agendar-staff-avatar">{staffInitials(s.name)}</div>
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'datetime' && (
          <div className="agendar-card">
            {(eventTypes.length > 1 || needsStaffPick) && (
              <button type="button" className="agendar-back" onClick={goBack}>
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            )}
            <h2>Escolha data e horário</h2>
            <p className="agendar-lead">
              {eventType?.name}
              {staff ? ` · ${staff.name}` : ''}
            </p>

            <div className="agendar-dates">
              <DateCalendar
                viewMonth={viewMonth}
                onViewMonthChange={setViewMonth}
                selectedDate={selectedDate}
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  setSelectedSlot(null);
                }}
                maxAdvanceDays={maxAdvanceDays}
              />
            </div>

            <p className="agendar-slots-label">Horários disponíveis</p>
            {slotsLoading ? (
              <div className="agendar-empty-slots">
                <Loader2 className="w-6 h-6 animate-spin inline text-emerald-600" />
              </div>
            ) : slots.length === 0 ? (
              <div className="agendar-empty-slots">
                Nenhum horário neste dia. Tente outra data.
              </div>
            ) : (
              <div className="agendar-slots">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`agendar-slot-btn${selectedSlot === slot ? ' is-selected' : ''}`}
                    onClick={() => pickSlot(slot)}
                  >
                    {formatSlotTime(slot, timeZone)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'form' && (
          <div className="agendar-card">
            <button type="button" className="agendar-back" onClick={goBack}>
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <h2>Seus dados</h2>
            <p className="agendar-lead">Quase lá — confirme para reservar</p>

            <div className="agendar-summary">
              <strong>{eventType?.name}</strong>
              {formatFullDateTime(selectedSlot, timeZone)}
              {staff && <span> · {staff.name}</span>}
              {eventType?.priceBrl && (
                <div style={{ marginTop: '0.35rem', fontWeight: 700, color: 'var(--ag-brand-dark)' }}>
                  {formatPrice(eventType.priceBrl)}
                </div>
              )}
            </div>

            <form onSubmit={submit}>
              <label className="agendar-field">
                <span>Nome completo</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                />
              </label>
              <label className="agendar-field">
                <span>E-mail</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                />
              </label>
              <label className="agendar-field">
                <span>WhatsApp (com DDD)</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="31999999999"
                  required={consentWhatsapp}
                />
              </label>

              <div className="agendar-consent-box">
                <label className="agendar-consent">
                  <input
                    type="checkbox"
                    checked={consentEmail}
                    onChange={(e) => setConsentEmail(e.target.checked)}
                  />
                  <span>
                    Quero receber <strong>confirmação e lembretes por e-mail</strong> sobre este agendamento.
                  </span>
                </label>
                <label className="agendar-consent">
                  <input
                    type="checkbox"
                    checked={consentWhatsapp}
                    onChange={(e) => setConsentWhatsapp(e.target.checked)}
                  />
                  <span>
                    Autorizo receber <strong>lembretes por WhatsApp</strong> no número informado,
                    conforme a{' '}
                    <a href={privacyUrl} target="_blank" rel="noreferrer">Política de Privacidade</a>.
                  </span>
                </label>
              </div>

              <button type="submit" className="agendar-submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Confirmando…
                  </>
                ) : (
                  'Confirmar agendamento'
                )}
              </button>
            </form>
          </div>
        )}

        {(step === 'done' || confirmed) && (
          <div className="agendar-card agendar-success">
            <div className="agendar-success-icon">
              <Check className="w-8 h-8" strokeWidth={2.5} />
            </div>
            <h2>Agendamento confirmado!</h2>
            <p><strong>{confirmed?.eventName}</strong></p>
            <p>{confirmed?.formatted}</p>
            {confirmed?.staffName && (
              <p>Com {confirmed.staffName}</p>
            )}
            <p style={{ marginTop: '1rem', fontSize: '0.8125rem' }}>
              {confirmed?.consentEmail && confirmed?.consentWhatsapp
                ? 'Enviamos confirmação por e-mail e WhatsApp (conforme autorizado).'
                : confirmed?.consentWhatsapp
                  ? 'Enviamos confirmação por WhatsApp (conforme autorizado).'
                  : confirmed?.consentEmail
                    ? 'Enviamos confirmação por e-mail (conforme autorizado).'
                    : 'Seu agendamento está registrado.'}
            </p>
          </div>
        )}

        <footer className="agendar-footer">
          Agendamento via <a href="https://gestaozap.digital" target="_blank" rel="noreferrer">GestãoZap</a>
        </footer>
      </div>
    </div>
  );
}
