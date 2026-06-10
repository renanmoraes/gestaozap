const router = require('express').Router();
const { eq, and, asc } = require('drizzle-orm');
const { getDb } = require('../db');
const { tenants, bookingStaff } = require('../db/schema');
const { listBookings } = require('../services/booking-availability.service');
const { buildPublicBookingUrl, parseDateKey, parseMonthKey } = require('../utils/booking-time.util');
const requireFeature = require('../middleware/requireFeature');
const {
  getSettings,
  updatePage,
  replaceAvailabilityFromHours,
  createEventType,
  updateEventType,
  deleteEventType,
  createBlock,
  deleteBlock,
  createException,
  deleteException,
  createStaff,
  updateStaff,
  deleteStaff,
} = require('../services/booking-config.service');

router.use(requireFeature('agendamentos'));

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const rows = await listBookings(db, req.tenant.id, {
      from: req.query.from,
      to: req.query.to,
    });

    const staffIds = [...new Set(rows.map((b) => b.staffId).filter(Boolean))];
    let staffMap = {};
    if (staffIds.length) {
      const staffRows = await db.select({ id: bookingStaff.id, name: bookingStaff.name })
        .from(bookingStaff)
        .where(eq(bookingStaff.tenantId, req.tenant.id));
      staffMap = Object.fromEntries(staffRows.map((s) => [s.id, s.name]));
    }

    res.json(rows.map((b) => ({
      ...b,
      staffName: b.staffId ? staffMap[b.staffId] || null : null,
    })));
  } catch (err) {
    console.error('[bookings/list]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const db = getDb();
    const data = await getSettings(db, req.tenant.id);
    if (!data) return res.status(404).json({ error: 'Agendamentos não configurado' });
    res.json(data);
  } catch (err) {
    console.error('[bookings/settings]', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/page', async (req, res) => {
  try {
    const db = getDb();
    const row = await updatePage(db, req.tenant.id, req.body || {});
    res.json(row);
  } catch (err) {
    console.error('[bookings/page]', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/availability', async (req, res) => {
  try {
    const db = getDb();
    await replaceAvailabilityFromHours(db, req.tenant.id, req.body?.businessHours || req.body);
    const data = await getSettings(db, req.tenant.id);
    res.json(data.businessHours);
  } catch (err) {
    console.error('[bookings/availability]', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/event-types', async (req, res) => {
  try {
    const db = getDb();
    const data = await getSettings(db, req.tenant.id);
    res.json(data?.eventTypes || []);
  } catch (err) {
    console.error('[bookings/event-types]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/event-types', async (req, res) => {
  try {
    const db = getDb();
    const row = await createEventType(db, req.tenant.id, req.body || {});
    res.status(201).json(row);
  } catch (err) {
    console.error('[bookings/event-types/create]', err);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/event-types/:id', async (req, res) => {
  try {
    const db = getDb();
    const row = await updateEventType(db, req.tenant.id, req.params.id, req.body || {});
    res.json(row);
  } catch (err) {
    console.error('[bookings/event-types/update]', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/event-types/:id', async (req, res) => {
  try {
    const db = getDb();
    await deleteEventType(db, req.tenant.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[bookings/event-types/delete]', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/blocks', async (req, res) => {
  try {
    const db = getDb();
    const row = await createBlock(db, req.tenant.id, req.body || {});
    res.status(201).json(row);
  } catch (err) {
    console.error('[bookings/blocks/create]', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/blocks/:id', async (req, res) => {
  try {
    const db = getDb();
    await deleteBlock(db, req.tenant.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[bookings/blocks/delete]', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/exceptions', async (req, res) => {
  try {
    const db = getDb();
    const rows = await createException(db, req.tenant.id, req.body || {});
    res.status(201).json(rows);
  } catch (err) {
    console.error('[bookings/exceptions/create]', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/exceptions/:id', async (req, res) => {
  try {
    const db = getDb();
    await deleteException(db, req.tenant.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[bookings/exceptions/delete]', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/staff', async (req, res) => {
  try {
    const db = getDb();
    const row = await createStaff(db, req.tenant.id, req.body || {});
    res.status(201).json(row);
  } catch (err) {
    console.error('[bookings/staff/create]', err);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/staff/:id', async (req, res) => {
  try {
    const db = getDb();
    const row = await updateStaff(db, req.tenant.id, req.params.id, req.body || {});
    res.json(row);
  } catch (err) {
    console.error('[bookings/staff/update]', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/staff/:id', async (req, res) => {
  try {
    const db = getDb();
    await deleteStaff(db, req.tenant.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[bookings/staff/delete]', err);
    res.status(400).json({ error: err.message });
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

router.get('/google-calendar/status', async (req, res) => {
  try {
    const db = getDb();
    const {
      getConnection,
      publicStatus,
      isConfigured,
    } = require('../services/google-calendar.service');
    res.json(publicStatus(await getConnection(db, req.tenant.id)));
  } catch (err) {
    console.error('[bookings/google-calendar/status]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/google-calendar/connect', async (req, res) => {
  try {
    const { buildAuthUrl, isConfigured } = require('../services/google-calendar.service');
    if (!isConfigured()) {
      return res.status(503).json({ error: 'Google Calendar não configurado no servidor' });
    }
    const [tenantRow] = await getDb().select({ slug: tenants.slug })
      .from(tenants).where(eq(tenants.id, req.tenant.id));
    const url = buildAuthUrl({
      tenantId: req.tenant.id,
      tenantSlug: tenantRow?.slug || req.tenant.slug,
    });
    res.json({ url, provider: 'google' });
  } catch (err) {
    console.error('[bookings/google-calendar/connect]', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/google-calendar', async (req, res) => {
  try {
    const { disconnect } = require('../services/google-calendar.service');
    await disconnect(getDb(), req.tenant.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[bookings/google-calendar/disconnect]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
