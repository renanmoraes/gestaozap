const DEFAULT_PROMOTION_LAYOUTS = [
  {
    slug: 'product-grid-2x2',
    name: 'Grade 2×2',
    category: 'product',
    sort_order: 1,
    schema_json: {
      component: 'ProductGrid2x2',
      slots: [
        { key: 'item1', type: 'media', label: 'Produto 1', cta: true },
        { key: 'item2', type: 'media', label: 'Produto 2', cta: true },
        { key: 'item3', type: 'media', label: 'Produto 3', cta: true },
        { key: 'item4', type: 'media', label: 'Produto 4', cta: true },
        { key: 'headline', type: 'richtext', label: 'Título da vitrine', maxChars: 120 },
      ],
    },
  },
  {
    slug: 'product-hero-list',
    name: 'Destaque + lista',
    category: 'product',
    sort_order: 2,
    schema_json: {
      component: 'ProductHeroList',
      slots: [
        { key: 'hero', type: 'media', label: 'Imagem principal', cta: true },
        { key: 'desc', type: 'richtext', label: 'Descrição', maxChars: 800 },
        { key: 'price_original', type: 'money', label: 'Preço original', optional: true },
        { key: 'price_discount', type: 'money', label: 'Preço promocional', optional: true },
        { key: 'discount_pct', type: 'percent', label: 'Desconto %', optional: true, computed: true },
        { key: 'item1', type: 'media', label: 'Oferta extra 1', cta: true, optional: true },
        { key: 'item2', type: 'media', label: 'Oferta extra 2', cta: true, optional: true },
      ],
    },
  },
  {
    slug: 'product-carousel',
    name: 'Carrossel de cards',
    category: 'product',
    sort_order: 3,
    schema_json: {
      component: 'ProductCarousel',
      slots: [
        { key: 'slide1', type: 'media', label: 'Slide 1', cta: true },
        { key: 'slide2', type: 'media', label: 'Slide 2', cta: true },
        { key: 'slide3', type: 'media', label: 'Slide 3', cta: true },
        { key: 'headline', type: 'richtext', label: 'Chamada', maxChars: 200 },
      ],
    },
  },
  {
    slug: 'product-price-list',
    name: 'Lista com preço riscado',
    category: 'product',
    sort_order: 4,
    schema_json: {
      component: 'ProductPriceList',
      slots: [
        { key: 'headline', type: 'richtext', label: 'Título', maxChars: 120 },
        { key: 'item1', type: 'media', label: 'Item 1', cta: true },
        { key: 'price1_original', type: 'money', label: 'Preço 1 original', optional: true },
        { key: 'price1_discount', type: 'money', label: 'Preço 1 promo', optional: true },
        { key: 'item2', type: 'media', label: 'Item 2', cta: true },
        { key: 'price2_original', type: 'money', label: 'Preço 2 original', optional: true },
        { key: 'price2_discount', type: 'money', label: 'Preço 2 promo', optional: true },
        { key: 'item3', type: 'media', label: 'Item 3', cta: true },
        { key: 'price3_original', type: 'money', label: 'Preço 3 original', optional: true },
        { key: 'price3_discount', type: 'money', label: 'Preço 3 promo', optional: true },
      ],
    },
  },
  {
    slug: 'product-banner-trio',
    name: 'Banner + 3 ofertas',
    category: 'product',
    sort_order: 5,
    schema_json: {
      component: 'ProductBannerTrio',
      slots: [
        { key: 'banner', type: 'media', label: 'Banner principal', cta: false },
        { key: 'headline', type: 'richtext', label: 'Texto do banner', maxChars: 300 },
        { key: 'offer1', type: 'media', label: 'Oferta 1', cta: true },
        { key: 'offer2', type: 'media', label: 'Oferta 2', cta: true },
        { key: 'offer3', type: 'media', label: 'Oferta 3', cta: true },
      ],
    },
  },
  {
    slug: 'service-hero-blocks',
    name: 'Hero visual + blocos',
    category: 'service',
    sort_order: 6,
    schema_json: {
      component: 'ServiceHeroBlocks',
      slots: [
        { key: 'hero', type: 'media', label: 'Imagem ou vídeo principal', cta: true },
        { key: 'desc', type: 'richtext', label: 'Apresentação do serviço', maxChars: 800 },
        { key: 'block1', type: 'richtext', label: 'Bloco 1', maxChars: 300 },
        { key: 'block2', type: 'richtext', label: 'Bloco 2', maxChars: 300 },
        { key: 'block3', type: 'richtext', label: 'Bloco 3', maxChars: 300 },
      ],
    },
  },
  {
    slug: 'service-before-after',
    name: 'Antes e depois',
    category: 'service',
    sort_order: 7,
    schema_json: {
      component: 'ServiceBeforeAfter',
      slots: [
        { key: 'before', type: 'media', label: 'Antes', cta: false },
        { key: 'after', type: 'media', label: 'Depois', cta: true },
        { key: 'desc', type: 'richtext', label: 'Descrição do resultado', maxChars: 600 },
        { key: 'price_discount', type: 'money', label: 'Preço promocional', optional: true },
      ],
    },
  },
  {
    slug: 'service-packages',
    name: 'Pacotes horizontais',
    category: 'service',
    sort_order: 8,
    schema_json: {
      component: 'ServicePackages',
      slots: [
        { key: 'headline', type: 'richtext', label: 'Título', maxChars: 120 },
        { key: 'pkg1', type: 'media', label: 'Pacote 1', cta: true },
        { key: 'pkg1_desc', type: 'richtext', label: 'Descrição pacote 1', maxChars: 200 },
        { key: 'pkg2', type: 'media', label: 'Pacote 2', cta: true },
        { key: 'pkg2_desc', type: 'richtext', label: 'Descrição pacote 2', maxChars: 200 },
        { key: 'pkg3', type: 'media', label: 'Pacote 3', cta: true },
        { key: 'pkg3_desc', type: 'richtext', label: 'Descrição pacote 3', maxChars: 200 },
      ],
    },
  },
  {
    slug: 'service-testimonial',
    name: 'Depoimento + CTA',
    category: 'service',
    sort_order: 9,
    schema_json: {
      component: 'ServiceTestimonial',
      slots: [
        { key: 'hero', type: 'media', label: 'Foto do serviço', cta: true },
        { key: 'quote', type: 'richtext', label: 'Depoimento', maxChars: 400 },
        { key: 'author', type: 'richtext', label: 'Nome do cliente', maxChars: 80 },
        { key: 'desc', type: 'richtext', label: 'Detalhes da oferta', maxChars: 500 },
      ],
    },
  },
  {
    slug: 'service-portfolio',
    name: 'Vitrine portfólio',
    category: 'service',
    sort_order: 10,
    schema_json: {
      component: 'ServicePortfolio',
      slots: [
        { key: 'headline', type: 'richtext', label: 'Título', maxChars: 120 },
        { key: 'work1', type: 'media', label: 'Trabalho 1', cta: true },
        { key: 'work2', type: 'media', label: 'Trabalho 2', cta: true },
        { key: 'work3', type: 'media', label: 'Trabalho 3', cta: true },
        { key: 'work4', type: 'media', label: 'Trabalho 4', cta: true },
        { key: 'cta_block', type: 'richtext', label: 'Chamada final', maxChars: 200 },
      ],
    },
  },
];

async function seedPromotionLayouts(pool) {
  const client = await pool.connect();
  try {
    for (const layout of DEFAULT_PROMOTION_LAYOUTS) {
      await client.query(`
        INSERT INTO promotion_layouts (slug, name, category, schema_json, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (slug) DO NOTHING
      `, [layout.slug, layout.name, layout.category, JSON.stringify(layout.schema_json), layout.sort_order]);
    }
    console.log('[db] promotion layouts seed aplicado');
  } finally {
    client.release();
  }
}

module.exports = { DEFAULT_PROMOTION_LAYOUTS, seedPromotionLayouts };
