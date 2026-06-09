function parseCookies(req) {
  const header = req.headers.cookie || '';
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const idx = part.indexOf('=');
      if (idx < 0) return [part.trim(), ''];
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        return [key, decodeURIComponent(val)];
      } catch {
        return [key, val];
      }
    }).filter(([key]) => key),
  );
}

function setAffiliateRefCookie(res, code) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = 7 * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `gz_aff_ref=${encodeURIComponent(code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  );
}

module.exports = { parseCookies, setAffiliateRefCookie };
