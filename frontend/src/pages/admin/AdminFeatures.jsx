import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Save, X, Tag } from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage } from '../../utils/messages';

const EMPTY = {
  slug: '',
  name: '',
  description: '',
  priceBrl: '0',
  isFree: false,
  active: true,
  billingDay: 5,
};

function formatMoney(v) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdminFeatures() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/api/admin/features')
      .then((r) => setRows(r.data))
      .catch((e) => dialog.alert(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY);
  };

  const openEdit = (row) => {
    setEditing(row.id);
    setForm({
      slug: row.slug,
      name: row.name,
      description: row.description || '',
      priceBrl: row.priceBrl,
      isFree: row.isFree,
      active: row.active,
      billingDay: row.billingDay,
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.post('/api/admin/features', form);
      } else {
        await api.patch(`/api/admin/features/${editing}`, form);
      }
      setEditing(null);
      load();
    } catch (e) {
      dialog.alert(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-600" />
            Features & Addons
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Catálogo de funcionalidades pagas ou gratuitas por tenant.
          </p>
        </div>
        <button type="button" onClick={openNew} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nova feature
        </button>
      </div>

      {editing && (
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-slate-800">
            {editing === 'new' ? 'Cadastrar feature' : 'Editar feature'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600">Slug</span>
              <input
                className="input w-full mt-1"
                value={form.slug}
                disabled={editing !== 'new'}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Nome</span>
              <input
                className="input w-full mt-1"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600">Descrição</span>
              <textarea
                className="input w-full mt-1"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Preço (R$/mês)</span>
              <input
                className="input w-full mt-1"
                value={form.priceBrl}
                disabled={form.isFree}
                onChange={(e) => setForm((f) => ({ ...f, priceBrl: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Dia de cobrança</span>
              <input
                type="number"
                min={1}
                max={28}
                className="input w-full mt-1"
                value={form.billingDay}
                onChange={(e) => setForm((f) => ({ ...f, billingDay: Number(e.target.value) }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFree}
                onChange={(e) => setForm((f) => ({ ...f, isFree: e.target.checked }))}
              />
              Gratuita para tenants ativos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Ativa no catálogo
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              Salvar
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary flex items-center gap-2">
              <X className="w-4 h-4" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Carregando…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-3">Feature</th>
                <th className="text-left p-3">Preço</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <div className="font-medium text-slate-900 flex items-center gap-2">
                      {row.name}
                      {row.isSystem && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                          Padrão do sistema
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">{row.slug}</div>
                    {row.description && (
                      <div className="text-xs text-slate-500 mt-0.5 max-w-md">{row.description}</div>
                    )}
                  </td>
                  <td className="p-3">
                    {row.isFree ? (
                      <span className="text-emerald-700 font-medium">Grátis</span>
                    ) : (
                      <span>{formatMoney(row.priceBrl)}/mês</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      row.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Tag className="w-3 h-3" />
                      {row.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button type="button" onClick={() => openEdit(row)} className="text-brand-600 hover:underline text-sm">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
