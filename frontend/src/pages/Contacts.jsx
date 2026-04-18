import React, { useState, useEffect } from 'react';
import api from '../api';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [tag, setTag] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', tags: '' });
  const [selected, setSelected] = useState(new Set());
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  const load = async () => {
    const params = tag ? { tag } : {};
    const res = await api.get('/api/contacts', { params });
    setContacts(res.data);
  };

  useEffect(() => { load(); }, [tag]);

  const add = async (e) => {
    e.preventDefault();
    await api.post('/api/contacts', { ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) });
    setForm({ name: '', phone: '', tags: '' });
    load();
  };

  const deactivate = async (id) => {
    await api.delete(`/api/contacts/${id}`);
    load();
  };

  const importContacts = async () => {
    try {
      const parsed = JSON.parse(importText);
      await api.post('/api/contacts/import', { contacts: parsed });
      setImportText('');
      setShowImport(false);
      load();
    } catch {
      alert('JSON inválido');
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(contacts.length === selected.size ? new Set() : new Set(contacts.map(c => c._id)));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Contatos</h1>
        <button onClick={() => setShowImport(!showImport)} className="text-sm text-blue-600 underline">
          Importar JSON
        </button>
      </div>

      {showImport && (
        <div className="border rounded p-4 space-y-2">
          <p className="text-sm text-gray-600">Cole um array JSON: <code>[{"{"}{"\"name\""}:"João",{"\"phone\""}:"5511..."{"}"}]</code></p>
          <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={4} className="w-full border rounded p-2 text-sm font-mono" />
          <button onClick={importContacts} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Importar</button>
        </div>
      )}

      <form onSubmit={add} className="grid grid-cols-3 gap-3">
        <input placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="border rounded px-3 py-2" />
        <input placeholder="Telefone (5511...)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required className="border rounded px-3 py-2" />
        <div className="flex gap-2">
          <input placeholder="Tags (vírgula)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="border rounded px-3 py-2 flex-1" />
          <button type="submit" className="bg-green-600 text-white px-4 rounded">+</button>
        </div>
      </form>

      <div className="flex gap-3 items-center">
        <input placeholder="Filtrar por tag" value={tag} onChange={e => setTag(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <span className="text-sm text-gray-500">{contacts.length} contatos</span>
        {contacts.length > 0 && (
          <button onClick={selectAll} className="text-sm text-blue-600 underline">
            {selected.size === contacts.length ? 'Dessel. todos' : 'Sel. todos'}
          </button>
        )}
      </div>

      <ul className="divide-y border rounded">
        {contacts.map(c => (
          <li key={c._id} className="flex items-center gap-3 px-4 py-3">
            <input type="checkbox" checked={selected.has(c._id)} onChange={() => toggleSelect(c._id)} />
            <div className="flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-gray-500">{c.phone} {c.tags?.length ? `· ${c.tags.join(', ')}` : ''}</p>
            </div>
            <button onClick={() => deactivate(c._id)} className="text-red-500 text-sm hover:underline">Remover</button>
          </li>
        ))}
        {contacts.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Nenhum contato</li>}
      </ul>
    </div>
  );
}
