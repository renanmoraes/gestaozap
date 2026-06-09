/**
 * Camada de storage com suporte a:
 *   - 'local'  → arquivos em /uploads (default, retrocompatível)
 *   - 'r2'     → Cloudflare R2 (S3-compatible) usando @aws-sdk/client-s3
 *
 * Provider e credenciais ficam em platform_config para o admin poder
 * alterar sem deploy. Cache em memória recarregado quando muda.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { randomUUID } = require('crypto');
const mime = require('mime-types');
const { getConfig } = require('../config/platform');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
const MEDIA_CACHE_DIR = path.join(UPLOADS_ROOT, '.cache');

let s3 = null;
let s3Config = null; // snapshot da config que gerou o client atual

function tryRequireS3() {
  try {
    return require('@aws-sdk/client-s3');
  } catch (e) {
    console.warn('[storage] @aws-sdk/client-s3 não instalado — só funciona modo local');
    return null;
  }
}

function getR2Config() {
  return {
    provider:    getConfig('storage_provider', 'local'),
    accountId:   getConfig('r2_account_id', ''),
    accessKey:   getConfig('r2_access_key', ''),
    secretKey:   getConfig('r2_secret_key', ''),
    bucket:      getConfig('r2_bucket', ''),
    publicUrl:   getConfig('r2_public_url', ''),
  };
}

function buildClient() {
  const cfg = getR2Config();
  // Reaproveita o cliente se a config não mudou
  if (s3 && s3Config && JSON.stringify(s3Config) === JSON.stringify(cfg)) {
    return { s3, cfg };
  }

  if (cfg.provider !== 'r2') {
    s3 = null;
    s3Config = cfg;
    return { s3: null, cfg };
  }

  const sdk = tryRequireS3();
  if (!sdk || !cfg.accountId || !cfg.accessKey || !cfg.secretKey || !cfg.bucket) {
    return { s3: null, cfg };
  }

  s3 = new sdk.S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  });
  s3Config = cfg;
  return { s3, cfg };
}

/**
 * Faz upload de um arquivo local para o R2 e retorna a URL pública.
 * Se R2 não estiver configurado, retorna o path /uploads/... (fallback).
 *
 * @param {string} localPath  caminho absoluto do arquivo no disco
 * @param {string} keyHint    sub-pasta opcional (ex.: 'chat/<tenantId>')
 * @returns {Promise<{ url: string, key: string|null, provider: 'local'|'r2' }>}
 */
async function uploadFromPath(localPath, keyHint = '') {
  const { s3, cfg } = buildClient();
  const filename = path.basename(localPath);
  const safeHint = keyHint ? `${keyHint.replace(/^\/+|\/+$/g, '')}/` : '';
  const key = `${safeHint}${filename}`;

  if (!s3) {
    // Fallback local — o arquivo já está em /uploads
    return {
      url: `/uploads/${safeHint}${filename}`,
      key: null,
      provider: 'local',
    };
  }

  const buf = fs.readFileSync(localPath);
  const contentType = mime.lookup(localPath) || 'application/octet-stream';

  const sdk = tryRequireS3();
  await s3.send(new sdk.PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    Body: buf,
    ContentType: contentType,
  }));

  const publicBase = (cfg.publicUrl || '').replace(/\/+$/, '');
  const url = publicBase
    ? `${publicBase}/${key}`
    : `/uploads/${safeHint}${filename}`; // fallback se public URL não setada

  return { url, key, provider: 'r2' };
}

/**
 * Apaga um objeto do R2 (idempotente).
 */
async function deleteByKey(key) {
  const { s3, cfg } = buildClient();
  if (!s3 || !key) return false;
  const sdk = tryRequireS3();
  try {
    await s3.send(new sdk.DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return true;
  } catch (e) {
    console.warn('[storage] deleteByKey:', e.message);
    return false;
  }
}

/**
 * Testa conexão com R2 (lista 1 objeto). Útil para botão "Testar" no admin.
 */
async function testConnection() {
  const { s3, cfg } = buildClient();
  if (!s3) {
    if (cfg.provider !== 'r2') return { ok: false, error: 'storage_provider não é "r2"' };
    return { ok: false, error: 'Credenciais incompletas — informe accountId, accessKey, secretKey e bucket' };
  }
  const sdk = tryRequireS3();
  try {
    await s3.send(new sdk.HeadBucketCommand({ Bucket: cfg.bucket }));
    return { ok: true, bucket: cfg.bucket, provider: 'r2' };
  } catch (e) {
    return { ok: false, error: e.message || 'Falha ao conectar' };
  }
}

function isR2Active() {
  const { s3 } = buildClient();
  return Boolean(s3);
}

function ensureCacheDir() {
  fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });
}

function writeCachedFile(relHint, buf) {
  ensureCacheDir();
  const ext = path.extname(relHint) || '.bin';
  const cached = path.join(MEDIA_CACHE_DIR, `${randomUUID()}${ext}`);
  fs.writeFileSync(cached, buf);
  return cached;
}

function fetchHttpBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} ao baixar mídia`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadFromR2(key) {
  const { s3, cfg } = buildClient();
  if (!s3) throw new Error('R2 não configurado');
  const sdk = tryRequireS3();
  const resp = await s3.send(new sdk.GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Resolve imagePath (URL, /uploads/..., uploads/...) para caminho absoluto local
 * consumível por MessageMedia.fromFilePath. Baixa do R2 ou HTTP quando necessário.
 */
async function resolveMediaPathForSend(imagePath) {
  if (!imagePath) return null;
  const raw = String(imagePath).trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    const buf = await fetchHttpBuffer(raw);
    return writeCachedFile(path.basename(new URL(raw).pathname) || 'media.bin', buf);
  }

  const rel = raw.replace(/^\/?uploads\/+/, '');
  const localAbs = path.join(UPLOADS_ROOT, rel);
  if (fs.existsSync(localAbs)) return localAbs;

  const { s3 } = buildClient();
  if (s3) {
    const buf = await downloadFromR2(rel);
    return writeCachedFile(rel, buf);
  }

  throw new Error(`ENOENT: no such file or directory, open '${localAbs}'`);
}

module.exports = {
  uploadFromPath,
  deleteByKey,
  testConnection,
  isR2Active,
  getR2Config,
  resolveMediaPathForSend,
};
