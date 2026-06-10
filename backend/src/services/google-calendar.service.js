const crypto = require('crypto');
const { eq } = require('drizzle-orm');
const { tenantGoogleCalendar } = require('../db/schema');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

function getConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI
    || `https://${process.env.APP_BASE_DOMAIN || 'gestaozap.digital'}/api/oauth/google-calendar/callback`;
  return { clientId, clientSecret, redirectUri };
}

function isConfigured() {
  const { clientId, clientSecret } = getConfig();
  return !!(clientId && clientSecret);
}

function stateSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'gestaozap-google-oauth-dev';
}

function signOAuthState({ tenantId, tenantSlug }) {
  const payload = JSON.stringify({ tenantId, tenantSlug, ts: Date.now() });
  const sig = crypto.createHmac('sha256', stateSecret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyOAuthState(state) {
  if (!state) throw new Error('State inválido');
  const raw = Buffer.from(state, 'base64url').toString('utf8');
  const dot = raw.lastIndexOf('.');
  if (dot < 0) throw new Error('State inválido');
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest('hex');
  if (sig !== expected) throw new Error('State inválido');
  const data = JSON.parse(payload);
  if (Date.now() - data.ts > 15 * 60 * 1000) throw new Error('State expirado');
  return data;
}

function buildAuthUrl({ tenantId, tenantSlug }) {
  const { clientId, redirectUri } = getConfig();
  if (!clientId) throw new Error('Google Calendar não configurado no servidor');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: signOAuthState({ tenantId, tenantSlug }),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Falha OAuth Google');
  return data;
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Falha ao renovar token Google');
  return data;
}

async function fetchGoogleEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email || null;
}

async function getConnection(db, tenantId) {
  const [row] = await db.select().from(tenantGoogleCalendar)
    .where(eq(tenantGoogleCalendar.tenantId, tenantId));
  return row || null;
}

async function ensureValidAccessToken(db, connection) {
  if (!connection) return null;
  const expiresMs = new Date(connection.tokenExpiresAt).getTime();
  if (expiresMs > Date.now() + 60_000) return connection;

  const tokens = await refreshAccessToken(connection.refreshToken);
  const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  const [updated] = await db.update(tenantGoogleCalendar).set({
    accessToken: tokens.access_token,
    tokenExpiresAt,
    updatedAt: new Date(),
    lastSyncError: null,
  }).where(eq(tenantGoogleCalendar.tenantId, connection.tenantId)).returning();
  return updated;
}

async function saveConnection(db, tenantId, tokens, googleEmail) {
  const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  const values = {
    tenantId,
    googleEmail,
    calendarId: 'primary',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt,
    syncEnabled: true,
    lastSyncError: null,
    updatedAt: new Date(),
  };

  const existing = await getConnection(db, tenantId);
  if (existing) {
    const [row] = await db.update(tenantGoogleCalendar).set({
      ...values,
      refreshToken: tokens.refresh_token || existing.refreshToken,
    }).where(eq(tenantGoogleCalendar.tenantId, tenantId)).returning();
    return row;
  }

  const [row] = await db.insert(tenantGoogleCalendar).values({
    ...values,
    createdAt: new Date(),
  }).returning();
  return row;
}

async function disconnect(db, tenantId) {
  await db.delete(tenantGoogleCalendar).where(eq(tenantGoogleCalendar.tenantId, tenantId));
}

async function fetchBusyWindows(db, tenantId, fromUtc, toUtc) {
  let conn = await getConnection(db, tenantId);
  if (!conn || !conn.syncEnabled) return [];

  try {
    conn = await ensureValidAccessToken(db, conn);
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: fromUtc.toISOString(),
        timeMax: toUtc.toISOString(),
        items: [{ id: conn.calendarId || 'primary' }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Erro freeBusy Google');

    const cals = data.calendars || {};
    const cal = cals[conn.calendarId] || cals.primary || {};
    const busy = cal.busy || [];

    await db.update(tenantGoogleCalendar).set({
      lastSyncAt: new Date(),
      lastSyncError: null,
      updatedAt: new Date(),
    }).where(eq(tenantGoogleCalendar.tenantId, tenantId));

    return busy.map((b) => ({
      startsAt: new Date(b.start),
      endsAt: new Date(b.end),
      source: 'google',
    }));
  } catch (err) {
    await db.update(tenantGoogleCalendar).set({
      lastSyncError: err.message,
      updatedAt: new Date(),
    }).where(eq(tenantGoogleCalendar.tenantId, tenantId));
    console.warn('[google-calendar] sync falhou:', tenantId, err.message);
    return [];
  }
}

function publicStatus(connection) {
  if (!connection) {
    return { connected: false, provider: 'google', configured: isConfigured() };
  }
  return {
    connected: true,
    provider: 'google',
    configured: isConfigured(),
    googleEmail: connection.googleEmail,
    syncEnabled: connection.syncEnabled,
    lastSyncAt: connection.lastSyncAt,
    lastSyncError: connection.lastSyncError,
  };
}

function tenantBookingsUrl(slug) {
  const domain = process.env.APP_BASE_DOMAIN || 'gestaozap.digital';
  return `https://${slug}.${domain}/bookings`;
}

module.exports = {
  isConfigured,
  buildAuthUrl,
  verifyOAuthState,
  exchangeCode,
  fetchGoogleEmail,
  saveConnection,
  disconnect,
  getConnection,
  fetchBusyWindows,
  publicStatus,
  tenantBookingsUrl,
};
