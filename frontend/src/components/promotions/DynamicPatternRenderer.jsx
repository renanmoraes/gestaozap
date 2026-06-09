import React from 'react';
import { resolveCampaignImageUrl } from '../../utils/upload';
import { buildWhatsAppLink, defaultCtaMessage } from '../../utils/whatsappLink';
import { MessageCircle } from 'lucide-react';
import { computeItemDiscountPct } from './normalizeContent';
import { getLayoutPatternId } from './layoutPatterns';

function formatBrl(value) {
  if (!value) return '';
  const n = parseFloat(String(value).replace(',', '.'));
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ItemMedia({ item, className }) {
  if (!item?.mediaPath) return null;
  const src = resolveCampaignImageUrl(item.mediaPath);
  if (item.mediaType === 'video') {
    return <video className={className} src={src} controls playsInline preload="metadata" />;
  }
  return <img className={className} src={src} alt={item.title || ''} loading="lazy" />;
}

function ItemCta({ item, phone, onCta }) {
  const msg = item.ctaText || defaultCtaMessage(item.title);
  const href = buildWhatsAppLink(phone, msg);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="promo-cta"
      onClick={() => onCta?.(item.id)}
    >
      <MessageCircle className="w-4 h-4" />
      WhatsApp
    </a>
  );
}

function ItemPrices({ item }) {
  if (!item.priceOriginal && !item.priceDiscount) return null;
  const pct = computeItemDiscountPct(item.priceOriginal, item.priceDiscount);
  return (
    <div className="promo-prices">
      {item.priceOriginal && <span className="promo-price-original">{formatBrl(item.priceOriginal)}</span>}
      {item.priceDiscount && <span className="promo-price-discount">{formatBrl(item.priceDiscount)}</span>}
      {pct != null && <span className="promo-price-pct">-{pct}%</span>}
    </div>
  );
}

function ItemCard({ item, phone, onCta, variant = 'grid' }) {
  if (!item.mediaPath && !item.title && !item.description) return null;
  return (
    <article className={`promo-item promo-item--${variant}`}>
      <ItemMedia item={item} className="promo-card-img" />
      <div className="promo-item-body">
        {item.title && <h3 className="promo-item-title">{item.title}</h3>}
        {item.description && <p className="promo-item-desc">{item.description}</p>}
        <ItemPrices item={item} />
        <ItemCta item={item} phone={phone} onCta={onCta} />
      </div>
    </article>
  );
}

function PatternGrid({ items, phone, onCta }) {
  const visible = items.filter((i) => i.mediaPath || i.title);
  return (
    <div className="promo-grid-2 promo-grid-dynamic">
      {visible.map((item) => (
        <ItemCard key={item.id} item={item} phone={phone} onCta={onCta} variant="grid" />
      ))}
    </div>
  );
}

