import React from 'react';
import { Link } from 'react-router-dom';
import { Monitor, Send, FileText, Users } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

export default function MobileWaBlock({ children, title = 'Disponível no computador' }) {
  const isMobile = useIsMobile();

  if (!isMobile) return children;

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
      <div className="card p-6 max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
          <Monitor className="w-7 h-7 text-slate-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Conexão e conversas do WhatsApp ficam no computador, onde o QR Code é escaneado.
            Pelo celular você pode disparar, criar templates e gerenciar contatos.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <Link to="/send" className="btn-primary justify-center py-2.5">
            <Send className="w-4 h-4" /> Ir para Disparo
          </Link>
          <div className="flex gap-2">
            <Link to="/campaigns" className="btn-secondary flex-1 justify-center py-2 text-xs">
              <FileText className="w-3.5 h-3.5" /> Templates
            </Link>
            <Link to="/contacts" className="btn-secondary flex-1 justify-center py-2 text-xs">
              <Users className="w-3.5 h-3.5" /> Contatos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
