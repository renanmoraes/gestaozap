/** Fuso padrão do GestãoZap — horário de Brasília. */
const APP_TIMEZONE = 'America/Sao_Paulo';

function now() {
  return new Date();
}

function getDatePartsBr(date = now()) {
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
function getHourBr(date = now()) {
  return Number(getDatePartsBr(date).hour);
}

/** Chave YYYY-MM do mês corrente em Brasília. */
function getMonthKeyBr(date = now()) {
  const { year, month } = getDatePartsBr(date);
  return `${year}-${month}`;
}

/** Chave YYYY-MM-DD do dia em Brasília. */
function getCalendarDayKeyBr(date = now()) {
  const { year, month, day } = getDatePartsBr(date);
  return `${year}-${month}-${day}`;
}

function isOutsideSendWindow(hourStart, hourEnd, date = now()) {
  const hour = getHourBr(date);
  return hour < hourStart || hour >= hourEnd;
}

/** Milissegundos até a próxima meia-noite em Brasília. */
function msUntilMidnightBr(date = now()) {
  const { hour, minute, second } = getDatePartsBr(date);
  const elapsed = (Number(hour) * 3600 + Number(minute) * 60 + Number(second)) * 1000;
  return 24 * 3600 * 1000 - elapsed;
}

/** Milissegundos até a próxima ocorrência de `targetHour`h em Brasília. */
function msUntilNextHourBr(targetHour, date = now()) {
  const { hour, minute, second } = getDatePartsBr(date);
  const currentSec = Number(hour) * 3600 + Number(minute) * 60 + Number(second);
  const targetSec = targetHour * 3600;
  let diff = targetSec - currentSec;
  if (diff <= 0) diff += 24 * 3600;
  return diff * 1000;
}

/** Timestamp compacto para nomes de arquivo (horário de Brasília). */
function formatStampBr(date = now()) {
  const { year, month, day, hour, minute, second } = getDatePartsBr(date);
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/** Fim do dia civil em Brasília a partir de YYYY-MM-DD. */
function endOfCalendarDayBr(dateKey) {
  if (!dateKey || typeof dateKey !== 'string') {
    throw new Error('Data inválida');
  }
  const parsed = new Date(`${dateKey.trim()}T23:59:59.999-03:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Data inválida');
  }
  return parsed;
}

module.exports = {
  APP_TIMEZONE,
  now,
  getDatePartsBr,
  getHourBr,
  getMonthKeyBr,
  getCalendarDayKeyBr,
  isOutsideSendWindow,
  msUntilMidnightBr,
  msUntilNextHourBr,
  formatStampBr,
  endOfCalendarDayBr,
};
