const router = require('express').Router();
const { eq, and, asc } = require('drizzle-orm');
const { getDb } = require('../db');
const { tenantHasFeature } = require('../services/feature.service');
const { bookingPages, eventTypes, tenants } = require('../db/schema');
const {
  getAvailableSlots,
  validateAndCreateBooking,
} = require('../services/booking-availability.service');
const { buildPublicProfile } = require('../services/tenant-profile.service');
const { buildPublicBookingUrl } = require('../utils/booking-time.util');

router.get('/page', async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.id) return res.status(404).json({ error: 'Conta não encontrada' });

    const db = getDb();
    const { active } = await tenantHasFeature(db, tenant.id, 'agendamentos');
    if (!active) return res.status(403).json({ inactive: true });

    const [page] = await db.select().from(bookingPages)
      .where(eq(bookingPages.tenantId, tenant.id));
    if (!page || !page.isPublished) return res.status(404).json({ error: 'Página não publicada' });

    const types = await db.select().from(eventTypes)
      .where(and(eq(eventTypes.bookingPageId, page.id), eq(eventTypes.isActive, true)))
      .orderBy(asc(eventTypes.sortOrder));

    const [tenantRow] = await db.select({
      name: tenants.name,
      slug: tenants.slug,
      logoPath: tenants.logoPath,
      profileJson: tenants.profileJson,
    }).from(tenants).where(eq(tenants.id, tenant.id));

    const profile = buildPublicProfile(tenantRow || tenant);
    const baseOrigin = `${req.protocol}://${req.get('host')}`;

    res.json({
      page: {
        title: page.title,
        description: page.description,
        timezone: page.timezone,
        bookingUrl: buildPublicBookingUrl(tenantRow?.slug || tenant.slug, { baseOrigin }),
      },
      eventTypes: types.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        durationMin: t.durationMin,
      })),
      profile,
    });
  } catch (err) {
    console.error('[public-bookings/page]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/availability', async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.id) return res.status(404).json({ error: 'Conta não encontrada' });

    const db = getDb();
    const { active } = await tenantHasFeature(db, tenant.id, 'agendamentos');
    if (!active) return res.status(403).json({ inactive: true });

    const { eventTypeId, from, to, tz } = req.query;
    if (!eventTypeId) return res.status(400).json({ error: 'eventTypeId obrigatório' });

    const data = await getAvailableSlots(db, {
      tenantId: tenant.id,
      eventTypeId,
      fromDate: from,
      toDate: to || from,
      timeZone: tz || undefined,
    });
    res.json(data);
  } catch (err) {
    console.error('[public-bookings/availability]', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant?.id) return res.status(404).json({ error: 'Conta não encontrada' });

    const db = getDb();
    const { active } = await tenantHasFeature(db, tenant.id, 'agendamentos');
    if (!active) return res.status(403).json({ inactive: true });

    const {
      eventTypeId, startsAt, inviteeName, inviteeEmail, inviteeTimezone, conversationId,
    } = req.body || {};

    const booking = await validateAndCreateBooking(db, {
      tenantId: tenant.id,
      eventTypeId,
      startsAtIso: startsAt,
      inviteeName,
      inviteeEmail,
      inviteeTimezone,
      conversationId,
    });

    res.status(201).json({
      id: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      publicToken: booking.publicToken,
    });
  } catch (err) {
    console.error('[public-bookings/post]', err);
    res.status(err.status || 400).json({ error: err.message });
  }
});

module.exports = router;
