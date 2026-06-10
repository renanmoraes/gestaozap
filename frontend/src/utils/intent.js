// Helpers de intenção (frontend). Temperatura é calculada dinamicamente
// a partir da data de detecção vs. a data de referência (hoje), nunca salva.

export const INTENT_LABELS = {
  pricing: 'Interesse em preço',
  trial: 'Quer testar',
  support: 'Pediu suporte',
  human: 'Quer atendente',
  cancel: 'Risco de cancelamento',
  payment: 'Falou de pagamento',
  complaint: 'Reclamação',
  positive_feedback: 'Elogio',
  opt_out: 'Pediu para sair',
  schedule: 'Quer agendar',
  business_hours: 'Perguntou horário',
  location: 'Perguntou local',
  purchase_intent: 'Intenção de compra',
  renewal: 'Quer renovar',
  upgrade: 'Quer upgrade',
  downgrade: 'Quer downgrade',
  lost_lead: 'Perdeu interesse',
  competitor: 'Citou concorrente',
  // Genéricas para pequenos negócios
  warranty_exchange: 'Troca / garantia',
  urgent: 'Urgência',
  reschedule: 'Quer remarcar',
  order_status: 'Status do pedido',
  delivery: 'Entrega / frete',
  invoice: 'Pediu nota fiscal',
  discount_request: 'Pediu desconto',
  product_availability: 'Disponibilidade',
  catalog_request: 'Pediu catálogo',
};

export function intentLabel(key) {
  return INTENT_LABELS[key] || key;
}

export const TEMPERATURE_META = {
  hot:     { label: 'quente',    cls: 'bg-red-50 text-red-600 border-red-100' },
  warm:    { label: 'morna',     cls: 'bg-orange-50 text-orange-600 border-orange-100' },
  cool:    { label: 'fria',      cls: 'bg-sky-50 text-sky-600 border-sky-100' },
  cold:    { label: 'gelada',    cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  expired: { label: 'expirada',  cls: 'bg-slate-100 text-slate-400 border-slate-200' },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function diffInDays(date, ref = new Date()) {
  const d = new Date(date).getTime();
  const r = new Date(ref).getTime();
  return Math.floor((r - d) / MS_PER_DAY);
}

export function getTemperature(date, ref = new Date()) {
  const days = diffInDays(date, ref);
  if (days <= 7) return 'hot';
  if (days <= 30) return 'warm';
  if (days <= 90) return 'cool';
  if (days <= 365) return 'cold';
  return 'expired';
}

export function daysAgoLabel(date, ref = new Date()) {
  const days = diffInDays(date, ref);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  if (days < 365) return `há ${Math.floor(days / 30)} meses`;
  return `há ${Math.floor(days / 365)} ano(s)`;
}
