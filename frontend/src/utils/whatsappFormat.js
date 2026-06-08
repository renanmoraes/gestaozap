import React from 'react';

const TOKEN_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`\n]+```)/g;

function renderToken(token, key) {
  if (token.startsWith('*') && token.endsWith('*')) {
    return React.createElement('strong', { key }, token.slice(1, -1));
  }
  if (token.startsWith('_') && token.endsWith('_')) {
    return React.createElement('em', { key }, token.slice(1, -1));
  }
  if (token.startsWith('~') && token.endsWith('~')) {
    return React.createElement('span', { key, className: 'line-through' }, token.slice(1, -1));
  }
  if (token.startsWith('```') && token.endsWith('```')) {
    return React.createElement(
      'code',
      { key, className: 'bg-gray-100 px-1 rounded font-mono text-[0.95em]' },
      token.slice(3, -3),
    );
  }
  return token;
}

export function renderWhatsAppLikeText(text) {
  const source = String(text || '');
  const parts = source.split(TOKEN_REGEX);
  return parts.map((part, idx) => renderToken(part, `wa-${idx}`));
}
