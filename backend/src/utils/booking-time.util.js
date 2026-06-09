/**
 * Conversão de horários para agendamentos (timezone IANA, end exclusivo).
 */
const { APP_TIMEZONE } = require('./timezone.util');

const WEEKDAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const KEY_TO_WEEKDAY = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function parseDateKey(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : value.trim();
}

function parseMonthKey(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})$/);
  return m ? value.trim() : null;
}

function parseLocalTime(value) {
  if (!value || typeof value !== 'string') return null;
  const [h, min] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

/** Offset em ms entre UTC e timezone IANA num instante. */
function getTzOffsetMs(date, timeZone = APP_TIMEZONE) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

/** Converte dateKey + HH:mm local (host TZ) → Date UTC. */
function localDateTimeToUtc(dateKey, hm, timeZone = APP_TIMEZONE) {
  const mins = parseLocalTime(hm);
  if (mins == null || !parseDateKey(dateKey)) throw new Error('Data/hora inválida');
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const [y, mo, d] = dateKey.split('-').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, m, 0));
  const offset = getTzOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function getWeekdayFromDateKey(dateKey, timeZone = APP_TIMEZONE) {
  const utc = localDateTimeToUtc(dateKey, '12:00', timeZone);
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(utc);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

function formatDateKeyBr(date = new Date(), timeZone = APP_TIMEZONE) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function buildPublicBookingUrl(tenantSlug, { date, month, eventTypeId, baseOrigin } = {}) {
  const host = baseOrigin || `https://${tenantSlug}.gestaozap.digital`;
  const base = `${host.replace(/\/$/, '')}/agendar`;
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (month) params.set('month', month);
  if (eventTypeId) params.set('tipo', eventTypeId);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

function buildPromotionShareUrl(tenantSlug, shareCode, baseOrigin) {
  const host = baseOrigin || `https://${tenantSlug}.gestaozap.digital`;
  const code = String(shareCode || '').replace(/^#/, '');
  return `${host.replace(/\/$/, '')}/promocao-do-dia#${code}`;
}

module.exports = {
  APP_TIMEZONE,
  WEEKDAY_TO_KEY,
  KEY_TO_WEEKDAY,
  parseDateKey,
  parseMonthKey,
  parseLocalTime,
  localDateTimeToUtc,
  addMinutes,
  rangesOverlap,
  getWeekdayFromDateKey,
  formatDateKeyBr,
  buildPublicBookingUrl,
  buildPromotionShareUrl,
};
