import React from 'react';
import {
  slotValue, slotMedia, PromoMedia, PromoPrice, PromoCta, RichTextBlock,
} from '../shared';

function MediaCard({ content, slotKey, phone, onCta }) {
  const media = slotMedia(content, slotKey);
  if (!media?.url) return null;
  return (
    <div className="promo-card">
      <PromoMedia media={media} className="promo-card-img" />
      <PromoCta
        phone={phone}
        label={media.label}
        ctaText={media.ctaText}
        onClick={() => onCta?.(slotKey)}
      />
    </div>
  );
}

export function ProductGrid2x2({ content, phone, onCta }) {
  return (
    <div className="promo-layout product-grid-2x2">
      <RichTextBlock html={slotValue(content, 'headline')} className="promo-headline" />
      <div className="promo-grid-2">
        {['item1', 'item2', 'item3', 'item4'].map((k) => (
          <MediaCard key={k} content={content} slotKey={k} phone={phone} onCta={onCta} />
        ))}
      </div>
    </div>
  );
}

export function ProductHeroList({ content, phone, onCta }) {
  const hero = slotMedia(content, 'hero');
  return (
    <div className="promo-layout product-hero-list">
      {hero?.url && (
        <div className="promo-hero">
          <PromoMedia media={hero} className="promo-hero-img" />
          <PromoCta phone={phone} label={hero.label} ctaText={hero.ctaText} onClick={() => onCta?.('hero')} />
        </div>
      )}
      <RichTextBlock html={slotValue(content, 'desc')} />
      <PromoPrice
        original={slotValue(content, 'price_original')}
        discount={slotValue(content, 'price_discount')}
        pct={slotValue(content, 'discount_pct')}
      />
      <div className="promo-grid-2">
        {['item1', 'item2'].map((k) => (
          <MediaCard key={k} content={content} slotKey={k} phone={phone} onCta={onCta} />
        ))}
      </div>
    </div>
  );
}

export function ProductCarousel({ content, phone, onCta }) {
  const slides = ['slide1', 'slide2', 'slide3'].map((k) => slotMedia(content, k)).filter((s) => s?.url);
  return (
    <div className="promo-layout product-carousel">
      <RichTextBlock html={slotValue(content, 'headline')} className="promo-headline" />
      <div className="promo-carousel-track">
        {slides.map((media, i) => (
          <div key={i} className="promo-carousel-slide">
            <PromoMedia media={media} className="promo-card-img" />
            <PromoCta
              phone={phone}
              label={media.label}
              ctaText={media.ctaText}
              onClick={() => onCta?.(`slide${i + 1}`)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductPriceList({ content, phone, onCta }) {
  const items = [1, 2, 3];
  return (
    <div className="promo-layout product-price-list">
      <RichTextBlock html={slotValue(content, 'headline')} className="promo-headline" />
      {items.map((n) => {
        const media = slotMedia(content, `item${n}`);
        return (
          <div key={n} className="promo-price-row">
            {media?.url && <PromoMedia media={media} className="promo-price-thumb" />}
            <div className="promo-price-body">
              <PromoPrice
                original={slotValue(content, `price${n}_original`)}
                discount={slotValue(content, `price${n}_discount`)}
              />
              {media?.url && (
                <PromoCta
                  phone={phone}
                  label={media.label}
                  ctaText={media.ctaText}
                  onClick={() => onCta?.(`item${n}`)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProductBannerTrio({ content, phone, onCta }) {
  const banner = slotMedia(content, 'banner');
  return (
    <div className="promo-layout product-banner-trio">
      {banner?.url && <PromoMedia media={banner} className="promo-banner" />}
      <RichTextBlock html={slotValue(content, 'headline')} className="promo-headline" />
      <div className="promo-grid-3">
        {['offer1', 'offer2', 'offer3'].map((k) => (
          <MediaCard key={k} content={content} slotKey={k} phone={phone} onCta={onCta} />
        ))}
      </div>
    </div>
  );
}
