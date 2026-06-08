/**
 * Normaliza número para o formato de dígitos usado pelo WhatsApp Web (chatId sem @c.us).
 * Brasil: aceita com ou sem +55; números só com DDD (10–11 dígitos) recebem o prefixo 55.
 */
function normalizePhoneForWhatsApp(input) {
  if (input === undefined || input === null) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  let d = raw.replace(/\D/g, '');
  if (!d) return '';

  // Formato nacional com 0 antes do DDD (ex.: 031...)
  if (d.length >= 11 && d.startsWith('0')) {
    d = d.replace(/^0+/, '');
  }

  // Já inclui código do país (55 + DDD + número)
  if (d.startsWith('55') && d.length >= 12) {
    return d;
  }

  // Só DDD + número (celular 11 dígitos ou fixo 10)
  if (d.length === 10 || d.length === 11) {
    return `55${d}`;
  }

  // Outros casos: devolve só dígitos (ex.: outro país digitado com código completo)
  return d;
}

/** Várias chaves para cruzar o mesmo número (fila vs log podem estar em formatos diferentes). */
function collectPhoneKeys(input) {
  const keys = new Set();
  const raw = String(input ?? '').trim();
  const n = normalizePhoneForWhatsApp(raw);
  if (n) keys.add(n);

  let d = raw.replace(/\D/g, '');
  if (!d.length) return [...keys];

  keys.add(d);
  if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) {
    keys.add(`55${d}`);
  }
  if (d.startsWith('55') && d.length >= 12) {
    keys.add(d.slice(2));
  }
  const tail9 = d.slice(-9);
  const tail10 = d.slice(-10);
  const tail11 = d.slice(-11);
  if (tail9.length === 9) keys.add(tail9);
  if (tail10.length === 10) keys.add(tail10);
  if (tail11.length === 11) keys.add(tail11);

  return [...keys];
}

function phonesMatchLoose(a, b) {
  const sa = new Set(collectPhoneKeys(a));
  return collectPhoneKeys(b).some((k) => sa.has(k));
}

module.exports = { normalizePhoneForWhatsApp, collectPhoneKeys, phonesMatchLoose };
