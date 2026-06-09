import { COMPONENT_TO_PATTERN, createEmptyItem } from './layoutPatterns';

function readValue(raw) {
  if (raw == null) return '';
  if (typeof raw === 'object' && raw.value != null) return String(raw.value);
  if (typeof raw === 'string') return raw;
  return '';
}

function readMedia(raw, fallbackLabel) {
  if (!raw || typeof raw !== 'object') return null;
  const url = raw.mediaPath || raw.media_path || raw.url;
  if (!url && !raw.ctaText) return null;
  return {
    id: raw.id || crypto.randomUUID(),
    title: raw.label || raw.title || fallbackLabel,
    description: readValue(raw.description) || '',
    mediaPath: url || null,
    mediaType: raw.mediaType || raw.media_type || 'image',
    priceOriginal: raw.priceOriginal || readValue(raw.price_original) || '',
    priceDiscount: raw.priceDiscount || readValue(raw.price_discount) || '',
    ctaText: raw.ctaText || raw.cta_text || '',
  };
}

function extractLegacyItems(content, schema) {
  const items = [];
  const slots = schema?.slots || [];
  const mediaKeys = slots.filter((s) => s.type === 'media').map((s) => s.key);

  for (const key of mediaKeys) {
    const item = readMedia(content[key], key);
    if (item?.mediaPath) items.push({ ...item, id: item.id || key });
  }

  // price-list legacy: pair prices with items
  if (schema?.component === 'ProductPriceList') {
    return [1, 2, 3].map((n) => {
      const media = readMedia(content[`item${n}`], `Item ${n}`);
      if (!media) return null;
      return {
        ...media,
        id: media.id || `item${n}`,
        priceOriginal: readValue(content[`price${n}_original`]),
        priceDiscount: readValue(content[`price${n}_discount`]),
      };
    }).filter(Boolean);
  }

  // packages legacy
  if (schema?.component === 'ServicePackages') {
    return [1, 2, 3].map((n) => {
      const media = readMedia(content[`pkg${n}`], `Pacote ${n}`);
      if (!media) return null;
      return {
        ...media,
        id: media.id || `pkg${n}`,
        description: readValue(content[`pkg${n}_desc`]) || media.description,
      };
    }).filter(Boolean);
  }

  return items;
}

export function normalizePromotionContent(contentJson, layout) {
  const content = contentJson || {};
  const schema = layout?.schemaJson || layout?.schema_json || {};

  if (Array.isArray(content.items) && content.items.length) {
    return {
      headline: content.headline || readValue(content.headline) || '',
      subtitle: content.subtitle || readValue(content.subtitle) || readValue(content.desc) || '',
      banner: content.banner?.mediaPath || content.banner?.url
        ? content.banner
        : readMedia(content.banner, 'Banner') || (content.banner || null),
      items: content.items.map((item, i) => ({
        id: item.id || `item-${i}`,
        title: item.title || `Item ${i + 1}`,
        description: item.description || '',
        mediaPath: item.mediaPath || item.media_path || item.url || null,
        mediaType: item.mediaType || item.media_type || 'image',
        priceOriginal: item.priceOriginal ?? item.price_original ?? '',
        priceDiscount: item.priceDiscount ?? item.price_discount ?? '',
        ctaText: item.ctaText || item.cta_text || '',
      })),
    };
  }

  const legacyItems = extractLegacyItems(content, schema);
  const headline = readValue(content.headline) || readValue(content.quote) || '';
  const subtitle = readValue(content.desc) || readValue(content.subtitle) || readValue(content.cta_block) || '';
  const banner = readMedia(content.banner, 'Banner') || readMedia(content.hero, 'Destaque');

  if (legacyItems.length) {
    return { headline, subtitle, banner, items: legacyItems };
  }

  if (banner && !legacyItems.length) {
    return {
      headline,
      subtitle,
      banner: null,
      items: [{ ...banner, id: banner.id || 'hero' }],
    };
  }

  return {
    headline,
    subtitle,
    banner: null,
    items: [createEmptyItem('Item 1')],
  };
}

export function computeItemDiscountPct(original, discount) {
  const o = parseFloat(String(original || '').replace(',', '.'));
  const d = parseFloat(String(discount || '').replace(',', '.'));
  if (!o || !d || d >= o) return null;
  return Math.round(((o - d) / o) * 100);
}

export function getPatternFromLayout(layout) {
  const schema = layout?.schemaJson || layout?.schema_json || {};
  return schema.pattern || COMPONENT_TO_PATTERN[schema.component] || 'grid';
}
