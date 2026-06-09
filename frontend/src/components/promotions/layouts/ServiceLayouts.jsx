import React from 'react';
import {
  slotValue, slotMedia, PromoMedia, PromoPrice, PromoCta, RichTextBlock,
} from '../shared';

export function ServiceHeroBlocks({ content, phone, onCta }) {
  const hero = slotMedia(content, 'hero');
  return (
    <div className="promo-layout service-hero-blocks">
      {hero?.url && (
        <div className="promo-hero">
          <PromoMedia media={hero} className="promo-hero-img" />
          <PromoCta phone={phone} label={hero.label} ctaText={hero.ctaText} onClick={() => onCta?.('hero')} />
        </div>
      )}
      <RichTextBlock html={slotValue(content, 'desc')} />
      <div className="promo-blocks">
        {['block1', 'block2', 'block3'].map((k) => (
          <div key={k} className="promo-block">
            <RichTextBlock html={slotValue(content, k)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ServiceBeforeAfter({ content, phone, onCta }) {
  const before = slotMedia(content, 'before');
  const after = slotMedia(content, 'after');
  return (
    <div className="promo-layout service-before-after">
      <div className="promo-ba-grid">
        {before?.url && (
          <div>
            <span className="promo-ba-label">Antes</span>
            <PromoMedia media={before} className="promo-card-img" />
          </div>
        )}
        {after?.url && (
          <div>
            <span className="promo-ba-label">Depois</span>
            <PromoMedia media={after} className="promo-card-img" />
            <PromoCta phone={phone} label={after.label} ctaText={after.ctaText} onClick={() => onCta?.('after')} />
          </div>
        )}
      </div>
      <RichTextBlock html={slotValue(content, 'desc')} />
      <PromoPrice discount={slotValue(content, 'price_discount')} />
    </div>
  );
}

export function ServicePackages({ content, phone, onCta }) {
  return (
    <div className="promo-layout service-packages">
      <RichTextBlock html={slotValue(content, 'headline')} className="promo-headline" />
      <div className="promo-packages-row">
        {[1, 2, 3].map((n) => {
          const media = slotMedia(content, `pkg${n}`);
          return (
            <div key={n} className="promo-package">
              {media?.url && <PromoMedia media={media} className="promo-card-img" />}
              <RichTextBlock html={slotValue(content, `pkg${n}_desc`)} />
              {media?.url && (
                <PromoCta
                  phone={phone}
                  label={media.label}
                  ctaText={media.ctaText}
                  onClick={() => onCta?.(`pkg${n}`)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ServiceTestimonial({ content, phone, onCta }) {
  const hero = slotMedia(content, 'hero');
  return (
    <div className="promo-layout service-testimonial">
      {hero?.url && <PromoMedia media={hero} className="promo-hero-img" />}
      <blockquote className="promo-quote">
        <RichTextBlock html={slotValue(content, 'quote')} />
        <cite><RichTextBlock html={slotValue(content, 'author')} /></cite>
      </blockquote>
      <RichTextBlock html={slotValue(content, 'desc')} />
      {hero?.url && (
        <PromoCta phone={phone} label={hero.label} ctaText={hero.ctaText} onClick={() => onCta?.('hero')} />
      )}
    </div>
  );
}

export function ServicePortfolio({ content, phone, onCta }) {
  return (
    <div className="promo-layout service-portfolio">
      <RichTextBlock html={slotValue(content, 'headline')} className="promo-headline" />
      <div className="promo-grid-2">
        {['work1', 'work2', 'work3', 'work4'].map((k) => {
          const media = slotMedia(content, k);
          if (!media?.url) return null;
          return (
            <div key={k} className="promo-card">
              <PromoMedia media={media} className="promo-card-img" />
              <PromoCta
                phone={phone}
                label={media.label}
                ctaText={media.ctaText}
                onClick={() => onCta?.(k)}
              />
            </div>
          );
        })}
      </div>
      <RichTextBlock html={slotValue(content, 'cta_block')} className="promo-footer-cta" />
    </div>
  );
}
