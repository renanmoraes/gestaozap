import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Settings } from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage, MSG } from '../../utils/messages';

const CONFIG_LABELS = {
  batch_size:               { label: 'Tamanho do lote', desc: 'Mensagens por lote antes da pausa anti-ban', type: 'number' },
  batch_pause_ms:           { label: 'Pausa entre lotes (ms)', desc: 'Duração da pausa entre lotes', type: 'number' },
  antiban_delay_min_ms:     { label: 'Delay mínimo (ms)', desc: 'Intervalo mínimo entre mensagens', type: 'number' },
  antiban_delay_max_ms:     { label: 'Delay máximo (ms)', desc: 'Intervalo máximo entre mensagens', type: 'number' },
  hour_start_default:       { label: 'Hora de início padrão', desc: 'Hora de início dos disparos (0–23)', type: 'number' },
  hour_end_default:         { label: 'Hora de fim padrão', desc: 'Hora de fim dos disparos (0–23)', type: 'number' },
  max_consecutive_failures: { label: 'Máx. falhas consecutivas', desc: 'Falhas antes de pausar automaticamente', type: 'number' },
  failure_pause_ms:         { label: 'Pausa após falhas (ms)', desc: 'Tempo de pausa após falhas consecutivas', type: 'number' },
  backup_retention:         { label: 'Retenção de backups', desc: 'Quantidade de backups automáticos a manter', type: 'number' },
  backup_auto_hour:         { label: 'Hora do backup automático', desc: 'Hora do backup diário (0–23)', type: 'number' },
  terms_current_version:    { label: 'Versão dos termos', desc: 'Versão atual dos Termos de Uso', type: 'text' },
  trial_days:               { label: 'Dias de trial', desc: 'Dias de teste grátis após aprovação do cadastro', type: 'number' },
};

export default function AdminConfig() {
  const [configs, setConfigs]   = useState([]);
  const [editing, setEditing]   = useState({});
  const [saving, setSaving]     = useState({});
  const [loading, setLoading]   = useState(true);
  const [saved, setSaved]       = useState({});

  const load = () => {
    setLoading(true);
    api.get('/api/admin/config').then((r) => {
      setConfigs(r.data);
      const init = {};
      r.data.forEach((c) => { init[c.key] = c.value; });
      setEditing(init);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async (key) => {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await api.patch(`/api/admin/config/${key}`, { value: editing[key] });
      setSaved((s) => ({ ...s, [key]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [key]: false })), 2000);
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.adminSaveFailed));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Configurações da plataforma</h2>
          <p className="text-sm text-slate-500">Alterações entram em vigor em até 60 segundos, sem reiniciar o servidor.</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />Recarregar
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <span className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin inline-block" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {configs.map((cfg) => {
            const meta = CONFIG_LABELS[cfg.key] || { label: cfg.key, desc: cfg.description, type: 'text' };
            const isDirty = editing[cfg.key] !== cfg.value;
            return (
              <div key={cfg.key} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{meta.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{meta.desc || cfg.description}</div>
                  </div>
                  {saved[cfg.key] && (
                    <span className="text-xs text-emerald-600 font-medium">Salvo ✓</span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <input
                    type={meta.type || 'text'}
                    className="input flex-1 py-2 text-sm"
                    value={editing[cfg.key] ?? cfg.value}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [cfg.key]: e.target.value }))}
                  />
                  <button
                    onClick={() => save(cfg.key)}
                    disabled={saving[cfg.key] || !isDirty}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${isDirty
                        ? 'bg-brand-600 text-white hover:bg-brand-700'
                        : 'bg-slate-100 text-slate-400 cursor-default'}`}
                  >
                    {saving[cfg.key]
                      ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <Save className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
