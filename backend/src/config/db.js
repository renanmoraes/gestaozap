const { getPool } = require('../db');
const { runMigrations, ensureDefaultTenant } = require('../db/migrate');
const { seedPlatformConfig } = require('../db/seeds');

async function connectDB() {
  const pool = getPool();
  await runMigrations(pool);
  await ensureDefaultTenant(pool);
  await seedPlatformConfig(pool);
  console.log('[db] PostgreSQL conectado e pronto');
}

module.exports = { connectDB };
