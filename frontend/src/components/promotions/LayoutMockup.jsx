import React from 'react';

const W = 120;
const H = 168;

function Frame({ children, selected }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`layout-mockup-svg ${selected ? 'layout-mockup-svg--selected' : ''}`}
      aria-hidden
    >
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="10" fill="#fafaf9" stroke={selected ? '#e11d48' : '#d6d3d1'} strokeWidth={selected ? 2.5 : 1.5} />
      <rect x="8" y="8" width="24" height="4" rx="2" fill="#e7e5e4" />
      {children}
    </svg>
  );
}

function Block({ x, y, w, h, r = 4, fill = '#fecdd3' }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} opacity="0.85" />;
}

export function LayoutMockup({ patternId, selected }) {
  switch (patternId) {
    case 'grid':
      return (
        <Frame selected={selected}>
          <Block x="8" y="20" w="48" h="36" />
          <Block x="64" y="20" w="48" h="36" />
          <Block x="8" y="62" w="48" h="36" fill="#ffe4e6" />
          <Block x="64" y="62" w="48" h="36" fill="#ffe4e6" />
          <Block x="8" y="104" w="48" h="36" fill="#fda4af" />
          <Block x="64" y="104" w="48" h="36" fill="#fda4af" />
        </Frame>
      );
    case 'carousel':
      return (
        <Frame selected={selected}>
          <Block x="8" y="24" w="72" h="56" />
          <Block x="84" y="32" w="28" h="40" fill="#ffe4e6" opacity="0.6" />
          <rect x="40" y="88" width="40" height="6" rx="3" fill="#e11d48" opacity="0.5" />
        </Frame>
      );
    case 'price-list':
      return (
        <Frame selected={selected}>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <Block x="8" y={20 + i * 34} w="28" h="28" fill={i % 2 ? '#ffe4e6' : '#fecdd3'} />
              <rect x="42" y={24 + i * 34} width="40" height="4" rx="2" fill="#d6d3d1" />
              <rect x="42" y={32 + i * 34} width="28" height="6" rx="2" fill="#e11d48" opacity="0.45" />
            </g>
          ))}
        </Frame>
      );
    case 'hero-list':
      return (
        <Frame selected={selected}>
          <Block x="8" y="18" w="104" h="52" />
          <Block x="8" y="78" w="48" h="32" fill="#ffe4e6" />
          <Block x="64" y="78" w="48" h="32" fill="#ffe4e6" />
          <Block x="8" y="116" w="48" h="32" fill="#fda4af" />
          <Block x="64" y="116" w="48" h="32" fill="#fda4af" />
        </Frame>
      );
    case 'banner-grid':
      return (
        <Frame selected={selected}>
          <Block x="8" y="18" w="104" h="28" fill="#fb7185" />
          <Block x="8" y="54" w="32" h="32" />
          <Block x="44" y="54" w="32" h="32" />
          <Block x="80" y="54" w="32" h="32" />
          <Block x="8" y="92" w="32" h="32" fill="#ffe4e6" />
          <Block x="44" y="92" w="32" h="32" fill="#ffe4e6" />
        </Frame>
      );
    case 'stack':
      return (
        <Frame selected={selected}>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <Block x="8" y={18 + i * 36} w="104" h="30" fill={['#bbf7d0', '#86efac', '#4ade80', '#22c55e'][i] || '#bbf7d0'} />
              <rect x="16" y={26 + i * 36} width="50" height="4" rx="2" fill="#fff" opacity="0.5" />
            </g>
          ))}
        </Frame>
      );
    case 'before-after':
      return (
        <Frame selected={selected}>
          <text x="8" y="22" fontSize="7" fill="#78716c" fontFamily="system-ui">ANTES</text>
          <text x="64" y="22" fontSize="7" fill="#78716c" fontFamily="system-ui">DEPOIS</text>
          <Block x="8" y="26" w="48" h="72" fill="#d6d3d1" />
          <Block x="64" y="26" w="48" h="72" fill="#86efac" />
          <rect x="8" y="106" width="104" height="24" rx="4" fill="#ecfdf5" stroke="#bbf7d0" />
        </Frame>
      );
    default:
      return (
        <Frame selected={selected}>
          <Block x="8" y="20" w="48" h="40" />
          <Block x="64" y="20" w="48" h="40" />
        </Frame>
      );
  }
}

export default LayoutMockup;
