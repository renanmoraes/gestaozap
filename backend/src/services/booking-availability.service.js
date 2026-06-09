const crypto = require('crypto');
const { eq, and, gte, lte, lt, gt, isNull, inArray, asc } = require('drizzle-orm');
const {
  bookingPages,
  eventTypes,
  availabilityRules,
  availabilityExceptions,
  manualBlocks,
  bookings,
  tenants,
} = require('../db/schema');
const { APP_TIMEZONE } = require('../utils/timezone.util');
const {
  parseDateKey,
  parseLocalTime,
  localDateTimeToUtc,
  addMinutes,
  rangesOverlap,
  getWeekdayFromDateKey,
  formatDateKeyBr,
} = require('../utils/booking-time.util');

function generatePublicToken() {
  return crypto.randomBytes(24).toString('hex');
}

function enumerateDateKeys(fromKey, toKey) {
  const keys = [];
  let cur = fromKey;
  let guard = 0;
  while (cur <= toKey && guard < 400) {
    keys.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cur = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    guard += 1;
  }
  return keys;
}

async function getEventType(db, tenantId, eventTypeId) {
  const [row] = await db.select({
    et: eventTypes,
    page: bookingPages,
  })
    .from(eventTypes)
    .innerJoin(bookingPages, eq(bookingPages.id, eventTypes.bookingPageId))
    .where(and(
      eq(eventTypes.id, eventTypeId),
      eq(bookingPages.tenantId, tenantId),
      eq(eventTypes.isActive, true),
      eq(bookingPages.isPublished, true),
    ))
    .limit(1);
  if (!row) return null;
  return { ...row.et, page: row.page };
}

async function loadAvailabilityContext(db, tenantId, fromUtc, toUtc) {
  const [rules, exceptions, blocks, existing] = await Promise.all([
    db.select().from(availabilityRules)
      .where(and(eq(availabilityRules.tenantId, tenantId), eq(availabilityRules.isActive, true))),
    db.select().from(availabilityExceptions)
      .where(and(
        eq(availabilityExceptions.tenantId, tenantId),
        gte(availabilityExceptions.dateLocal, formatDateKeyBr(fromUtc)),
        lte(availabilityExceptions.dateLocal, formatDateKeyBr(toUtc)),
      )),
    db.select().from(manualBlocks)
      .where(and(
        eq(manualBlocks.tenantId, tenantId),
        lt(manualBlocks.startsAt, toUtc),
        gt(manualBlocks.endsAt, fromUtc),
      )),
    db.select().from(bookings)
      .where(and(
        eq(bookings.tenantId, tenantId),
        inArray(bookings.status, ['confirmed', 'pending']),
        lt(bookings.startsAt, toUtc),
        gt(bookings.endsAt, fromUtc),
      )),
  ]);
  return { rules, exceptions, blocks, existing };
}

function resolveDayWindows(dateKey, rules, exceptions, timeZone) {
  const exc = exceptions.find((e) => e.dateLocal === dateKey);
  if (exc?.mode === 'closed') return [];
  if (exc?.mode === 'override' && exc.startLocalTime && exc.endLocalTime) {
    return [{ start: exc.startLocalTime, end: exc.endLocalTime }];
  }
  const weekday = getWeekdayFromDateKey(dateKey, timeZone);
  return rules
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ start: r.startLocalTime, end: r.endLocalTime }));
}

function isBlocked(startUtc, endUtc, blocks) {
  return blocks.some((b) => rangesOverlap(startUtc, endUtc, b.startsAt, b.endsAt));
}

function hasBookingConflict(startUtc, endUtc, existing, bufferBefore, bufferAfter) {
  const paddedStart = addMinutes(startUtc, -bufferBefore);
  const paddedEnd = addMinutes(endUtc, bufferAfter);
  return existing.some((b) => rangesOverlap(paddedStart, paddedEnd, b.startsAt, b.endsAt));
}

async function getAvailableSlots(db, {
  tenantId,
  eventTypeId,
  fromDate,
  toDate,
  timeZone = APP_TIMEZONE,
}) {
  const eventType = await getEventType(db, tenantId, eventTypeId);
  if (!eventType) throw new Error('Tipo de evento não encontrado');

  const fromKey = parseDateKey(fromDate) || formatDateKeyBr(new Date(), timeZone);
  const toKey = parseDateKey(toDate) || fromKey;
  const now = new Date();
  const minStart = addMinutes(now, eventType.minNoticeMin || 0);
  const maxAdvance = eventType.maxAdvanceDays || 60;
  const maxDate = addMinutes(now, maxAdvance * 24 * 60);
  const fromUtc = localDateTimeToUtc(fromKey, '00:00', timeZone);
  const toUtc = localDateTimeToUtc(toKey, '23:59', timeZone);

  const ctx = await loadAvailabilityContext(db, tenantId, fromUtc, toUtc);
  const days = [];
  const dateKeys = enumerateDateKeys(fromKey, toKey);

  for (const dateKey of dateKeys) {
    const windows = resolveDayWindows(dateKey, ctx.rules, ctx.exceptions, timeZone);
    const slots = [];
    const dayBookings = ctx.existing.filter((b) => formatDateKeyBr(b.startsAt, timeZone) === dateKey);

    if (eventType.maxDailyBookings && dayBookings.length >= eventType.maxDailyBookings) {
      days.push({ date: dateKey, slots: [] });
      continue;
    }

    for (const win of windows) {
      const startMin = parseLocalTime(win.start);
      const endMin = parseLocalTime(win.end);
      if (startMin == null || endMin == null || endMin <= startMin) continue;

      for (let t = startMin; t + eventType.durationMin <= endMin; t += eventType.durationMin) {
        const hm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
        const slotStart = localDateTimeToUtc(dateKey, hm, timeZone);
        const slotEnd = addMinutes(slotStart, eventType.durationMin);

        if (slotStart < minStart || slotStart > maxDate) continue;
        if (isBlocked(slotStart, slotEnd, ctx.blocks)) continue;
        if (hasBookingConflict(slotStart, slotEnd, ctx.existing, eventType.bufferBeforeMin, eventType.bufferAfterMin)) continue;

        slots.push(slotStart.toISOString());
      }
    }

    days.push({ date: dateKey, slots });
  }

  return { timezone: timeZone, eventTypeId, days };
}

