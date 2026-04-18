import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Session from './pages/Session';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import Send from './pages/Send';
import History from './pages/History';

const nav = [
  { to: '/', label: 'Sessão' },
  { to: '/contacts', label: 'Contatos' },
  { to: '/campaigns', label: 'Campanhas' },
  { to: '/send', label: 'Disparo' },
  { to: '/history', label: 'Histórico' },
];

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-green-600 text-white px-6 py-3 flex gap-6">
        <span className="font-bold mr-4">WA Invites</span>
        {nav.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => isActive ? 'underline font-semibold' : 'hover:underline'}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<Session />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/send" element={<Send />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </div>
  );
}
