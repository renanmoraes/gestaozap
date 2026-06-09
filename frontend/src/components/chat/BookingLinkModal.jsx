import React, { useEffect, useState } from 'react';
import api from '../../api';
import { Calendar, X } from 'lucide-react';

export default function BookingLinkModal({ open, onClose, onConfirm, contactName }) {
  const [mode, setMode] = useState('generic');
  const [date, setDate] = useState('');
  const [month, setMonth] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('generic');
    setDate('');
    setMonth('');
    setMessage('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const params = {};
    if (mode === 'date' && date) params.date = date;
    if (mode === 'month' && month) params.month = month;
    setLoading(true);
    api.get('/api/bookings/share-link', { params })
      .then((r) => setMessage(r.data.message))
      .catch(() => setMessage(''))
      .finally(() => setLoading(false));
  }, [open, mode, date, month]);

  if (!open) return null;

  const canConfirm = message.trim().length > 0 && (mode !== 'date' || date) && (mode !== 'month' || month);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Enviar link de agendamento</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {contactName && (
          <p className="text-sm text-slate-600 mb-3">Para: <strong>{contactName}</strong></p>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { id: 'generic', label: 'Link geral' },
            { id: 'date', label: 'Data sugerida' },
            { id: 'month', label: 'Mês' },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                mode === id ? 'bg-brand-50 border-brand-200 text-brand-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'date' && (
          <input type="date" className="input w-full mb-3" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
        {mode === 'month' && (
          <input type="month" className="input w-full mb-3" value={month} onChange={(e) => setMonth(e.target.value)} />
        )}

        <label className="block text-xs font-medium text-slate-600 mb-1">Mensagem</label>
        <textarea
          className="input w-full min-h-[100px] mb-4 text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
        />

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn btn-secondary text-sm">Cancelar</button>
          <button
            type="button"
            disabled={!canConfirm || loading}
            onClick={() => onConfirm(message.trim())}
            className="btn btn-primary text-sm"
          >
            Enviar no WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
