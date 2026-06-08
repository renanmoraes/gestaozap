/**
 * Import em massa de JSONs de contatos para um tenant.
 *
 * Uso:
 *   node src/scripts/bulk-import-contacts.js [--dir=/imports] [--slug=default] [--phone=5531995637020]
 *
 * Espera arquivos contacts-batch-*.json com formato:
 *   [{ name: string, phone: string }, ...]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => a.replace(/^--/, '').split('=')),
);

const IMPORTS_DIR = args.dir || '/imports';
const TARGET_SLUG = args.slug || 'default';
const TARGET_PHONE = args.phone || null;
const BATCH_SIZE = parseInt(args.batchSize || '500', 10);

async function main() {
  const { connectDB } = require('../config/db');
  const { getDb, getPool } = require('../db');
  const { tenants, contacts } = require('../db/schema');
  const { eq, sql } = require('drizzle-orm');
  const { normalizePhoneForWhatsApp } = require('../utils/phone.util');

  await connectDB();
  const db = getDb();

  // Resolve tenant alvo + atualiza telefone cadastrado se solicitado
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, TARGET_SLUG));
  if (!tenant) {
    console.error(`Tenant /${TARGET_SLUG} não existe`);
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log(`Tenant alvo: ${tenant.name} (/${tenant.slug}) — id=${tenantId}`);

  if (TARGET_PHONE) {
    const normalized = normalizePhoneForWhatsApp(TARGET_PHONE);
    if (normalized && normalized !== tenant.registeredPhone) {
      await db.update(tenants)
        .set({ registeredPhone: normalized, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));
      console.log(`Telefone do tenant atualizado: ${tenant.registeredPhone || '(vazio)'} → ${normalized}`);
    }
  }

  // Lê todos os batches
  if (!fs.existsSync(IMPORTS_DIR)) {
    console.error(`Pasta ${IMPORTS_DIR} não encontrada`);
    process.exit(1);
  }

  const files = fs.readdirSync(IMPORTS_DIR)
    .filter((f) => f.startsWith('contacts-batch-') && f.endsWith('.json'))
    .sort();

  console.log(`Encontrados ${files.length} arquivo(s) de batch.\n`);

  let totalRead = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalInvalid = 0;
  const startTs = Date.now();

  const pool = getPool();

  for (const file of files) {
    const full = path.join(IMPORTS_DIR, file);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      console.warn(`[skip] ${file} JSON inválido: ${e.message}`);
      continue;
    }
    if (!Array.isArray(raw)) {
      console.warn(`[skip] ${file} não é array`);
      continue;
    }

    // Normaliza
    const rows = [];
    for (const c of raw) {
      totalRead++;
      const name = String(c?.name || '').trim();
      const phone = normalizePhoneForWhatsApp(c?.phone);
      if (!name || !phone) { totalInvalid++; continue; }
      rows.push({ tenantId, name, phone });
    }

    // Dedup interno por phone (caso o batch tenha o mesmo número 2x)
    const dedup = new Map();
    for (const r of rows) {
      if (!dedup.has(r.phone)) dedup.set(r.phone, r);
    }
    const final = [...dedup.values()];

    // Bulk insert em chunks (Postgres tem limite de ~32k parâmetros)
    let fileInserted = 0;
    for (let i = 0; i < final.length; i += BATCH_SIZE) {
      const chunk = final.slice(i, i + BATCH_SIZE);
      const values = chunk.flatMap((r) => [r.tenantId, r.name, r.phone, '{}']);
      const placeholders = chunk
        .map((_, idx) => `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`)
        .join(', ');
      const text = `
        INSERT INTO contacts (tenant_id, name, phone, tags)
        VALUES ${placeholders}
        ON CONFLICT (tenant_id, phone) DO NOTHING
        RETURNING id
      `;
      const r = await pool.query(text, values);
      fileInserted += r.rowCount;
    }

    const fileSkipped = final.length - fileInserted;
    totalInserted += fileInserted;
    totalSkipped += fileSkipped;

    console.log(`  ${file}  ·  ${final.length} válidos  →  ${fileInserted} novos · ${fileSkipped} já existiam`);
  }

  const elapsedSec = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log('\n══════════════════════════════════════════════');
  console.log(`  Lidos:        ${totalRead.toLocaleString('pt-BR')}`);
  console.log(`  Inválidos:    ${totalInvalid.toLocaleString('pt-BR')}`);
  console.log(`  Inseridos:    ${totalInserted.toLocaleString('pt-BR')} ✓`);
  console.log(`  Já existiam:  ${totalSkipped.toLocaleString('pt-BR')}`);
  console.log(`  Tempo:        ${elapsedSec}s`);
  console.log('══════════════════════════════════════════════');

  // Conta total final do tenant pra confirmar
  const [{ count }] = await db.select({ count: sql`COUNT(*)::int` }).from(contacts)
    .where(eq(contacts.tenantId, tenantId));
  console.log(`\nTotal de contatos do tenant agora: ${Number(count).toLocaleString('pt-BR')}`);

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
