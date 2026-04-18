import React, { useState, useEffect } from 'react';
import api from '../api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState({ name: '', text: '' });
  const [image, setImage] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const res = await api.get('/api/campaigns');
    setCampaigns(res.data);
  };

  useEffect(() => { load(); }, []);

  const buildPreview = () => form.text.replace(/\{nome\}/g, 'João (exemplo)');

  const save = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('text', form.text);
    if (image) fd.append('image', image);

    if (editing) {
      await api.put(`/api/campaigns/${editing}`, fd);
      setEditing(null);
    } else {
      await api.post('/api/campaigns', fd);
    }
    setForm({ name: '', text: '' });
    setImage(null);
    load();
  };

  const remove = async (id) => {
    if (!confirm('Remover campanha?')) return;
    await api.delete(`/api/campaigns/${id}`);
    load();
  };

  const edit = (c) => {
    setEditing(c._id);
    setForm({ name: c.name, text: c.text });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Campanhas</h1>

      <form onSubmit={save} className="border rounded p-4 space-y-4">
        <h2 className="font-semibold">{editing ? 'Editar campanha' : 'Nova campanha'}</h2>
        <input placeholder="Nome da campanha" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full border rounded px-3 py-2" />
        <div className="space-y-1">
          <textarea placeholder="Texto da mensagem — use {nome} para personalizar" value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} required rows={4} className="w-full border rounded px-3 py-2" />
          {form.text && <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded">Preview: {buildPreview()}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Imagem (opcional)</label>
          <input type="file" accept="image/*" onChange={e => setImage(e.target.files[0])} className="block" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            {editing ? 'Salvar' : 'Criar campanha'}
          </button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: '', text: '' }); }} className="px-4 py-2 border rounded">Cancelar</button>}
        </div>
      </form>

      <ul className="space-y-3">
        {campaigns.map(c => (
          <li key={c._id} className="border rounded p-4 flex justify-between items-start">
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-sm text-gray-600 mt-1">{c.text.slice(0, 80)}{c.text.length > 80 ? '...' : ''}</p>
              {c.imagePath && <img src={`${API_URL}/${c.imagePath}`} alt="" className="mt-2 h-16 rounded" />}
            </div>
            <div className="flex gap-2">
              <button onClick={() => edit(c)} className="text-blue-600 text-sm hover:underline">Editar</button>
              <button onClick={() => remove(c._id)} className="text-red-500 text-sm hover:underline">Remover</button>
            </div>
          </li>
        ))}
        {campaigns.length === 0 && <li className="text-center py-6 text-gray-400">Nenhuma campanha</li>}
      </ul>
    </div>
  );
}
