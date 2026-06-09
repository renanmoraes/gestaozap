import React from 'react';
import { normalizePromotionContent } from './normalizeContent';
import DynamicPatternRenderer from './DynamicPatternRenderer';

export default function PromotionLayoutRenderer({ promotion, phone, onCta }) {
  const layout = promotion?.layout;
  const raw = promotion?.contentJson || promotion?.content_json || {};
  const content = normalizePromotionContent(raw, layout);

  return (
    <DynamicPatternRenderer
      layout={layout}
      content={content}
      phone={phone}
      onCta={onCta}
    />
  );
}
