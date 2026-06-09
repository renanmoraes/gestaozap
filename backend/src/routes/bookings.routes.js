const router = require('express').Router();
const { eq, and, asc } = require('drizzle-orm');
const { getDb } = require('../db');
const { bookingPages, eventTypes, tenants } = require('../db/schema');
const { listBookings } = require('../services/booking-availability.service');
const { buildPublicBookingUrl, parseDateKey, parseMonthKey } = require('../utils/booking-time.util');
const requireFeature = require('../middleware/requireFeature');

router.use(requireFeature('agendamentos'));

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const rows = await listBookings(db, req.tenant.id, {
      from: req.query.from,
      to: req.query.to,
    });
    res.json(rows);
  } catch (err) {
    console.error('[bookings/list]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/event-types', async (req, res) => {
  try {
    const db = getDb();
    const [page] = await db.select().from(bookingPages)
      .where(eq(bookingPages.tenantId, req.tenant.id));
    if (!page) return res.json([]);

    const types = await db.select().from(eventTypes)
      .where(and(eq(eventTypes.bookingPageId, page.id), eq(eventTypes.isActive, true)))
      .orderBy(asc(eventTypes.sortOrder));
    res.json(types);
  } catch (err) {
    console.error('[bookings/event-types]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/share-link', async (req, res) => {
  try {
    const db = getDb();
    const [tenantRow] = await db.select({ slug: tenants.slug })
      .from(tenants).where(eq(tenants.id, req.tenant.id));
    const slug = tenantRow?.slug || req.tenant.slug;

    const { date, month, eventTypeId, message } = req.query;
    if (date && !parseDateKey(date)) return res.status(400).json({ error: 'Data inválida (YYYY-MM-DD)' });
    if (month && !parseMonthKey(month)) return res.status(400).json({ error: 'Mês inválido (YYYY-MM)' });

    const baseOrigin = `${req.protocol}://${req.get('host')}`;
    const url = buildPublicBookingUrl(slug, {
      date: date || undefined,
      month: month || undefined,
      eventTypeId: eventTypeId || undefined,
      baseOrigin,
    });

    const defaultMessage = date
      ? `Olá! Escolha um horário para ${date}: ${url}`
      : month
        ? `Olá! Veja os horários disponíveis em ${month}: ${url}`
        : `Olá! Agende seu horário aqui: ${url}`;

    res.json({
      url,
      message: message ? String(message).replace('{link}', url) : defaultMessage,
    });
  } catch (err) {
    console.error('[bookings/share-link]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/upcoming-alerts', async (req, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const rows = await listBookings(db, req.tenant.id, {
      from: now.toISOString(),
      to: horizon.toISOString(),
    });
    res.json(rows.filter((b) => b.status === 'confirmed'));
  } catch (err) {
    console.error('[bookings/upcoming-alerts]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
