const { eq, and, ne } = require('drizzle-orm');
const path = require('path');
const fs = require('fs');
const { tenants, companies, users } = require('../db/schema');
const { verifyPassword } = require('./auth.service');
const storageService = require('./storage.service');
const {
  getDatePartsBr,
  APP_TIMEZONE,
} = require('../utils/timezone.util');

const DEFAULT_DAY = { closed: false, open: '08:00', close: '18:00' };

function defaultBusinessHours() {
  return {
    mon: { ...DEFAULT_DAY },
    tue: { ...DEFAULT_DAY },
    wed: { ...DEFAULT_DAY },
    thu: { ...DEFAULT_DAY },
    fri: { ...DEFAULT_DAY },
    sat: { closed: false, open: '08:00', close: '13:00' },
    sun: { closed: true, open: '08:00', close: '12:00' },
  };
}

function defaultProfile() {
  return {
    tagline: '',
    address: { line1: '', neighborhood: '', city: '', state: '' },
    businessHours: defaultBusinessHours(),
    availabilityStatus: 'open',
    availabilityNote: '',
    instagramUrl: '',
  };
}

function normalizeProfile(raw) {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object') return base;

  const address = { ...base.address, ...(raw.address || {}) };
  const businessHours = { ...base.businessHours };
  for (const key of Object.keys(businessHours)) {
    businessHours[key] = {
      ...businessHours[key],
      ...(raw.businessHours?.[key] || {}),
    };
  }

  return {
    tagline: String(raw.tagline || '').slice(0, 200),
    address: {
      line1: String(address.line1 || '').slice(0, 200),
      neighborhood: String(address.neighborhood || '').slice(0, 100),
      city: String(address.city || '').slice(0, 100),
      state: String(address.state || '').slice(0, 2).toUpperCase(),
    },
    businessHours,
    availabilityStatus: ['open', 'closed_today', 'delivery_only', 'custom'].includes(raw.availabilityStatus)
      ? raw.availabilityStatus
      : 'open',
    availabilityNote: String(raw.availabilityNote || '').slice(0, 300),
    instagramUrl: String(raw.instagramUrl || '').slice(0, 500),
  };
}

function resolvePublicUrl(storedPath) {
  if (!storedPath) return null;
  const raw = String(storedPath).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return normalized;
}

function getWeekdayKeyBr(date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
  }).format(date);
  const map = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' };
  return map[wd] || 'mon';
}

function parseHm(value) {
  if (!value || typeof value !== 'string') return null;
  const [h, m] = value.split(':').map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function computeIsOpenNow(profile, now = new Date()) {
  const status = profile.availabilityStatus || 'open';
  if (status === 'closed_today') return false;
  if (status === 'delivery_only') return true;

  const dayKey = getWeekdayKeyBr(now);
  const day = profile.businessHours?.[dayKey];
  if (!day || day.closed) return false;

  const openMin = parseHm(day.open);
  const closeMin = parseHm(day.close);
  if (openMin == null || closeMin == null) return null;

  const { hour, minute } = getDatePartsBr(now);
  const nowMin = Number(hour) * 60 + Number(minute);
  return nowMin >= openMin && nowMin < closeMin;
}

function formatTodayHours(profile, now = new Date()) {
  const dayKey = getWeekdayKeyBr(now);
  const day = profile.businessHours?.[dayKey];
  if (!day) return null;
  if (day.closed) return 'Fechado hoje';
  if (!day.open || !day.close) return null;
  return `Hoje: ${day.open}–${day.close}`;
}

function buildPublicProfile(tenant) {
  const profile = normalizeProfile(tenant.profileJson);
  return {
    logoUrl: resolvePublicUrl(tenant.logoPath),
    tagline: profile.tagline || null,
    address: profile.address,
    businessHours: profile.businessHours,
    availabilityStatus: profile.availabilityStatus,
    availabilityNote: profile.availabilityNote || null,
    instagramUrl: profile.instagramUrl || null,
    isOpenNow: computeIsOpenNow(profile),
    todayHoursLabel: formatTodayHours(profile),
  };
}

async function getProfile(db, tenantId, userId) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new Error('Conta não encontrada');

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const profile = normalizeProfile(tenant.profileJson);

  return {
    name: tenant.name,
    slug: tenant.slug,
    email: user?.email || null,
    registeredPhone: tenant.registeredPhone,
    logoUrl: resolvePublicUrl(tenant.logoPath),
    profile,
    vitrineUrl: `https://${tenant.slug}.gestaozap.digital/promocao-do-dia`,
  };
}

async function updateProfile(db, tenantId, payload) {
  const name = payload.name != null ? String(payload.name).trim() : null;
  if (name !== null && name.length < 2) {
    throw new Error('Nome deve ter pelo menos 2 caracteres');
  }

  const profile = payload.profile != null ? normalizeProfile(payload.profile) : null;

  if (profile?.instagramUrl) {
    try {
      const u = new URL(profile.instagramUrl.startsWith('http') ? profile.instagramUrl : `https://${profile.instagramUrl}`);
      if (!u.hostname.includes('instagram.com')) {
        throw new Error('URL do Instagram inválida');
      }
    } catch {
      throw new Error('URL do Instagram inválida');
    }
  }

  const updates = { updatedAt: new Date() };
  if (name !== null) updates.name = name;
  if (profile !== null) updates.profileJson = profile;

  const [tenant] = await db.update(tenants)
    .set(updates)
    .where(eq(tenants.id, tenantId))
    .returning();

  if (!tenant) throw new Error('Conta não encontrada');

  if (name !== null) {
    await db.update(companies)
      .set({ name, updatedAt: new Date() })
      .where(eq(companies.tenantId, tenantId));
  }

  return getProfile(db, tenantId, payload._userId);
}

async function updateEmail(db, userId, { email, currentPassword }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new Error('Email inválido');
  }
  if (!currentPassword) {
    throw new Error('Informe a senha atual');
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error('Usuário não encontrado');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new Error('Senha atual incorreta');

  const [existing] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.email, normalized), ne(users.id, userId)))
    .limit(1);
  if (existing) throw new Error('Este email já está em uso');

  await db.update(users)
    .set({ email: normalized, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return { email: normalized };
}

async function setLogo(db, tenantId, file) {
  if (!file) throw new Error('Arquivo obrigatório');

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new Error('Conta não encontrada');

  const localPath = path.join(__dirname, '../../uploads', file.filename);
  const keyHint = `profile/${tenantId}`;
  let logoPath = `uploads/${file.filename}`;

  try {
    const up = await storageService.uploadFromPath(localPath, keyHint);
    if (up.provider === 'r2') {
      try { fs.unlinkSync(localPath); } catch (_) {}
      logoPath = up.url;
    }
  } catch (e) {
    console.warn('[profile] R2 upload falhou — mantém local:', e.message);
  }

  const [updated] = await db.update(tenants)
    .set({ logoPath, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning();

  return { logoUrl: resolvePublicUrl(updated.logoPath) };
}

async function removeLogo(db, tenantId) {
  await db.update(tenants)
    .set({ logoPath: null, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
  return { ok: true };
}

module.exports = {
  defaultBusinessHours,
  defaultProfile,
  normalizeProfile,
  buildPublicProfile,
  computeIsOpenNow,
  getProfile,
  updateProfile,
  updateEmail,
  setLogo,
  removeLogo,
};
