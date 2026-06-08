/**
 * Camada de proteção anti-bloqueio para whatsapp-web.js
 * Aplicação direta das recomendações de:
 *   - Validação E.164 estrita (libphonenumber-js)
 *   - Pre-flight isRegisteredUser com cache
 *   - Classificação de erros (transient/permanent/policy)
 *   - Backoff exponencial com jitter
 *   - Rate limit por destinatário (24h janela)
 *   - Quality gate (pausa automática se ACK_ERROR > 2%)
 *   - Kill switch por tenant (via Redis)
 *
 * Objetivo: reduzir sinais de abuso, evitar duplicidade, conter incidentes
 * com a menor chance possível de bloqueio do número pelo WhatsApp.
 */

const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { getQueueForTenant } = require('../config/queue');

/* ─── Cache em memória ────────────────────────────────────────── */

// LRU simples para isRegisteredUser (TTL 1h) — evita repetir lookup caro
const REGISTERED_CACHE = new Map();
const REGISTERED_TTL_MS = 60 * 60 * 1000;

// Sliding window de ACKs por tenant para o quality gate
const ACK_WINDOW = new Map(); // tenantId → { ok: number[], error: number[] }
const ACK_WINDOW_SIZE = 100; // últimos N envios consideram para taxa de erro
const ACK_WINDOW_MAX_AGE = 30 * 60 * 1000; // 30min — descarta envios antigos

/* ─── E.164 estrito ───────────────────────────────────────────── */

/**
 * Valida e normaliza para E.164. Mais estrito que normalizePhoneForWhatsApp:
 * rejeita números inválidos antes de gastar tentativa no WhatsApp.
 * Retorna { ok, e164, digits, reason }.
 */
function validateE164(raw, defaultCountry = 'BR') {
  try {
    const input = String(raw || '').trim();
    if (!input) return { ok: false, reason: 'empty' };

    const phone = input.startsWith('+')
      ? parsePhoneNumberFromString(input)
      : parsePhoneNumberFromString(input, defaultCountry);

    if (!phone) return { ok: false, reason: 'unparseable' };
    if (!phone.isValid()) return { ok: false, reason: 'invalid_format' };
    if (phone.getType() === 'PREMIUM_RATE' || phone.getType() === 'SHARED_COST') {
      return { ok: false, reason: 'forbidden_type' };
    }

    const e164 = phone.number; // já com +
    const digits = e164.replace('+', '');
    return { ok: true, e164, digits, country: phone.country };
  } catch (e) {
    return { ok: false, reason: e.message || 'error' };
  }
}

/* ─── Pre-flight: número existe no WhatsApp? ──────────────────── */

/**
 * Cacheia o resultado de isRegisteredUser por (tenantId, digits).
 * Evita repetir lookup pesado para mesmo número em curto prazo.
 */
async function isRecipientRegistered(tenantId, client, digits) {
  const key = `${tenantId}:${digits}`;
  const cached = REGISTERED_CACHE.get(key);
  if (cached && (Date.now() - cached.at) < REGISTERED_TTL_MS) {
    return cached.value;
  }

  try {
    const waId = `${digits}@c.us`;
    const registered = await client.isRegisteredUser(waId);
    REGISTERED_CACHE.set(key, { value: Boolean(registered), at: Date.now() });
    // Limpa cache se ficar grande
    if (REGISTERED_CACHE.size > 50000) {
      const cutoff = Date.now() - REGISTERED_TTL_MS;
      for (const [k, v] of REGISTERED_CACHE) {
        if (v.at < cutoff) REGISTERED_CACHE.delete(k);
      }
    }
    return Boolean(registered);
  } catch (e) {
    // Falha de lookup: NÃO bloqueia o envio (pode ser temporário).
    // Apenas loga e segue.
    console.warn(`[guard] isRegisteredUser falhou para ${digits}: ${e.message}`);
    return true; // fail-open: deixa tentar
  }
}

/* ─── Classificação de erros ──────────────────────────────────── */

/**
 * Classifica erro do wwebjs em:
 *   - 'transient'  : reconect, network, timeout → retry com backoff
 *   - 'permanent'  : número não existe, não registrado → DLQ direto
 *   - 'policy'     : conteúdo bloqueado, recipient block → DLQ + alerta
 *   - 'unknown'    : trata como transient com cap em tentativas
 */
function classifyError(err) {
  const msg = String(err?.message || err || '').toLowerCase();

  // Erros permanentes (não-retry)
  if (/not a whatsapp|not registered|invalid number|not exist|wid invalid/i.test(msg)) {
    return { kind: 'permanent', reason: 'recipient_not_on_whatsapp' };
  }
  if (/no lid|lid for user|cannot find/i.test(msg)) {
    return { kind: 'permanent', reason: 'jid_resolution_failed' };
  }

  // Erros de política (não-retry + alerta)
  if (/blocked|spam|policy|forbidden|rate.*exceeded|too many/i.test(msg)) {
    return { kind: 'policy', reason: 'policy_violation', original: msg };
  }

  // Erros transientes (retry)
  if (/timeout|network|disconnected|socket|econnreset|temporary|target closed|protocol error/i.test(msg)) {
    return { kind: 'transient', reason: 'transient_network' };
  }

  // Erro de Puppeteer (browser caiu, mas pode reconectar)
  if (/puppeteer|browser|context|page closed|evaluation/i.test(msg)) {
    return { kind: 'transient', reason: 'browser_unstable' };
  }

  return { kind: 'unknown', reason: 'unknown', original: msg };
}

