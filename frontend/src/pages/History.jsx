import React, { useState, useEffect } from 'react';
import api from '../api';

export default function History() {
  const [campaigns, setCampaigns] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [logs, setLogs] = useState({});

  useEffect(() => {
    api.get('/api/campaigns').then(r => setCampaigns(r.data));
  }, []);

  const loadLogs = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!logs[id]) {
      const res = await api.get(`/api/logs/${id}`);
      setLogs(prev => ({ ...prev, [id]: res.data }));
    }
  };

  const retryFailed = async (id) => {
    await api.post(`/api/logs/${id}/retry-failed`);
    const res = await api.get(`/api/logs/${id}`);
    setLogs(prev => ({ ...prev, [id]: res.data }));
  };

  const getMetrics = (campaignLogs) => ({
    sent: campaignLogs.filter(l => l.status === 'sent').length,
    failed: campaignLogs.filter(l => l.status === 'failed').length,
    pending: campaignLogs.filter(l => l.status === 'pending').length,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Histórico</h1>
      <ul className="space-y-3">
        {campaigns.map(c => {
          const campaignLogs = logs[c._id] || [];
          const metrics = getMetrics(campaignLogs);
          return (
            <li key={c._id} className="border rounded overflow-hidden">
              <button onClick={() => loadLogs(c._id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-gray-500">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                {campaignLogs.length > 0 && (
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600">✓ {metrics.sent}</span>
                    <span className="text-red-500">✗ {metrics.failed}</span>
                    <span className="text-gray-400">⏳ {metrics.pending}</span>
                  </div>
                )}
                <span className="text-gray-400">{expanded === c._id ? '▲' : '▼'}</span>
              </button>

              {expanded === c._id && (
                <div className="border-t px-4 py-3 space-y-3">
                  {metrics.failed > 0 && (
                    <button onClick={() => retryFailed(c._id)} className="text-sm bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600">
                      Reenviar {metrics.failed} falhos
                    </button>
                  )}
                  <ul className="divide-y text-sm max-h-64 overflow-y-auto">
                    {campaignLogs.map(l => (
                      <li key={l._id} className="flex justify-between py-2">
                        <span>{l.name} <span className="text-gray-400">({l.phone})</span></span>
                        <span className={l.status === 'sent' ? 'text-green-600' : l.status === 'failed' ? 'text-red-500' : 'text-gray-400'}>
                          {l.status === 'sent' ? '✓ Enviado' : l.status === 'failed' ? `✗ Falhou${l.error ? ': ' + l.error : ''}` : '⏳ Pendente'}
                        </span>
                      </li>
                    ))}
                    {campaignLogs.length === 0 && <li className="py-4 text-center text-gray-400">Sem registros de envio</li>}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
        {campaigns.length === 0 && <li className="text-center py-8 text-gray-400">Nenhuma campanha criada</li>}
      </ul>
    </div>
  );
}
