const { eq } = require('drizzle-orm');
const {
  bookingPages,
  eventTypes,
  availabilityRules,
} = require('../db/schema');
const { APP_TIMEZONE } = require('../utils/timezone.util');
const { KEY_TO_WEEKDAY } = require('../utils/booking-time.util');
const { defaultBusinessHours } = require('./tenant-profile.service');

async function ensureBookingSetup(db, { tenantId, tenantName }) {
  const [existingPage] = await db.select({ id: bookingPages.id })
    .from(bookingPages)
    .where(eq(bookingPages.tenantId, tenantId))
    .limit(1);
  if (existingPage) return { created: false, bookingPageId: existingPage.id };

  const [page] = await db.insert(bookingPages).values({
    tenantId,
    slug: 'default',
    title: tenantName || 'Agendamento',
    description: null,
    isPublished: true,
    timezone: APP_TIMEZONE,
    operatorNotifyBeforeMin: 15,
  }).returning();

  await db.insert(eventTypes).values({
    bookingPageId: page.id,
    name: 'Atendimento',
    slug: 'atendimento',
    durationMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 120,
    maxAdvanceDays: 60,
    maxDailyBookings: null,
    isActive: true,
    sortOrder: 0,
  });

  const hours = defaultBusinessHours();
  for (const [key, day] of Object.entries(hours)) {
    if (day.closed) continue;
    await db.insert(availabilityRules).values({
      tenantId,
      weekday: KEY_TO_WEEKDAY[key],
      startLocalTime: day.open || '08:00',
      endLocalTime: day.close || '18:00',
      isActive: true,
    });
  }

  return { created: true, bookingPageId: page.id };
}

async function backfillAllTenants(pool) {
  const { drizzle } = require('drizzle-orm/node-postgres');
  const db = drizzle(pool);
  const { rows } = await pool.query('SELECT id, name FROM tenants');
  for (const row of rows) {
    await ensureBookingSetup(db, { tenantId: row.id, tenantName: row.name });
  }
  console.log(`[db] booking bootstrap: ${rows.length} tenants`);
}

module.exports = {
  ensureBookingSetup,
  backfillAllTenants,
};
