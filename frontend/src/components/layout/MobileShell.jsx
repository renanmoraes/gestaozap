import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Send, FileText, Users, Clock, MoreHorizontal, X, Zap, LogOut,
  BarChart2, Database, CreditCard, Sparkles,
  UserCheck, Zap as ZapIcon,
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const BOTTOM_NAV = [
  { to: '/send', label: 'Disparo', icon: Send },
  { to: '/campaigns', label: 'Templates', icon: FileText },
  { to: '/contacts', label: 'Contatos', icon: Users },
  { to: '/queue', label: 'Fila', icon: Clock },
];

function MoreMenu({ open, onClose, prefix, extraItems, showPromotions }) {
  if (!open) return null;

  const moreItems = [
    ...(showPromotions ? [{ to: '/promotions', label: 'Promoções', icon: Sparkles }] : []),
    { to: '/history', label: 'Histórico', icon: BarChart2 },
    { to: '/quick-replies', label: 'Mensagens rápidas', icon: ZapIcon },
    { to: '/billing', label: 'Financeiro', icon: CreditCard },
    { to: '/backup', label: 'Backup', icon: Database },
    ...extraItems,
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 pb-safe max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-slate-900">Mais opções</span>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {moreItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={`${prefix}${to}`}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-2.5 p-3 rounded-xl border text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MobileShell({ children, prefix, sidebar }) {
  const isMobile = useIsMobile();
  const { tenant, waStatus, logout, isAffiliate, hasFeature } = useTenant();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const showPromotions = hasFeature('vitrine-promocoes');

  if (!isMobile) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        {sidebar}
        <main className="flex-1 overflow-auto flex flex-col min-h-screen">{children}</main>
      </div>
    );
  }

  const extraItems = [];
  if (isAffiliate) {
    extraItems.push({ to: '/affiliate', label: 'Afiliado', icon: UserCheck });
  }

  const isMoreActive = [
    ...(showPromotions ? ['/promotions'] : []),
    '/history', '/quick-replies', '/billing', '/backup', '/affiliate',
  ]
    .some((p) => location.pathname.endsWith(p) || location.pathname.includes(`${prefix}${p}`));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-sidebar border-b border-slate-800 px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate">
            {tenant?.tenantName || 'GestãoZap'}
          </div>
          <div className="text-slate-400 text-xs flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${waStatus === 'connected' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            {waStatus === 'connected' ? 'WA conectado' : 'WA no computador'}
          </div>
        </div>
        <button type="button" onClick={logout} className="p-2 text-slate-400 hover:text-white" title="Sair">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <main className="flex-1 overflow-auto flex flex-col min-h-0 pb-16">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 pb-safe">
        <div className="flex items-stretch justify-around">
          {BOTTOM_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={`${prefix}${to}`}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 px-2 min-w-0 flex-1 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-brand-600' : 'text-slate-500'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-full">{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 px-2 min-w-0 flex-1 text-[10px] font-medium ${
              isMoreActive ? 'text-brand-600' : 'text-slate-500'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        prefix={prefix}
        extraItems={extraItems}
        showPromotions={showPromotions}
      />
    </div>
  );
}