/* ─── Backoff exponencial com jitter ──────────────────────────── */

const BACKOFF_TABLE_MS = [5_000, 15_000, 45_000, 120_000, 300_000]; // 5s → 5min

function computeBackoffMs(attempt) {
  const base = BACKOFF_TABLE_MS[Math.min(attempt, BACKOFF_TABLE_MS.length - 1)];
  const jitter = Math.floor(Math.random() * base * 0.3); // até 30% de jitter
  return Math.min(base + jitter, 900_000); // teto 15min
}

/* ─── Rate limit por destinatário (24h via Redis) ─────────────── */

/**
 * Evita enviar para o mesmo número 2x em 24h pelo mesmo tenant.
 * Cria um lock no Redis com TTL configurável.
 * Retorna true se pode enviar; false se foi bloqueado pelo lock.
 */
async function tryReserveRecipient(tenantId, digits, ttlSec = 86400) {
  try {
    const queue = getQueueForTenant(tenantId);
    const key = `gestaozap:${tenantId}:recipient-lock:${digits}`;
    // SET key value NX EX ttl → atomic lock
    const result = await queue.client.set(key, '1', 'EX', ttlSec, 'NX');
    return result === 'OK';
  } catch (e) {
    console.warn('[guard] tryReserveRecipient erro:', e.message);
    return true; // fail-open
  }
}

async function releaseRecipientLock(tenantId, digits) {
  try {
    const queue = getQueueForTenant(tenantId);
    await queue.client.del(`gestaozap:${tenantId}:recipient-lock:${digits}`);
  } catch (_) {}
}

/* ─── Quality gate (sliding window de ACK errors) ─────────────── */

function recordAckResult(tenantId, isError) {
  let win = ACK_WINDOW.get(tenantId);
  if (!win) {
    win = { events: [] };
    ACK_WINDOW.set(tenantId, win);
  }
  win.events.push({ error: Boolean(isError), at: Date.now() });

  // Mantém só os últimos N e descarta antigos
  const cutoff = Date.now() - ACK_WINDOW_MAX_AGE;
  win.events = win.events.filter((e) => e.at >= cutoff).slice(-ACK_WINDOW_SIZE);
}

function getErrorRate(tenantId) {
  const win = ACK_WINDOW.get(tenantId);
  if (!win || win.events.length < 20) return 0; // amostra pequena → ignorar
  const errors = win.events.filter((e) => e.error).length;
  return errors / win.events.length;
}

const QUALITY_GATE_THRESHOLD = 0.02; // 2%

function isQualityGateBreached(tenantId) {
  return getErrorRate(tenantId) > QUALITY_GATE_THRESHOLD;
}

function resetQualityGate(tenantId) {
  ACK_WINDOW.delete(tenantId);
}

/* ─── Kill switch (Redis flag) ────────────────────────────────── */

async function setKillSwitch(tenantId, reason = 'manual', ttlSec = 86400) {
  try {
    const queue = getQueueForTenant(tenantId);
    await queue.client.set(`gestaozap:${tenantId}:kill-switch`, reason, 'EX', ttlSec);
    return true;
  } catch (e) {
    console.error('[guard] setKillSwitch:', e.message);
    return false;
  }
}

async function clearKillSwitch(tenantId) {
  try {
    const queue = getQueueForTenant(tenantId);
    await queue.client.del(`gestaozap:${tenantId}:kill-switch`);
    return true;
  } catch (_) { return false; }
}

async function getKillSwitch(tenantId) {
  try {
    const queue = getQueueForTenant(tenantId);
    return await queue.client.get(`gestaozap:${tenantId}:kill-switch`);
  } catch (_) { return null; }
}

/* ─── Helper de log (defensável por mensagem) ─────────────────── */

function defensiveLogContext(opts = {}) {
  return {
    tenant: opts.tenantId,
    sender: opts.sender || 'campaign',
    recipient_hash: opts.digits ? hashDigits(opts.digits) : null,
    use_case: opts.useCase || 'campaign',
    attempt: opts.attempt || 0,
  };
}

function hashDigits(digits) {
  // Hash leve (não criptográfico) só pra correlação sem expor número
  let h = 0;
  for (const c of String(digits)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16);
}

module.exports = {
  // Validação
  validateE164,

  // Pre-flight
  isRecipientRegistered,

  // Erros
  classifyError,
  computeBackoffMs,

  // Rate limit por destinatário
  tryReserveRecipient,
  releaseRecipientLock,

  // Quality gate
  recordAckResult,
  getErrorRate,
  isQualityGateBreached,
  resetQualityGate,
  QUALITY_GATE_THRESHOLD,

  // Kill switch
  setKillSwitch,
  clearKillSwitch,
  getKillSwitch,

  // Logs
  defensiveLogContext,
};
