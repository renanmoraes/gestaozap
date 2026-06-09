function slugify(name) {
  const s = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
  return s || 'cliente';
}

// Gera slug único consultando a tabela tenants (sufixo numérico em colisão).
async function generateUniqueSlug(db, name) {
  const { tenants } = require('../db/schema');
  const { eq } = require('drizzle-orm');
  const base = slugify(name);
  let candidate = base;
  for (let n = 2; n < 1000; n += 1) {
    const [hit] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate));
    if (!hit) return candidate;
    const suffix = `-${n}`;
    candidate = `${base.slice(0, 63 - suffix.length)}${suffix}`;
  }
  throw new Error('Não foi possível gerar slug único');
}

module.exports = { slugify, generateUniqueSlug };
