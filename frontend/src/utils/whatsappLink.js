/** Normaliza telefone BR para wa.me (somente dígitos, com DDI 55). */
export function normalizeWhatsAppPhone(phone) {
  if (!phone) return '';
  let d = String(phone).replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

export function buildWhatsAppLink(phone, message) {
  const p = normalizeWhatsAppPhone(phone);
  if (!p) return null;
  const text = message ? encodeURIComponent(message) : '';
  return `https://wa.me/${p}${text ? `?text=${text}` : ''}`;
}

export function defaultCtaMessage(label) {
  const name = label || 'esta oferta';
  return `Olá! Gostaria de saber mais sobre ${name}.`;
}