async function validateAndCreateBooking(db, {
  tenantId,
  eventTypeId,
  startsAtIso,
  inviteeName,
  inviteeEmail,
  inviteeTimezone,
  conversationId,
}) {
  const eventType = await getEventType(db, tenantId, eventTypeId);
  if (!eventType) throw new Error('Tipo de evento não encontrado');

  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) throw new Error('Horário inválido');
  const endsAt = addMinutes(startsAt, eventType.durationMin);
  const tz = eventType.page.timezone || APP_TIMEZONE;

  const fromUtc = addMinutes(startsAt, -eventType.bufferBeforeMin - 1440);
  const toUtc = addMinutes(endsAt, eventType.bufferAfterMin + 1440);
  const ctx = await loadAvailabilityContext(db, tenantId, fromUtc, toUtc);

  const dateKey = formatDateKeyBr(startsAt, tz);
  const windows = resolveDayWindows(dateKey, ctx.rules, ctx.exceptions, tz);
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(startsAt);
  const inWindow = windows.some((w) => {
    const s = parseLocalTime(w.start);
    const e = parseLocalTime(w.end);
    const t = parseLocalTime(hm);
    return s != null && e != null && t != null && t >= s && t + eventType.durationMin <= e;
  });
  if (!inWindow) throw new Error('Horário fora da disponibilidade');

  const now = new Date();
  if (startsAt < addMinutes(now, eventType.minNoticeMin || 0)) {
    throw new Error('Antecedência mínima não respeitada');
  }
  if (startsAt > addMinutes(now, (eventType.maxAdvanceDays || 60) * 24 * 60)) {
    throw new Error('Horário além do limite de antecedência');
  }
  if (isBlocked(startsAt, endsAt, ctx.blocks)) throw new Error('Horário bloqueado');
  if (hasBookingConflict(startsAt, endsAt, ctx.existing, eventType.bufferBeforeMin, eventType.bufferAfterMin)) {
    const err = new Error('Horário acabou de ser reservado');
    err.status = 409;
    throw err;
  }

  const name = String(inviteeName || '').trim();
  const email = String(inviteeEmail || '').trim().toLowerCase();
  if (name.length < 2) throw new Error('Nome inválido');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email inválido');

  try {
    const [row] = await db.insert(bookings).values({
      tenantId,
      bookingPageId: eventType.bookingPageId,
      eventTypeId,
      inviteeName: name,
      inviteeEmail: email,
      inviteeTimezone: inviteeTimezone || APP_TIMEZONE,
      startsAt,
      endsAt,
      status: 'confirmed',
      publicToken: generatePublicToken(),
      conversationId: conversationId || null,
    }).returning();
    return row;
  } catch (err) {
    if (err.code === '23P01') {
      const conflict = new Error('Horário acabou de ser reservado');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

async function listBookings(db, tenantId, { from, to } = {}) {
  const conditions = [eq(bookings.tenantId, tenantId)];
  if (from) conditions.push(gte(bookings.startsAt, new Date(from)));
  if (to) conditions.push(lte(bookings.startsAt, new Date(to)));
  return db.select().from(bookings)
    .where(and(...conditions))
    .orderBy(asc(bookings.startsAt));
}

async function getUpcomingForOperatorNotify(db) {
  const now = new Date();
  const horizon = addMinutes(now, 60);
  const rows = await db.select({
    booking: bookings,
    tenantSlug: tenants.slug,
    tenantName: tenants.name,
    notifyMin: bookingPages.operatorNotifyBeforeMin,
  })
    .from(bookings)
    .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
    .innerJoin(bookingPages, eq(bookingPages.id, bookings.bookingPageId))
    .where(and(
      eq(bookings.status, 'confirmed'),
      isNull(bookings.operatorNotifiedAt),
      gt(bookings.startsAt, now),
      lte(bookings.startsAt, horizon),
    ));

  return rows.filter(({ booking, notifyMin }) => {
    const leadMs = (notifyMin || 15) * 60 * 1000;
    const notifyFrom = new Date(booking.startsAt.getTime() - leadMs);
    return now >= notifyFrom;
  });
}

async function markOperatorNotified(db, bookingId) {
  await db.update(bookings)
    .set({ operatorNotifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
}

module.exports = {
  getAvailableSlots,
  validateAndCreateBooking,
  listBookings,
  getEventType,
  getUpcomingForOperatorNotify,
  markOperatorNotified,
  resolveDayWindows,
  isBlocked,
  hasBookingConflict,
};
