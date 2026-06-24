import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { WifiOff, Loader2 } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import api from '../api';

/**
 * Bloqueia o conteúdo com um overlay quando o WhatsApp não está conectado.
 *
 * Modelo de sessão SOB DEMANDA: a sessão cai por ociosidade e religa do cache
 * (sem QR). Em vez de mandar o usuário à tela de Sessão a cada repouso, aqui
 * tentamos religar automaticamente (POST /api/session/start) e mostramos um
 * estado "Reconectando…". Quando o `session:ready` chega, o waStatus vira
 * 'connected' (via TenantContext) e o conteúdo aparece sozinho. Só caímos no
 * CTA "Ir para Sessão" quando precisa de QR (qr_ready) ou a religação não
 * completa no tempo esperado.
 */
export default function WaGate({ children, message }) {
  const { waStatus } = useTenant();
  const [waking, setWaking] = useState(false);
  const triedRef = useRef(false);

  useEffect(() => {
    if (waStatus === 'connected') {
      setWaking(false);
      triedRef.current = false; // re-arma o auto-wake para um futuro repouso
      return;
    }
    if (waStatus === 'disconnected' && !triedRef.current) {
      triedRef.current = true;
      setWaking(true);
      api.post('/api/session/start').catch(() => {});
      const t = setTimeout(() => setWaking(false), 40000); // fallback: cai no CTA
      return () => clearTimeout(t);
    }
  }, [waStatus]);

  if (waStatus === 'connected') return children;

  const reconnecting = waking && waStatus === 'disconnected';

  return (
    <div className="relative min-h-full">
      {/* Conteúdo desfocado ao fundo */}
      <div className="opacity-20 pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-10">
        <div className="card p-8 max-w-sm text-center shadow-lg">
          {reconnecting ? (
            <>
              <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-7 h-7 text-brand-500 animate-spin" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 mb-2">
                Reconectando sua sessão…
              </h3>
              <p className="text-sm text-slate-500 mb-5">
                Sua sessão estava em repouso para economizar recursos. Estamos religando
                automaticamente — leva alguns segundos, sem precisar escanear QR.
              </p>
              <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">
                Abrir tela de Sessão
              </Link>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <WifiOff className="w-7 h-7 text-slate-400" />
              </div>
              <h3 className="text-base font-semibold text-slate-800 mb-2">
                WhatsApp não conectado
              </h3>
              <p className="text-sm text-slate-500 mb-5">
                {waStatus === 'qr_ready'
                  ? 'Escaneie o QR Code na tela de Sessão para conectar seu WhatsApp.'
                  : (message || 'Para usar esta funcionalidade, conecte seu WhatsApp primeiro.')}
              </p>
              <Link to="/" className="btn-primary text-sm">
                Ir para Sessão
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
