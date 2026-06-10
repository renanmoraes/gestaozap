import React, { useEffect, useState } from 'react';
import { Calendar, ExternalLink, Loader2, List, Settings2 } from 'lucide-react';
import api from '../api';
import { useTenant } from '../context/TenantContext';
import { dialog } from '../utils/dialog';
import BookingsSettings from '../components/bookings/BookingsSettings';

function bookingPublicUrl(slug) {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.origin}/app/agendar`;
  }
  return `https://${slug}.gestaozap.digital/agendar`;
}

const TABS = [
  { id: 'list', label: 'Agenda', icon: List },
  { id: 'settings', label: 'Configurações', icon: Settings2 },
];

export default function Bookings() {
  const { tenant, hasFeature } = useTenant();
  const [tab, setTab] = useState('list');
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);

  const loadBookings = () => {
    if (!hasFeature('agendamentos')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.get('/api/bookings', { params: { from: new Date().toISOString() } })
      .then((r) => setBookings(r.data || []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBookings();
  }, [hasFeature]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('tab') === 'settings') setTab('settings');
    if (q.get('google') === 'connected') {
      dialog.toast.success('Google Calendar conectado com sucesso');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (!hasFeature('agendamentos')) {
    return (
      <div className="page-content p-6">
        <p className="text-slate-600">Agendamentos não disponível para esta conta.</p>
      </div>
    );
  }

  const slug = tenant?.slug || tenant?.tenantSlug;
  const publicUrl = slug ? bookingPublicUrl(slug) : null;

  return (
    <div className="page-content p-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-brand-600" />
            Agendamentos
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            No chat use <code className="text-xs bg-slate-100 px-1 rounded">/agendar</code> para enviar o link ao cliente.
          </p>
        </div>
        {publicUrl && (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm inline-flex items-center gap-1.5">
            <ExternalLink className="w-4 h-4" />
            Página pública
          </a>
        )}
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <BookingsSettings onReload={loadBookings} />
      ) : loading ? (
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      ) : bookings.length === 0 ? (
        <div className="card p-8 text-center text-slate-500 text-sm">
          Nenhum agendamento futuro. Compartilhe o link pelo WhatsApp com <strong>/agendar</strong> ou configure tipos e horários na aba <strong>Configurações</strong>.
        </div>
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li key={b.id} className="card p-4 flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{b.inviteeName}</p>
                <p className="text-xs text-slate-500">{b.inviteeEmail}</p>
                {b.inviteePhone && (
                  <p className="text-xs text-slate-500">WhatsApp: {b.inviteePhone}</p>
                )}
                {(b.consentWhatsapp || b.consentEmail) && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {b.consentEmail ? 'E-mail ✓' : ''}{b.consentEmail && b.consentWhatsapp ? ' · ' : ''}{b.consentWhatsapp ? 'WhatsApp ✓' : ''}
                  </p>
                )}
                {b.staffName && (
                  <p className="text-xs text-brand-700 mt-0.5">Com {b.staffName}</p>
                )}
              </div>
              <p className="text-sm text-slate-700">
                {new Date(b.startsAt).toLocaleString('pt-BR')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
