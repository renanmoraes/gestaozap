/**
 * Formata um número WhatsApp para exibição.
 * Aceita formatos como 5511987654321, 11987654321, ou 5531987654321.
 * Retorna no formato: +55 (11) 98765-4321
 */
export function formatPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');

  // 13 dígitos: 55 + DDD(2) + 9 dígitos do celular → +55 (11) 98765-4321
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  // 12 dígitos: 55 + DDD(2) + 8 dígitos (fixo) → +55 (11) 3456-7890
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  // 11 dígitos: DDD(2) + 9 dígitos → (11) 98765-4321
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  // 10 dígitos: DDD(2) + 8 dígitos (fixo) → (11) 3456-7890
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  // Caso não reconheça, devolve o original
  return raw;
}

/**
 * Máscara progressiva para input enquanto o usuário digita.
 * Aceita qualquer entrada, retorna apenas dígitos limitados a 13.
 */
export function maskPhoneInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 13);
}
