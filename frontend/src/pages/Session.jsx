import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Loader2, RefreshCw, Send, CheckCircle2, AlertCircle, QrCode, PhoneOff } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import { useTenant } from '../context/TenantContext';
import api from '../api';
import UpsellBanner from '../components/UpsellBanner';

function StatusBadge({ status }) {
  if (status === 'connected') return (
    <span className="badge-green"><span className="dot bg-emerald-500" />Conectado</span>
  );
  if (status === 'qr_ready') return (
    <span className="badge-yellow"><span className="dot bg-amber-500" />Aguardando QR</span>
  );
  if (status === 'starting') return (
    <span className="badge-blue"><span className="dot bg-blue-500 animate-pulse" />Iniciando…</span>
  );
  return <span className="badge-red"><span className="dot bg-red-500" />Desconectado</span>;
}

export default function Session() {
  const { wrongPhone } = useTenant();
  const [status, setStatus] = useState('loading');
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);
  const [countryCode, setCountryCode] = useState('55');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [testFeedback, setTestFeedback] = useState(null);

  // Busca o status real no backend. É a fonte da verdade: usada no mount e
  // sempre que o socket (re)conecta para reconciliar eventos perdidos.
  const syncStatus = useCallback(() => {
    api.get('/api/session')
      .then((r) => setStatus(r.data.status))
      .catch(() => {});
  }, []);

  useEffect(() => { syncStatus(); }, [syncStatus]);

  useSocket({
    // Reconcilia ao (re)conectar: um evento one-shot como `session:ready` pode
    // se perder durante uma reconexão do socket (ex.: backend reiniciou), o que
    // deixava a tela presa em "Aguardando QR" sem QR e sem botão. Re-buscar o
    // status no connect auto-corrige, sem precisar de reload manual.
    connect: syncStatus,
    qr: ({ qr: q }) => { setQr(q); setStatus('qr_ready'); setError(null); },
    'session:ready': () => { setStatus('connected'); setQr(null); setError(null); },
    'session:disconnected': () => { setStatus('disconnected'); setQr(null); },
    'session:status': ({ status: s }) => setStatus(s),
    'session:error': ({ message: m }) => { setStatus('disconnected'); setError(m); },
    'session:wrong_phone': ({ message: m }) => { setStatus('disconnected'); setQr(null); setError(m); },
  });

  const start = async () => {
    await api.post('/api/session/start');
    setStatus('starting');
  };

  const sendTest = async (e) => {
    e.preventDefault();
    setTesting(true);
    setTestFeedback(null);
    try {
      await api.post('/api/send/test-number', {
        countryCode,
        phone: testPhone,
        message: testMessage,
      });
      setTestFeedback({ ok: true, msg: 'Mensagem enviada com sucesso!' });
    } catch (err) {
      setTestFeedback({ ok: false, msg: err.response?.data?.error || 'Erro ao enviar' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Sessão WhatsApp</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gerencie a conexão com o WhatsApp Web</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="page-content max-w-2xl">
        {status === 'connected' && <UpsellBanner context="session" className="mb-4" />}
        {/* Connection card */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            {status === 'connected'
              ? <Wifi className="w-5 h-5 text-emerald-600" />
              : <WifiOff className="w-5 h-5 text-slate-400" />}
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {status === 'connected' ? 'WhatsApp conectado' : 'WhatsApp desconectado'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {status === 'connected'
                  ? 'Pronto para enviar mensagens.'
                  : 'Inicie a sessão e escaneie o QR code no celular.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <PhoneOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {status === 'qr_ready' && qr && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                <QrCode className="w-4 h-4" />
                Escaneie com o WhatsApp no celular
              </div>
              <img src={qr} alt="QR Code WhatsApp" className="w-56 h-56 rounded-lg border border-slate-200" />
            </div>
          )}

          {(status === 'disconnected' || status === 'loading') && (
            <button onClick={start} className="btn-primary">
              <RefreshCw className="w-4 h-4" />
              Iniciar sessão
            </button>
          )}
          {status === 'starting' && (
            <button disabled className="btn-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Iniciando…
            </button>
          )}
        </div>

        {/* Test message */}
        {status === 'connected' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Envio de teste</h2>
            <form onSubmit={sendTest} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Número de destino</label>
                <div className="flex gap-2">
                  <select
                    className="input w-[118px] shrink-0"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    aria-label="Código do país"
                  >
                    <option value="55">🇧🇷 +55</option>
                    <option value="1">🇺🇸 +1</option>
                    <option value="351">🇵🇹 +351</option>
                    <option value="54">🇦🇷 +54</option>
                    <option value="598">🇺🇾 +598</option>
                  </select>
                  <input
                    type="tel"
                    className="input flex-1 min-w-0"
                    placeholder="DDD + número — ex: 11 99999-9999"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Só o DDD e o número — o +{countryCode} já está selecionado.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mensagem (opcional)</label>
                <input
                  className="input"
                  placeholder="Teste de envio gestaozap"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                />
              </div>
              {testFeedback && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testFeedback.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {testFeedback.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {testFeedback.msg}
                </div>
              )}
              <button type="submit" disabled={testing} className="btn-primary">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {testing ? 'Enviando…' : 'Enviar teste'}
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
