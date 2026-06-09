import React from 'react';
import {
  ProductGrid2x2,
  ProductHeroList,
  ProductCarousel,
  ProductPriceList,
  ProductBannerTrio,
} from './layouts/ProductLayouts';
import {
  ServiceHeroBlocks,
  ServiceBeforeAfter,
  ServicePackages,
  ServiceTestimonial,
  ServicePortfolio,
} from './layouts/ServiceLayouts';

const COMPONENTS = {
  ProductGrid2x2,
  ProductHeroList,
  ProductCarousel,
  ProductPriceList,
  ProductBannerTrio,
  ServiceHeroBlocks,
  ServiceBeforeAfter,
  ServicePackages,
  ServiceTestimonial,
  ServicePortfolio,
};

export default function PromotionLayoutRenderer({ promotion, phone, onCta }) {
  const componentName = promotion?.layout?.schemaJson?.component
    || promotion?.layout?.schema_json?.component;
  const Comp = COMPONENTS[componentName];
  if (!Comp) {
    return (
      <div className="promo-layout promo-fallback">
        <p>Layout não disponível.</p>
      </div>
    );
  }
  return (
    <Comp
      content={promotion.contentJson || promotion.content_json || {}}
      phone={phone}
      onCta={onCta}
    />
  );
}
