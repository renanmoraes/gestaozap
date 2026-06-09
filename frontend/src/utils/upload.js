/** Limites alinhados ao backend (chats.routes.js) e ao WhatsApp. */
export const CHAT_FILE_MAX_BYTES = 32 * 1024 * 1024;
export const CHAT_MEDIA_MAX_BYTES = 16 * 1024 * 1024;
export const CAMPAIGN_IMAGE_MAX_BYTES = 16 * 1024 * 1024;

export const CHAT_ACCEPT =
  'image/*,audio/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv';

export const CAMPAIGN_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

const CHAT_IMAGE_VIDEO_RE = /^image\/|^video\//;
const CHAT_ALLOWED_RE =
  /^(image\/|audio\/|video\/|application\/(pdf|msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel)|text\/(plain|csv))/i;

const CAMPAIGN_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function validateChatFile(file) {
  if (!file) return { ok: true };

  if (!CHAT_ALLOWED_RE.test(file.type || '')) {
    return {
      ok: false,
      error: 'Tipo não suportado. Use imagem, áudio, vídeo, PDF, Word, Excel, TXT ou CSV.',
    };
  }

  const maxBytes = CHAT_IMAGE_VIDEO_RE.test(file.type) ? CHAT_MEDIA_MAX_BYTES : CHAT_FILE_MAX_BYTES;
  if (file.size > maxBytes) {
    const kind = CHAT_IMAGE_VIDEO_RE.test(file.type) ? 'Imagem ou vídeo' : 'Arquivo';
    return {
      ok: false,
      error: `${kind} muito grande (máx. ${formatFileSize(maxBytes)}). Reduza o tamanho e tente de novo.`,
    };
  }

  return { ok: true };
}

export function validateCampaignImage(file) {
  if (!file) return { ok: true };

  if (!CAMPAIGN_IMAGE_TYPES.has(file.type)) {
    return {
      ok: false,
      error: 'Formato inválido. Use JPG, PNG, WebP ou GIF.',
    };
  }

  if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: `Imagem muito grande (máx. ${formatFileSize(CAMPAIGN_IMAGE_MAX_BYTES)}). Comprima ou escolha outra.`,
    };
  }

  return { ok: true };
}

export const CHAT_UPLOAD_HINT =
  'Anexos: imagem ou vídeo até 16 MB · demais arquivos até 32 MB · JPG, PNG, PDF, áudio, etc.';

export const CAMPAIGN_IMAGE_HINT =
  'JPG, PNG, WebP ou GIF · até 16 MB · imagens menores enviam mais rápido no WhatsApp';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/** Resolve imagePath do template (URL R2, /uploads/... ou uploads/...) para src válido. */
export function resolveCampaignImageUrl(imagePath) {
  if (!imagePath) return null;
  const raw = String(imagePath).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
}
