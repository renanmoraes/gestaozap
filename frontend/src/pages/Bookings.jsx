import React, { useEffect, useState } from 'react';
import { Calendar, ExternalLink, Loader2 } from 'lucide-react';
import api from '../api';
import { useTenant } from '../context/TenantContext';

function bookingPublicUrl(slug) {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.origin}/app/agendar`;
  }
  return `https://${slug}.gestaozap.digital/agendar`;
}

export default function Bookings() {
  const { tenant, hasFeature } = useTenant();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    if (!hasFeature('agendamentos')) {
      setLoading(false);
      return;
    }
    api.get('/api/bookings', { params: { from: new Date().toISOString() } })
      .then((r) => setBookings(r.data || []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [hasFeature]);

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
    <div className="page-content p-6 max-w-3xl">
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

      {loading ? (
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      ) : bookings.length === 0 ? (
        <div className="card p-8 text-center text-slate-500 text-sm">
          Nenhum agendamento futuro. Compartilhe o link pelo WhatsApp com <strong>/agendar</strong>.
        </div>
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li key={b.id} className="card p-4 flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{b.inviteeName}</p>
                <p className="text-xs text-slate-500">{b.inviteeEmail}</p>
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
