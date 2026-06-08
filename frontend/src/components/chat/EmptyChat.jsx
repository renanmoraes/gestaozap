import React from 'react';
import { MessageCircle, Smartphone } from 'lucide-react';

export default function EmptyChat() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-center max-w-sm px-6">
        <div className="w-20 h-20 rounded-full bg-white border border-slate-200 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <MessageCircle className="w-10 h-10 text-brand-200" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          Selecione uma conversa
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Escolha alguém na lista da esquerda para abrir a conversa, ou aguarde
          uma mensagem chegar — quando isso acontecer ela aparece aqui na hora.
        </p>
        <div className="mt-5 inline-flex items-center gap-1.5 text-xs text-slate-400">
          <Smartphone className="w-3 h-3" />
          Tudo sincronizado com seu WhatsApp
        </div>
      </div>
    </div>
  );
}
