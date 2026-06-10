import React from 'react';

const DAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

export default function BookingHoursEditor({ value, onChange }) {
  const hours = value || {};

  const updateDay = (key, patch) => {
    onChange({
      ...hours,
      [key]: { ...hours[key], ...patch },
    });
  };

  return (
    <div className="space-y-3">
      {DAYS.map(({ key, label }) => {
        const day = hours[key] || {
          closed: false,
          open: '08:00',
          close: '18:00',
          hasBreak: false,
          breakStart: '12:00',
          breakEnd: '13:00',
        };
        return (
          <div key={key} className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-20 shrink-0 font-medium text-slate-700">{label}</span>
              <label className="flex items-center gap-1.5 text-slate-600">
                <input
                  type="checkbox"
                  checked={!!day.closed}
                  onChange={(e) => updateDay(key, { closed: e.target.checked })}
                  className="rounded border-slate-300 text-brand-600"
                />
                Fechado
              </label>
            </div>
            {!day.closed && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm pl-0 sm:pl-20">
                  <input
                    type="time"
                    className="input !py-1 !px-2 !w-auto text-sm"
                    value={day.open || '08:00'}
                    onChange={(e) => updateDay(key, { open: e.target.value })}
                  />
                  <span className="text-slate-400">até</span>
                  <input
                    type="time"
                    className="input !py-1 !px-2 !w-auto text-sm"
                    value={day.close || '18:00'}
                    onChange={(e) => updateDay(key, { close: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm pl-0 sm:pl-20">
                  <label className="flex items-center gap-1.5 text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!day.hasBreak}
                      onChange={(e) => updateDay(key, { hasBreak: e.target.checked })}
                      className="rounded border-slate-300 text-brand-600"
                    />
                    Intervalo (ex: almoço)
                  </label>
                  {day.hasBreak && (
                    <>
                      <input
                        type="time"
                        className="input !py-1 !px-2 !w-auto text-sm"
                        value={day.breakStart || '12:00'}
                        onChange={(e) => updateDay(key, { breakStart: e.target.value })}
                      />
                      <span className="text-slate-400">até</span>
                      <input
                        type="time"
                        className="input !py-1 !px-2 !w-auto text-sm"
                        value={day.breakEnd || '13:00'}
                        onChange={(e) => updateDay(key, { breakEnd: e.target.value })}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