function PatternCarousel({ items, phone, onCta }) {
  const visible = items.filter((i) => i.mediaPath || i.title);
  return (
    <div className="promo-carousel-track">
      {visible.map((item) => (
        <div key={item.id} className="promo-carousel-slide">
          <ItemMedia item={item} className="promo-card-img" />
          <div className="promo-item-body">
            {item.title && <h3 className="promo-item-title">{item.title}</h3>}
            <ItemPrices item={item} />
            <ItemCta item={item} phone={phone} onCta={onCta} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PatternPriceList({ items, phone, onCta }) {
  const visible = items.filter((i) => i.mediaPath || i.title || i.priceDiscount);
  return (
    <div className="promo-price-list-dynamic">
      {visible.map((item) => (
        <div key={item.id} className="promo-price-row">
          <ItemMedia item={item} className="promo-price-thumb" />
          <div className="promo-price-body">
            {item.title && <h3 className="promo-item-title">{item.title}</h3>}
            {item.description && <p className="promo-item-desc">{item.description}</p>}
            <ItemPrices item={item} />
            <ItemCta item={item} phone={phone} onCta={onCta} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PatternHeroList({ items, phone, onCta }) {
  const visible = items.filter((i) => i.mediaPath || i.title);
  if (!visible.length) return null;
  const [hero, ...rest] = visible;
  return (
    <>
      <div className="promo-hero">
        <ItemMedia item={hero} className="promo-hero-img" />
        <div className="promo-item-body">
          {hero.title && <h3 className="promo-item-title promo-item-title--hero">{hero.title}</h3>}
          {hero.description && <p className="promo-item-desc">{hero.description}</p>}
          <ItemPrices item={hero} />
          <ItemCta item={hero} phone={phone} onCta={onCta} />
        </div>
      </div>
      {rest.length > 0 && (
        <div className="promo-grid-2 promo-grid-dynamic">
          {rest.map((item) => (
            <ItemCard key={item.id} item={item} phone={phone} onCta={onCta} />
          ))}
        </div>
      )}
    </>
  );
}

function PatternBannerGrid({ content, items, phone, onCta }) {
  const banner = content.banner;
  return (
    <>
      {banner?.mediaPath && (
        <div className="promo-banner-wrap">
          <ItemMedia item={banner} className="promo-banner" />
        </div>
      )}
      <PatternGrid items={items} phone={phone} onCta={onCta} />
    </>
  );
}

function PatternStack({ items, phone, onCta }) {
  const visible = items.filter((i) => i.mediaPath || i.title || i.description);
  return (
    <div className="promo-stack">
      {visible.map((item) => (
        <article key={item.id} className="promo-stack-card">
          <ItemMedia item={item} className="promo-stack-img" />
          <div className="promo-item-body">
            {item.title && <h3 className="promo-item-title">{item.title}</h3>}
            {item.description && <p className="promo-item-desc">{item.description}</p>}
            <ItemPrices item={item} />
            <ItemCta item={item} phone={phone} onCta={onCta} />
          </div>
        </article>
      ))}
    </div>
  );
}

function PatternBeforeAfter({ items, phone, onCta, subtitle }) {
  const [before, after] = items;
  return (
    <>
      <div className="promo-ba-grid">
        {before && (
          <div>
            <span className="promo-ba-label">Antes</span>
            <ItemMedia item={before} className="promo-card-img" />
          </div>
        )}
        {after && (
          <div>
            <span className="promo-ba-label">Depois</span>
            <ItemMedia item={after} className="promo-card-img" />
            <ItemCta item={after} phone={phone} onCta={onCta} />
          </div>
        )}
      </div>
      {subtitle && <p className="promo-subtitle">{subtitle}</p>}
      {after && <ItemPrices item={after} />}
    </>
  );
}

const RENDERERS = {
  grid: PatternGrid,
  carousel: PatternCarousel,
  'price-list': PatternPriceList,
  'hero-list': PatternHeroList,
  'banner-grid': PatternBannerGrid,
  stack: PatternStack,
  'before-after': PatternBeforeAfter,
};

export default function DynamicPatternRenderer({ layout, content, phone, onCta }) {
  const patternId = getLayoutPatternId(layout);
  const PatternBody = RENDERERS[patternId] || PatternGrid;
  const items = content?.items || [];

  return (
    <div className={`promo-layout promo-pattern-${patternId}`}>
      {content.headline && <h2 className="promo-headline">{content.headline}</h2>}
      {patternId !== 'before-after' && content.subtitle && (
        <p className="promo-subtitle">{content.subtitle}</p>
      )}
      {patternId === 'banner-grid' ? (
        <PatternBannerGrid content={content} items={items} phone={phone} onCta={onCta} />
      ) : patternId === 'before-after' ? (
        <PatternBeforeAfter items={items} phone={phone} onCta={onCta} subtitle={content.subtitle} />
      ) : (
        <PatternBody items={items} phone={phone} onCta={onCta} />
      )}
    </div>
  );
}
