import React, { useEffect, useState } from 'react';
import { X, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { dialog } from '../utils/dialog';

const SNOOZE_KEY = 'gestaozap_upsell_snooze';
const SNOOZE_DAYS = 7;
const SNOOZE_MS = SNOOZE_DAYS * 24 * 60 * 60 * 1000;

// Cache compartilhado entre instâncias (uma busca por sessão).
let suggestionsPromise = null;
function loadSuggestions() {
  if (!suggestionsPromise) {
    suggestionsPromise = api.get('/api/upsell/suggestions')
      .then(({ data }) => (Array.isArray(data?.suggestions) ? data.suggestions : []))
      .catch(() => []);
  }
  return suggestionsPromise;
}

function readSnooze() {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); } catch { return {}; }
}
function snooze(key) {
  const map = readSnooze();
  map[key] = Date.now();
  try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(map)); } catch { /* noop */ }
}
function isSnoozed(key, map) {
  const ts = map[key];
  return ts && (Date.now() - ts) < SNOOZE_MS;
}

// Seleção estável por contexto → spots diferentes mostram produtos diferentes.
function pickForContext(list, context) {
  if (!list.length) return null;
  let seed = 0;
  for (const c of String(context)) seed = (seed + c.charCodeAt(0)) % 997;
  return list[seed % list.length];
}

/**
 * Banner de upsell não-invasivo. Mostra no máximo 1 sugestão por vez,
 * dispensável (soneca 7 dias) e com rotação por contexto.
 * @param {{ context: string }} props
 */
export default function UpsellBanner({ context = 'default', className = '' }) {
  const navigate = useNavigate();
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    loadSuggestions().then((list) => {
      const snoozeMap = readSnooze();
      const available = list.filter((s) => !isSnoozed(s.key, snoozeMap));
      setSuggestion(pickForContext(available, context));
    });
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [context]);

  if (!suggestion) return null;

  const dismiss = () => {
    snooze(suggestion.key);
    refresh();
  };

  const act = async () => {
    if (suggestion.type === 'discover' && suggestion.route) {
      navigate(suggestion.route);
      return;
    }
    // upsell → registra interesse
    setBusy(true);
    try {
      await api.post('/api/upsell/interest', { featureSlug: suggestion.featureSlug });
      dialog.toast.success('Recebemos seu interesse! Nosso time vai falar com você. 🙌');
      snooze(suggestion.key);
      refresh();
    } catch {
      dialog.toast.error('Não consegui registrar agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative flex items-center gap-3 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-violet-50/60 px-3.5 py-2.5 pr-9 ${className}`}>
      <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center text-base shrink-0 shadow-sm">
        <span aria-hidden>{suggestion.emoji || <Sparkles className="w-4 h-4 text-brand-600" />}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 leading-tight">
          {suggestion.title}
          {suggestion.priceBrl && (
            <span className="ml-2 text-[11px] font-medium text-brand-600">
              R$ {Number(suggestion.priceBrl).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500 leading-snug line-clamp-2 sm:line-clamp-1">{suggestion.pitch}</p>
      </div>
      <button
        onClick={act}
        disabled={busy}
        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
      >
        {suggestion.ctaLabel}
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={dismiss}
        aria-label="Dispensar"
        className="absolute top-1.5 right-1.5 p-1 text-slate-400 hover:text-slate-600 rounded"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
