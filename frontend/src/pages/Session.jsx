import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import api from '../api';

export default function Session() {
  const [status, setStatus] = useState('loading');
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/session').then(r => setStatus(r.data.status));
  }, []);

  useSocket({
    qr: ({ qr: qrData }) => { setQr(qrData); setStatus('qr_ready'); setError(null); },
    'session:ready': () => { setStatus('connected'); setQr(null); setError(null); },
    'session:disconnected': () => { setStatus('disconnected'); setQr(null); },
    'session:status': ({ status: s }) => setStatus(s),
    'session:error': ({ message }) => { setStatus('disconnected'); setError(message); },
  });

  const start = async () => {
    await api.post('/api/session/start');
    setStatus('starting');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sessão WhatsApp</h1>
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'qr_ready' ? 'bg-yellow-400' : 'bg-red-400'}`} />
        <span className="capitalize">
          {status === 'connected' ? 'Conectado' : status === 'qr_ready' ? 'Aguardando QR Code' : status === 'starting' ? 'Iniciando...' : 'Desconectado'}
        </span>
      </div>

      {status === 'disconnected' && (
        <button onClick={start} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Conectar WhatsApp
        </button>
      )}

      {qr && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Escaneie o QR Code com seu WhatsApp</p>
          <img src={qr} alt="QR Code" className="w-64 h-64 border rounded" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded text-sm">
          Erro ao iniciar: {error}
        </div>
      )}

      {status === 'connected' && (
        <p className="text-green-700 font-medium">✓ WhatsApp conectado e pronto para envios</p>
      )}
    </div>
  );
}
