function marketingBaseUrl() {
  return process.env.APP_BASE_URL
    || `https://${process.env.APP_BASE_DOMAIN || 'gestaozap.digital'}`;
}

function affiliateLink(code) {
  return `${marketingBaseUrl()}/?ref=${encodeURIComponent(code)}`;
}

module.exports = { marketingBaseUrl, affiliateLink };
