import React, { useEffect, useMemo, useState } from 'react';
import { Target, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../api';
import { intentLabel, TEMPERATURE_META } from '../../utils/intent';

const TEMPS = ['hot', 'warm', 'cool', 'cold'];

/**
 * Bloco de segmentação por intenção para o disparo.
 * Chama onChange(intentFilter|null) sempre que a seleção muda.
 * A data de referência é a data do envio (resolvida no backend).
 */
export default function IntentSegmentation({ onChange }) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState([]);
  const [include, setInclude] = useState([]);
  const [exclude, setExclude] = useState([]);
  const [temps, setTemps] = useState(['hot', 'warm']);
  const [minScore, setMinScore] = useState('');

  useEffect(() => {
    api.get('/api/intent-rules')
      .then(({ data }) => {
        const seen = new Set();
        const list = [];
        (Array.isArray(data) ? data : []).forEach((r) => {
          if (!seen.has(r.intentKey)) { seen.add(r.intentKey); list.push(r.intentKey); }
        });
        setAvailable(list);
      })
      .catch(() => setAvailable([]));
  }, []);

  const intentFilter = useMemo(() => {
    if (!include.length && !exclude.length) return null;
    const f = {};
    if (include.length) f.include_intents = include;
    if (exclude.length) f.exclude_intents = exclude;
    if (temps.length) f.temperatures = temps;
    const ms = Number(minScore);
    if (Number.isFinite(ms) && ms > 0) f.min_final_score = ms;
    return f;
  }, [include, exclude, temps, minScore]);

  useEffect(() => { onChange?.(intentFilter); }, [intentFilter]);

  function toggle(setter, arr, key) {
    setter(arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]);
  }

  const activeSummary = include.length || exclude.length
    ? `${include.length} incluída(s) · ${exclude.length} excluída(s)`
    : 'opcional';

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Target className="w-4 h-4 text-brand-600" />
          Segmentação por intenção
          <span className="text-xs font-normal text-slate-400">({activeSummary})</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-700 mb-2">Incluir contatos com intenção</p>
            <div className="flex flex-wrap gap-1.5">
              {available.map((k) => (
                <button
                  key={`in-${k}`} type="button"
                  onClick={() => toggle(setInclude, include, k)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    include.includes(k) ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-300 text-slate-600 hover:border-brand-400'
                  }`}
                >
                  {intentLabel(k)}
                </button>
              ))}
              {!available.length && <span className="text-xs text-slate-400">Nenhuma intenção configurada.</span>}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700 mb-2">Excluir contatos com intenção</p>
            <div className="flex flex-wrap gap-1.5">
              {available.map((k) => (
                <button
                  key={`ex-${k}`} type="button"
                  onClick={() => toggle(setExclude, exclude, k)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    exclude.includes(k) ? 'bg-red-600 text-white border-red-600' : 'border-slate-300 text-slate-600 hover:border-red-300'
                  }`}
                >
                  {intentLabel(k)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-slate-700 mb-2">Temperatura</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPS.map((t) => (
                  <button
                    key={t} type="button"
                    onClick={() => toggle(setTemps, temps, t)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      temps.includes(t) ? `${TEMPERATURE_META[t].cls} font-medium` : 'border-slate-300 text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {TEMPERATURE_META[t].label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">A janela é calculada a partir da data do envio.</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-700 mb-2">Score final mínimo</p>
              <input
                type="number" step="0.05" min="0" max="1"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                placeholder="ex.: 0.50"
                className="input"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">Confiança × peso temporal. Vazio = sem mínimo.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
