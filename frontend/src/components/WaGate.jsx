import React from 'react';
import { Link } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useTenant } from '../context/TenantContext';

/**
 * Bloqueia o conteúdo com um overlay quando o WhatsApp não está conectado.
 * Use para envolver páginas ou seções que dependem de WA ativo.
 */
export default function WaGate({ children, message }) {
  const { waStatus } = useTenant();

  if (waStatus === 'connected') return children;

  return (
    <div className="relative min-h-full">
      {/* Conteúdo desfocado ao fundo */}
      <div className="opacity-20 pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay bloqueante */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-10">
        <div className="card p-8 max-w-sm text-center shadow-lg">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <WifiOff className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-2">
            WhatsApp não conectado
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            {message || 'Para usar esta funcionalidade, conecte seu WhatsApp primeiro.'}
          </p>
          <Link to="/" className="btn-primary text-sm">
            Ir para Sessão
          </Link>
        </div>
      </div>
    </div>
  );
}
