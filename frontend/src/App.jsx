import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useSearchParams } from 'react-router-dom';
import {
  Smartphone, Users, FileText, Send, Clock, BarChart2, Database,
  ChevronLeft, ChevronRight, Zap, CreditCard, LogOut,
  ShieldCheck, Settings, Building2, UserCheck, MessageCircle, Cloud, Sparkles,
} from 'lucide-react';
import MobileShell from './components/layout/MobileShell';
import MobileWaBlock from './components/MobileWaBlock';
import { useIsMobile } from './hooks/useIsMobile';

import { TenantProvider, useTenant } from './context/TenantContext';
import WaGate from './components/WaGate';

import Session from './pages/Session';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import SendPage from './pages/Send';
import History from './pages/History';
import Queue from './pages/Queue';
import Backup from './pages/Backup';
import Billing from './pages/Billing';
import Login from './pages/Login';
import Chat from './pages/Chat';
import QuickReplies from './pages/QuickReplies';
import Landing from './pages/Landing/Landing';

import AdminLogin from './pages/admin/AdminLogin';
import AdminTenants from './pages/admin/AdminTenants';
import AdminConfig from './pages/admin/AdminConfig';
import AdminAffiliates from './pages/admin/AdminAffiliates';
import AdminTenantDetail from './pages/admin/AdminTenantDetail';
import AdminStorage from './pages/admin/AdminStorage';
import AdminFeatures from './pages/admin/AdminFeatures';
import Promotions from './pages/Promotions';
import PromotionVitrinePublic from './pages/promotions/PromotionVitrinePublic';

import Register from './pages/Register';
import Affiliate from './pages/Affiliate';

import TermosDeUso from './pages/legal/TermosDeUso';
import PoliticaPrivacidade from './pages/legal/PoliticaPrivacidade';
import LGPD from './pages/legal/LGPD';

/* ─── Detecção de contexto ────────────────────────────────── */

function isLocalHost() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(h);
}

function isAdminContext() {
  if (isLocalHost()) {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('admin') === '1') return true;
    return window.location.pathname.startsWith('/admin');
  }
  return window.location.hostname.split('.')[0] === 'admin';
}

function isTenantSubdomain() {
  if (isLocalHost()) {
    return window.location.pathname.startsWith('/app');
  }
  const slug = window.location.hostname.split('.')[0];
  return slug !== 'admin' && slug !== 'www' && window.location.hostname.split('.').length >= 3;
}

function isMarketingSite() {
  return !isAdminContext() && !isTenantSubdomain();
}

/* ─── App Admin ───────────────────────────────────────────── */

const ADMIN_NAV = [
  { to: '/tenants', label: 'Clientes', icon: Building2 },
  { to: '/features', label: 'Features', icon: Sparkles },
  { to: '/affiliates', label: 'Afiliados', icon: UserCheck },
  { to: '/storage', label: 'Armazenamento', icon: Cloud },
  { to: '/config', label: 'Configurações', icon: Settings },
];

