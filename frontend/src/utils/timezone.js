/** Fuso padrão do GestãoZap — horário de Brasília. */
export const APP_TIMEZONE = 'America/Sao_Paulo';

const LOCALE = 'pt-BR';

function getDatePartsBr(date = new Date()) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return parts;
}

/** Hora atual em Brasília (0–23). */
export function getHourBr(date = new Date()) {
  return Number(getDatePartsBr(date).hour);
}

export function getCalendarDayKeyBr(date = new Date()) {
  const { year, month, day } = getDatePartsBr(date);
  return `${year}-${month}-${day}`;
}

export function isSameCalendarDayBr(a, b) {
  return getCalendarDayKeyBr(a) === getCalendarDayKeyBr(b);
}

export function formatDateBr(date, options = {}) {
  return new Date(date).toLocaleDateString(LOCALE, {
    timeZone: APP_TIMEZONE,
    ...options,
  });
}

export function formatTimeBr(date, options = {}) {
  return new Date(date).toLocaleTimeString(LOCALE, {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

export function formatDateTimeBr(date, options = {}) {
  return new Date(date).toLocaleString(LOCALE, {
    timeZone: APP_TIMEZONE,
    ...options,
  });
}

/** Data/hora de template (quick replies, variáveis de mensagem). */
export function formatTemplateDateBr(date = new Date()) {
  return formatDateBr(date);
}

export function formatTemplateTimeBr(date = new Date()) {
  return formatTimeBr(date);
}

/** Rótulo relativo de dia para chat: Hoje, Ontem ou data formatada. */
export function formatDayLabelBr(ts) {
  const d = new Date(ts);
  const todayKey = getCalendarDayKeyBr();
  const dayKey = getCalendarDayKeyBr(d);
  if (dayKey === todayKey) return 'Hoje';
  const yesterdayKey = getCalendarDayKeyBr(new Date(Date.now() - 86_400_000));
  if (dayKey === yesterdayKey) return 'Ontem';
  return formatDateBr(d, { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Hora relativa para lista de conversas. */
export function formatRelativeChatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (getCalendarDayKeyBr(d) === getCalendarDayKeyBr()) {
    return formatTimeBr(d);
  }
  const yesterdayKey = getCalendarDayKeyBr(new Date(Date.now() - 86_400_000));
  if (getCalendarDayKeyBr(d) === yesterdayKey) return 'Ontem';
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return formatDateBr(d, { weekday: 'short' });
  return formatDateBr(d, { day: '2-digit', month: '2-digit' });
}
