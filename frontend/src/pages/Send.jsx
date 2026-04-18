import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import api from '../api';

export default function Send() {
  const [campaigns, setCampaigns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [tagFilter, setTagFilter] = useState('');
  const [progress, setProgress] = useState(null);
  const [alert, setAlert] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get('/api/campaigns').then(r => setCampaigns(r.data));
    api.get('/api/contacts').then(r => setContacts(r.data));
  }, []);

  useEffect(() => {
    api.get('/api/contacts', { params: tagFilter ? { tag: tagFilter } : {} }).then(r => setContacts(r.data));
  }, [tagFilter]);

  useSocket({
    'send:progress': (data) => setProgress(data),
    'send:done': (data) => { setProgress(data); setSending(false); },
    'send:alert': ({ message }) => setAlert(message),
    'send:batch_pause': ({ sentCount }) => setAlert(`Pausa entre batches após ${sentCount} envios (10 min)`),
    'send:paused': () => setAlert('Fora do horário permitido — aguardando...'),
  });

  const toggleContact = (id) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedContacts(
    contacts.length === selectedContacts.size ? new Set() : new Set(contacts.map(c => c._id))
  );

  const send = async () => {
    if (!selectedCampaign || selectedContacts.size === 0) {
      alert('Selecione campanha e contatos');
      return;
    }
    setSending(true);
    setAlert(null);
    setProgress(null);
    await api.post('/api/send', {
      campaignId: selectedCampaign,
      contactIds: [...selectedContacts],
    });
  };

  const pct = progress ? Math.round((progress.sentCount / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Disparo</h1>

      <div className="space-y-2">
        <label className="font-medium">Campanha</label>
        <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="w-full border rounded px-3 py-2">
          <option value="">Selecione uma campanha...</option>
          {campaigns.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="font-medium">Contatos ({selectedContacts.size} selecionados)</label>
          <button onClick={selectAll} className="text-sm text-blue-600 underline">
            {selectedContacts.size === contacts.length ? 'Dessel. todos' : 'Sel. todos'}
          </button>
        </div>
        <input placeholder="Filtrar por tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="border rounded px-3 py-2 text-sm w-full" />
        <ul className="border rounded divide-y max-h-64 overflow-y-auto">
          {contacts.map(c => (
            <li key={c._id} className="flex items-center gap-3 px-4 py-2">
              <input type="checkbox" checked={selectedContacts.has(c._id)} onChange={() => toggleContact(c._id)} />
              <span>{c.name} <span className="text-gray-500 text-sm">({c.phone})</span></span>
            </li>
          ))}
        </ul>
      </div>

      {alert && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded">
          ⚠️ {alert}
        </div>
      )}

      {progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Enviados: {progress.sentCount} / {progress.total}</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <button
        onClick={send}
        disabled={sending || !selectedCampaign || selectedContacts.size === 0}
        className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? 'Enviando...' : `Disparar para ${selectedContacts.size} contatos`}
      </button>
    </div>
  );
}
