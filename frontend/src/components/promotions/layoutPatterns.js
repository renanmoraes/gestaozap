/** Padrões visuais — posicionamento fixo, quantidade de itens livre */

export const PATTERNS = {
  grid: {
    id: 'grid',
    label: 'Grade',
    description: 'Cards em 2 colunas — ideal para vários produtos',
    category: 'product',
    minItems: 1,
    maxItems: 24,
    showPrices: true,
  },
  carousel: {
    id: 'carousel',
    label: 'Carrossel',
    description: 'Deslize horizontal — destaque um por vez',
    category: 'product',
    minItems: 1,
    maxItems: 20,
    showPrices: true,
  },
  'price-list': {
    id: 'price-list',
    label: 'Lista com preço',
    description: 'Lista vertical com preço riscado',
    category: 'product',
    minItems: 1,
    maxItems: 20,
    showPrices: true,
  },
  'hero-list': {
    id: 'hero-list',
    label: 'Destaque + lista',
    description: 'Primeiro item grande, demais em grade',
    category: 'product',
    minItems: 1,
    maxItems: 16,
    showPrices: true,
  },
  'banner-grid': {
    id: 'banner-grid',
    label: 'Banner + ofertas',
    description: 'Faixa no topo e cards abaixo',
    category: 'product',
    minItems: 1,
    maxItems: 12,
    showPrices: true,
    hasBanner: true,
  },
  stack: {
    id: 'stack',
    label: 'Cards empilhados',
    description: 'Serviços um abaixo do outro',
    category: 'service',
    minItems: 1,
    maxItems: 16,
    showPrices: false,
  },
  'before-after': {
    id: 'before-after',
    label: 'Antes e depois',
    description: 'Duas fotos lado a lado',
    category: 'service',
    minItems: 2,
    maxItems: 2,
    showPrices: true,
    fixedLabels: ['Antes', 'Depois'],
  },
};

export const COMPONENT_TO_PATTERN = {
  ProductGrid2x2: 'grid',
  ServicePortfolio: 'grid',
  ProductCarousel: 'carousel',
  ProductPriceList: 'price-list',
  ProductHeroList: 'hero-list',
  ServiceHeroBlocks: 'hero-list',
  ProductBannerTrio: 'banner-grid',
  ServicePackages: 'stack',
  ServiceTestimonial: 'stack',
  ServiceBeforeAfter: 'before-after',
};

export function getLayoutPattern(layout) {
  const schema = layout?.schemaJson || layout?.schema_json || {};
  if (schema.pattern) return PATTERNS[schema.pattern] || PATTERNS.grid;
  const fromComponent = COMPONENT_TO_PATTERN[schema.component];
  return PATTERNS[fromComponent] || PATTERNS.grid;
}

export function getLayoutPatternId(layout) {
  const schema = layout?.schemaJson || layout?.schema_json || {};
  return schema.pattern || COMPONENT_TO_PATTERN[schema.component] || 'grid';
}

export function createEmptyItem(label = 'Novo item') {
  return {
    id: crypto.randomUUID(),
    title: label,
    description: '',
    mediaPath: null,
    mediaType: 'image',
    priceOriginal: '',
    priceDiscount: '',
    ctaText: '',
  };
}

export function createDefaultContent(patternId, category = 'product') {
  const pattern = PATTERNS[patternId] || PATTERNS.grid;
  const label = category === 'service' ? 'Serviço' : 'Produto';
  const count = patternId === 'before-after' ? 2 : 1;
  const items = [];
  for (let i = 0; i < count; i++) {
    const fixed = pattern.fixedLabels?.[i];
    items.push(createEmptyItem(fixed || `${label} ${i + 1}`));
  }
  return {
    headline: '',
    subtitle: '',
    banner: null,
    items,
  };
}