function AdminApp({ basePath = '' }) {
  const [token, setToken] = useState(() => localStorage.getItem('gestaozap_admin_token'));

  const logout = () => {
    localStorage.removeItem('gestaozap_admin_token');
    setToken(null);
  };

  if (!token) return <AdminLogin onLogin={setToken} />;

  const prefix = basePath.replace(/\/$/, '');

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-56 bg-sidebar flex flex-col shrink-0">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm leading-none">GestãoZap</div>
            <div className="text-slate-400 text-xs mt-0.5">Admin</div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={`${prefix}${to}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-2 py-4 border-t border-slate-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Routes>
            <Route path={`${prefix}/tenants`} element={<AdminTenants />} />
            <Route path={`${prefix}/tenants/:id`} element={<AdminTenantDetail />} />
            <Route path={`${prefix}/features`} element={<AdminFeatures />} />
            <Route path={`${prefix}/affiliates`} element={<AdminAffiliates />} />
            <Route path={`${prefix}/storage`} element={<AdminStorage />} />
            <Route path={`${prefix}/config`} element={<AdminConfig />} />
            <Route path="*" element={<Navigate to={`${prefix}/tenants`} replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

/* ─── App Tenant ──────────────────────────────────────────── */

function buildTenantNav(isAffiliate, hasPromotions) {
  const items = [
    { to: '/', label: 'WhatsApp', icon: Smartphone, end: true },
    { to: '/chat', label: 'Conversas', icon: MessageCircle },
    { to: '/contacts', label: 'Contatos', icon: Users },
    { to: '/quick-replies', label: 'Mensagens rápidas', icon: Zap },
    { to: '/campaigns', label: 'Templates', icon: FileText },
    ...(hasPromotions ? [{ to: '/promotions', label: 'Promoções', icon: Sparkles }] : []),
    { to: '/send', label: 'Disparo', icon: Send },
    { to: '/queue', label: 'Fila', icon: Clock },
    { to: '/history', label: 'Histórico', icon: BarChart2 },
    { to: '/backup', label: 'Backup', icon: Database },
    { to: '/billing', label: 'Financeiro', icon: CreditCard },
  ];
  if (isAffiliate) {
    items.push({ to: '/affiliate', label: 'Afiliado', icon: UserCheck });
  }
  return items;
}

function AffiliateRoute({ isAffiliate, prefix }) {
  if (!isAffiliate) return <Navigate to={`${prefix}/send`} replace />;
  return <Affiliate />;
}

function PromotionsRoute({ prefix }) {
  const { hasFeature } = useTenant();
  if (!hasFeature('vitrine-promocoes')) {
    return <Navigate to={`${prefix}/send`} replace />;
  }
  return <Promotions />;
}

function TenantLayout({ basePath = '' }) {
  const { isAuthenticated, isLoading, tenant, waStatus, logout, isAffiliate, hasFeature } = useTenant();
  const [open, setOpen] = useState(true);
  const isMobile = useIsMobile();
  const prefix = basePath.replace(/\/$/, '');
  const hasPromotions = hasFeature('vitrine-promocoes');
  const tenantNav = buildTenantNav(isAffiliate, hasPromotions);

  if (window.location.pathname === `${prefix}/registrar` || window.location.pathname === '/registrar') {
    return <Register />;
  }

  if (
    window.location.pathname === `${prefix}/promocao-do-dia`
    || window.location.pathname === '/promocao-do-dia'
  ) {
    return <PromotionVitrinePublic />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  const sidebar = (
    <aside className={`${open ? 'w-56' : 'w-16'} bg-sidebar flex flex-col shrink-0 transition-all duration-200`}>
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {open && (
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm leading-none truncate">
              {tenant?.tenantName || 'GestãoZap'}
            </div>
            <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${waStatus === 'connected' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {waStatus === 'connected' ? 'Conectado' : 'Desconectado'}
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {tenantNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={`${prefix}${to}`}
            end={end}
            title={!open ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {open && <span className="text-sm font-medium">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-4 border-t border-slate-800 space-y-0.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={open ? 'Recolher menu' : 'Expandir menu'}
        >
          {open ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {open && <span className="text-sm font-medium">Recolher</span>}
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Sair"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {open && <span className="text-sm font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );

  const defaultRoute = isMobile ? `${prefix}/send` : `${prefix}/`;

  return (
    <MobileShell prefix={prefix} sidebar={sidebar}>
      <Routes>
        <Route path={`${prefix}/`} element={
          <MobileWaBlock title="Conexão WhatsApp">
            <Session />
          </MobileWaBlock>
        } />
        <Route path={`${prefix}/chat`} element={
          <MobileWaBlock title="Conversas WhatsApp">
            <WaGate><Chat /></WaGate>
          </MobileWaBlock>
        } />
        <Route path={`${prefix}/chat/:chatId`} element={
          <MobileWaBlock title="Conversas WhatsApp">
            <WaGate><Chat /></WaGate>
          </MobileWaBlock>
        } />
        <Route path={`${prefix}/contacts`} element={<Contacts />} />
        <Route path={`${prefix}/quick-replies`} element={<QuickReplies />} />
        <Route path={`${prefix}/campaigns`} element={<Campaigns />} />
        <Route path={`${prefix}/promotions`} element={<PromotionsRoute prefix={prefix} />} />
        <Route path={`${prefix}/send`} element={<WaGate><SendPage /></WaGate>} />
        <Route path={`${prefix}/queue`} element={<Queue />} />
        <Route path={`${prefix}/history`} element={<History />} />
        <Route path={`${prefix}/backup`} element={<Backup />} />
        <Route path={`${prefix}/billing`} element={<Billing />} />
        <Route path={`${prefix}/affiliate`} element={<AffiliateRoute isAffiliate={isAffiliate} prefix={prefix} />} />
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </MobileShell>
  );
}

function TenantApp({ basePath = '' }) {
  return (
    <TenantProvider>
      <TenantLayout basePath={basePath} />
    </TenantProvider>
  );
}

/* ─── Site marketing (domínio raiz) ───────────────────────── */

function AffiliateRegisterRedirect() {
  const [params] = useSearchParams();
  const ref = params.get('ref');
  if (ref) {
    return <Navigate to={`/?ref=${encodeURIComponent(ref.trim().toUpperCase())}`} replace />;
  }
  return <Register />;
}

function MarketingSite() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin/*" element={<AdminApp basePath="/admin" />} />
      <Route path="/registrar" element={<AffiliateRegisterRedirect />} />
      <Route path="/termos" element={<TermosDeUso />} />
      <Route path="/privacidade" element={<PoliticaPrivacidade />} />
      <Route path="/lgpd" element={<LGPD />} />
      <Route path="/app/*" element={<TenantApp basePath="/app" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/* ─── Root ────────────────────────────────────────────────── */

export default function App() {
  if (isAdminContext()) {
    const basePath = isLocalHost() && window.location.pathname.startsWith('/admin') ? '/admin' : '';
    return <AdminApp basePath={basePath} />;
  }

  if (isTenantSubdomain()) {
    const basePath = isLocalHost() ? '/app' : '';
    return <TenantApp basePath={basePath} />;
  }

  if (isMarketingSite()) {
    return <MarketingSite />;
  }

  return <MarketingSite />;
}
