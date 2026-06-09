import React, { useEffect, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useSocket } from '../../hooks/useSocket';
import { dialog } from '../../utils/dialog';

export default function BookingAlerts() {
  const { hasFeature, tenant } = useTenant();
  const [alerts, setAlerts] = useState([]);

  useSocket({
    'booking:upcoming': (payload) => {
      setAlerts((prev) => {
        if (prev.some((a) => a.bookingId === payload.bookingId)) return prev;
        return [payload, ...prev].slice(0, 5);
      });
      dialog.toast.info(
        `Agendamento em ${payload.minutesUntil} min: ${payload.inviteeName}`,
      );
    },
  }, tenant?.tenantId);

  useEffect(() => {
    if (!hasFeature('agendamentos')) return;
    const t = setInterval(() => {
      setAlerts((prev) => prev.filter((a) => new Date(a.startsAt) > new Date()));
    }, 60000);
    return () => clearInterval(t);
  }, [hasFeature]);

  if (!hasFeature('agendamentos') || !alerts.length) return null;

  return (
    <div className="fixed top-16 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] space-y-2">
      {alerts.map((a) => (
        <div
          key={a.bookingId}
          className="bg-white border border-brand-200 shadow-lg rounded-xl p-3 flex gap-2"
        >
          <CalendarClock className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{a.inviteeName}</p>
            <p className="text-xs text-slate-600">
              Em {a.minutesUntil} min · {new Date(a.startsAt).toLocaleString('pt-BR')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAlerts((prev) => prev.filter((x) => x.bookingId !== a.bookingId))}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
