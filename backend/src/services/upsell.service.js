// Sugestões de upsell não-invasivas: produtos (features) que o tenant ainda
// pode pegar — addons pagos que ele não tem, e features gratuitas para conhecer.
// Alimenta os banners no painel. CTA registra interesse via feature_requests.

const { listTenantFeatures, requestFeature } = require('./feature.service');

// Copy curada por produto (pitch comercial). Fallback = description da feature.
const PRODUCT_META = {
  intencoes: {
    pitch: 'Saiba automaticamente quem pediu preço, quer agendar ou está insatisfeito — e priorize esses contatos nas suas campanhas.',
    route: '/intencoes',
    emoji: '🎯',
  },
  'vitrine-promocoes': {
    pitch: 'Monte um panfleto online de promoções e capture leads direto no seu WhatsApp.',
    route: '/promotions',
    emoji: '🛍️',
  },
  agendamentos: {
    pitch: 'Deixe seus clientes marcarem horário sozinhos pela sua página de agendamento.',
    route: '/bookings',
    emoji: '📅',
  },
};

/**
 * Lista sugestões para o tenant.
 * - addon pago que ele NÃO tem (e não está incluso no plano) → upsell ("Tenho interesse")
 * - feature gratuita → discover ("Conhecer")
 */
async function getSuggestions(db, tenantId) {
  const rows = await listTenantFeatures(db, tenantId);
  const suggestions = [];

  for (const f of rows) {
    if (!f.active) continue;
    const meta = PRODUCT_META[f.slug] || {};
    const base = {
      key: `feature:${f.slug}`,
      featureSlug: f.slug,
      title: f.name,
      pitch: meta.pitch || f.description || '',
      emoji: meta.emoji || '✨',
      route: meta.route || null,
    };

    if (f.isFree) {
      // Disponível a todos — nudge para conhecer/usar mais.
      suggestions.push({ ...base, type: 'discover', ctaLabel: 'Conhecer', priceBrl: null });
    } else if (!f.tenantActive) {
      // Addon pago que o tenant ainda não tem.
      suggestions.push({ ...base, type: 'upsell', ctaLabel: 'Tenho interesse', priceBrl: f.priceBrl });
    }
  }

  return suggestions;
}

/** Registra interesse num addon (idempotente — reusa feature_request pendente). */
async function registerInterest(db, tenantId, featureSlug) {
  return requestFeature(db, tenantId, featureSlug, 'Interesse manifestado via banner de upsell.');
}

module.exports = { getSuggestions, registerInterest, PRODUCT_META };
