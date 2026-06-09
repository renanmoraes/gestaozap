export function marketingBaseUrl() {
  return import.meta.env.VITE_MARKETING_URL || 'https://gestaozap.digital';
}

export function affiliateLink(code) {
  return `${marketingBaseUrl()}/?ref=${encodeURIComponent(code)}`;
}
