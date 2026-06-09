import React from 'react';
import { MessageCircle } from 'lucide-react';
import { resolveCampaignImageUrl } from '../../utils/upload';
import { buildWhatsAppLink, defaultCtaMessage } from '../../utils/whatsappLink';

export function slotValue(content, key) {
  const raw = content?.[key];
  if (raw == null) return '';
  if (typeof raw === 'object' && raw.value != null) return String(raw.value);
  if (typeof raw === 'string') return raw;
  return '';
}

export function slotMedia(content, key) {
  const raw = content?.[key];
  if (!raw) return null;
  if (typeof raw === 'object') {
    return {
      url: raw.mediaPath || raw.media_path || raw.url || null,
      mediaType: raw.mediaType || raw.media_type || 'image',
      ctaText: raw.ctaText || raw.cta_text || null,
      label: raw.label || key,
    };
  }
  return null;
}

export function formatBrl(value) {
  if (!value) return '';
  const n = parseFloat(String(value).replace(',', '.'));
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function PromoMedia({ media, className = '' }) {
  if (!media?.url) return null;
  const src = resolveCampaignImageUrl(media.url);
  if (media.mediaType === 'video') {
    return (
      <video
        className={className}
        src={src}
        controls
        playsInline
        preload="metadata"
      />
    );
  }
  return <img className={className} src={src} alt="" loading="lazy" />;
}

export function PromoPrice({ original, discount, pct }) {
  if (!original && !discount) return null;
  return (
    <div className="promo-prices">
      {original && <span className="promo-price-original">{formatBrl(original)}</span>}
      {discount && <span className="promo-price-discount">{formatBrl(discount)}</span>}
      {pct && <span className="promo-price-pct">-{pct}%</span>}
    </div>
  );
}

export function PromoCta({ phone, label, ctaText, onClick }) {
  const msg = ctaText || defaultCtaMessage(label);
  const href = buildWhatsAppLink(phone, msg);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="promo-cta"
      onClick={onClick}
    >
      <MessageCircle className="w-4 h-4" />
      Falar no WhatsApp
    </a>
  );
}

export function RichTextBlock({ html, className = '' }) {
  const text = html || '';
  if (!text) return null;
  return (
    <div
      className={`promo-richtext ${className}`}
      dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }}
    />
  );
}
