const DEFAULT_CONFIGS = [
  { key: 'batch_size', value: '30', description: 'Mensagens por lote antes da pausa anti-ban' },
  { key: 'batch_pause_ms', value: '600000', description: 'Duração da pausa entre lotes (ms) — padrão 10 min' },
  { key: 'antiban_delay_min_ms', value: '15000', description: 'Delay mínimo entre mensagens (ms)' },
  { key: 'antiban_delay_max_ms', value: '60000', description: 'Delay máximo entre mensagens (ms)' },
  { key: 'hour_start_default', value: '8', description: 'Hora de início padrão para envios (0-23)' },
  { key: 'hour_end_default', value: '20', description: 'Hora de fim padrão para envios (0-23)' },
  { key: 'max_consecutive_failures', value: '3', description: 'Falhas consecutivas antes de pausar envio' },
  { key: 'failure_pause_ms', value: '300000', description: 'Pausa após falhas consecutivas (ms) — padrão 5 min' },
  { key: 'backup_retention', value: '7', description: 'Número de backups automáticos a manter' },
  { key: 'backup_auto_hour', value: '3', description: 'Hora do backup automático diário (0-23, horário SP)' },
  { key: 'terms_current_version', value: '2.0', description: 'Versão atual dos termos de uso' },

  // Storage — fotos/áudios/anexos
  { key: 'storage_provider',  value: 'local', description: 'Provider de storage: "local" ou "r2" (Cloudflare R2)' },
  { key: 'r2_account_id',     value: '',      description: 'Cloudflare R2 — Account ID (encontra no dashboard)' },
  { key: 'r2_access_key',     value: '',      description: 'Cloudflare R2 — Access Key ID' },
  { key: 'r2_secret_key',     value: '',      description: 'Cloudflare R2 — Secret Access Key' },
  { key: 'r2_bucket',         value: '',      description: 'Cloudflare R2 — Nome do bucket' },
  { key: 'r2_public_url',     value: '',      description: 'Cloudflare R2 — URL pública (ex.: https://pub-xxx.r2.dev ou domínio custom)' },
];

const DEFAULT_PLANS = [
  { slug: 'starter', name: 'Starter', price_brl: '97.00', messages_per_month: 500 },
  { slug: 'pro', name: 'Pro', price_brl: '197.00', messages_per_month: 2000 },
  { slug: 'business', name: 'Business', price_brl: '397.00', messages_per_month: null },
];

async function seedPlatformConfig(pool) {
  const client = await pool.connect();
  try {
    for (const cfg of DEFAULT_CONFIGS) {
      await client.query(`
        INSERT INTO platform_config (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING
      `, [cfg.key, cfg.value, cfg.description]);
    }
    for (const plan of DEFAULT_PLANS) {
      await client.query(`
        INSERT INTO plans (slug, name, price_brl, messages_per_month, features)
        VALUES ($1, $2, $3, $4, '{}')
        ON CONFLICT (slug) DO NOTHING
      `, [plan.slug, plan.name, plan.price_brl, plan.messages_per_month]);
    }
    console.log('[db] seeds aplicados');
  } finally {
    client.release();
  }
}

module.exports = { seedPlatformConfig };
