const DEFAULT_PROMOTION_LAYOUTS = [
  {
    slug: 'product-grid-2x2',
    name: 'Grade 2×2',
    category: 'product',
    sort_order: 1,
    schema_json: { pattern: 'grid', component: 'ProductGrid2x2' },
  },
  {
    slug: 'product-hero-list',
    name: 'Destaque + lista',
    category: 'product',
    sort_order: 2,
    schema_json: { pattern: 'hero-list', component: 'ProductHeroList' },
  },
  {
    slug: 'product-carousel',
    name: 'Carrossel',
    category: 'product',
    sort_order: 3,
    schema_json: { pattern: 'carousel', component: 'ProductCarousel' },
  },
  {
    slug: 'product-price-list',
    name: 'Lista com preço',
    category: 'product',
    sort_order: 4,
    schema_json: { pattern: 'price-list', component: 'ProductPriceList' },
  },
  {
    slug: 'product-banner-trio',
    name: 'Banner + ofertas',
    category: 'product',
    sort_order: 5,
    schema_json: { pattern: 'banner-grid', component: 'ProductBannerTrio', hasBanner: true },
  },
  {
    slug: 'service-hero-blocks',
    name: 'Cards empilhados',
    category: 'service',
    sort_order: 6,
    schema_json: { pattern: 'stack', component: 'ServiceHeroBlocks' },
  },
  {
    slug: 'service-before-after',
    name: 'Antes e depois',
    category: 'service',
    sort_order: 7,
    schema_json: { pattern: 'before-after', component: 'ServiceBeforeAfter' },
  },
  {
    slug: 'service-packages',
    name: 'Pacotes horizontais',
    category: 'service',
    sort_order: 8,
    schema_json: { pattern: 'stack', component: 'ServicePackages' },
  },
  {
    slug: 'service-testimonial',
    name: 'Depoimento + CTA',
    category: 'service',
    sort_order: 9,
    schema_json: { pattern: 'stack', component: 'ServiceTestimonial' },
  },
  {
    slug: 'service-portfolio',
    name: 'Portfólio em grade',
    category: 'service',
    sort_order: 10,
    schema_json: { pattern: 'grid', component: 'ServicePortfolio' },
  },
];

async function seedPromotionLayouts(pool) {
  const client = await pool.connect();
  try {
    for (const layout of DEFAULT_PROMOTION_LAYOUTS) {
      await client.query(`
        INSERT INTO promotion_layouts (slug, name, category, schema_json, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          schema_json = EXCLUDED.schema_json,
          sort_order = EXCLUDED.sort_order
      `, [layout.slug, layout.name, layout.category, JSON.stringify(layout.schema_json), layout.sort_order]);
    }
    console.log('[db] promotion layouts seed aplicado');
  } finally {
    client.release();
  }
}

module.exports = { DEFAULT_PROMOTION_LAYOUTS, seedPromotionLayouts };
