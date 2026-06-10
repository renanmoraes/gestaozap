const { eq, and, asc, desc, inArray, sql } = require('drizzle-orm');
const {
  bookingPages,
  eventTypes,
  bookingStaff,
  eventTypeStaff,
  availabilityRules,
  availabilityExceptions,
  manualBlocks,
} = require('../db/schema');
const { APP_TIMEZONE } = require('../utils/timezone.util');
const { KEY_TO_WEEKDAY, WEEKDAY_TO_KEY, parseDateKey } = require('../utils/booking-time.util');
const { parseReminderHours } = require('./booking-reminder.service');
const {
  getConnection,
  publicStatus: googleCalendarPublicStatus,
} = require('./google-calendar.service');

const MAX_EVENT_TYPES_FREE = 3;

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'tipo';
}

function parsePrice(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  if (Number.isNaN(n) || n < 0) throw new Error('Preço inválido');
  return n.toFixed(2);
}

async function getBookingPage(db, tenantId) {
  const [page] = await db.select().from(bookingPages)
    .where(eq(bookingPages.tenantId, tenantId));
  return page || null;
}

async function rulesToBusinessHours(rules) {
  const hours = {};
  for (const key of WEEKDAY_TO_KEY.slice(1).concat(WEEKDAY_TO_KEY[0])) {
    hours[key] = { closed: true, open: '08:00', close: '18:00', hasBreak: false, breakStart: '12:00', breakEnd: '13:00' };
  }
  const byWeekday = {};
  for (const r of rules) {
    if (!byWeekday[r.weekday]) byWeekday[r.weekday] = [];
    byWeekday[r.weekday].push(r);
  }
  for (const [wd, list] of Object.entries(byWeekday)) {
    const key = WEEKDAY_TO_KEY[Number(wd)];
    if (!key) continue;
    const sorted = list.sort((a, b) => a.startLocalTime.localeCompare(b.startLocalTime));
    if (sorted.length === 1) {
      hours[key] = {
        closed: false,
        open: sorted[0].startLocalTime,
        close: sorted[0].endLocalTime,
        hasBreak: false,
        breakStart: '12:00',
        breakEnd: '13:00',
      };
    } else if (sorted.length >= 2) {
      hours[key] = {
        closed: false,
        open: sorted[0].startLocalTime,
        close: sorted[sorted.length - 1].endLocalTime,
        hasBreak: true,
        breakStart: sorted[0].endLocalTime,
        breakEnd: sorted[1].startLocalTime,
      };
    }
  }
  return hours;
}

async function getSettings(db, tenantId) {
  const page = await getBookingPage(db, tenantId);
  if (!page) return null;

  const [types, rules, exceptions, blocks, staffRows] = await Promise.all([
    db.select().from(eventTypes)
      .where(eq(eventTypes.bookingPageId, page.id))
      .orderBy(asc(eventTypes.sortOrder)),
    db.select().from(availabilityRules)
      .where(and(eq(availabilityRules.tenantId, tenantId), eq(availabilityRules.isActive, true)))
      .orderBy(asc(availabilityRules.weekday)),
    db.select().from(availabilityExceptions)
      .where(eq(availabilityExceptions.tenantId, tenantId))
      .orderBy(desc(availabilityExceptions.dateLocal)),
    db.select().from(manualBlocks)
      .where(eq(manualBlocks.tenantId, tenantId))
      .orderBy(desc(manualBlocks.startsAt)),
    db.select().from(bookingStaff)
      .where(eq(bookingStaff.tenantId, tenantId))
      .orderBy(asc(bookingStaff.sortOrder)),
  ]);

  const typeIds = types.map((t) => t.id);
  let staffLinks = [];
  if (typeIds.length) {
    staffLinks = await db.select().from(eventTypeStaff)
      .where(inArray(eventTypeStaff.eventTypeId, typeIds));
  }

  const staffByType = {};
  for (const link of staffLinks) {
    if (!staffByType[link.eventTypeId]) staffByType[link.eventTypeId] = [];
    staffByType[link.eventTypeId].push(link.staffId);
  }

  const businessHours = await rulesToBusinessHours(rules);

  return {
    page: {
      id: page.id,
      title: page.title,
      description: page.description,
      timezone: page.timezone,
      isPublished: page.isPublished,
      operatorNotifyBeforeMin: page.operatorNotifyBeforeMin,
      reminderEmailEnabled: page.reminderEmailEnabled,
      reminderWhatsappEnabled: page.reminderWhatsappEnabled,
      reminderHoursBefore: parseReminderHours(page.reminderHoursBefore),
    },
    eventTypes: types.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      durationMin: t.durationMin,
      bufferBeforeMin: t.bufferBeforeMin,
      bufferAfterMin: t.bufferAfterMin,
      minNoticeMin: t.minNoticeMin,
      maxAdvanceDays: t.maxAdvanceDays,
      maxDailyBookings: t.maxDailyBookings,
      priceBrl: t.priceBrl != null ? String(t.priceBrl) : null,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
      staffIds: staffByType[t.id] || [],
    })),
    businessHours,
    exceptions: exceptions.map((e) => ({
      id: e.id,
      dateLocal: e.dateLocal,
      mode: e.mode,
      startLocalTime: e.startLocalTime,
      endLocalTime: e.endLocalTime,
      reason: e.reason,
    })),
    blocks: blocks.map((b) => ({
      id: b.id,
      staffId: b.staffId,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      allDay: b.allDay,
      reason: b.reason,
    })),
    staff: staffRows.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
    })),
    limits: { maxEventTypes: MAX_EVENT_TYPES_FREE },
    googleCalendar: googleCalendarPublicStatus(await getConnection(db, tenantId)),
  };
}

async function replaceAvailabilityFromHours(db, tenantId, businessHours) {
  await db.delete(availabilityRules).where(eq(availabilityRules.tenantId, tenantId));
  for (const [key, day] of Object.entries(businessHours || {})) {
    const weekday = KEY_TO_WEEKDAY[key];
    if (weekday == null || day?.closed) continue;
    const open = day.open || '08:00';
    const close = day.close || '18:00';
    if (day.hasBreak && day.breakStart && day.breakEnd) {
      await db.insert(availabilityRules).values({
        tenantId,
        weekday,
        startLocalTime: open,
        endLocalTime: day.breakStart,
        isActive: true,
      });
      await db.insert(availabilityRules).values({
        tenantId,
        weekday,
        startLocalTime: day.breakEnd,
        endLocalTime: close,
        isActive: true,
      });
    } else {
      await db.insert(availabilityRules).values({
        tenantId,
        weekday,
        startLocalTime: open,
        endLocalTime: close,
        isActive: true,
      });
    }
  }
}

async function updatePage(db, tenantId, payload) {
  const page = await getBookingPage(db, tenantId);
  if (!page) throw new Error('Configure agendamentos primeiro');

  const patch = { updatedAt: new Date() };
  if (payload.title != null) patch.title = String(payload.title).trim().slice(0, 255);
  if (payload.description != null) patch.description = payload.description ? String(payload.description).trim() : null;
  if (payload.isPublished != null) patch.isPublished = !!payload.isPublished;
  if (payload.operatorNotifyBeforeMin != null) {
    patch.operatorNotifyBeforeMin = Math.max(5, Math.min(120, Number(payload.operatorNotifyBeforeMin) || 15));
  }
  if (payload.reminderEmailEnabled != null) patch.reminderEmailEnabled = !!payload.reminderEmailEnabled;
  if (payload.reminderWhatsappEnabled != null) patch.reminderWhatsappEnabled = !!payload.reminderWhatsappEnabled;
  if (payload.reminderHoursBefore != null) {
    const hours = parseReminderHours(payload.reminderHoursBefore);
    if (!hours.length) throw new Error('Informe ao menos um lembrete (horas antes)');
    patch.reminderHoursBefore = hours;
  }

  const [row] = await db.update(bookingPages).set(patch)
    .where(eq(bookingPages.id, page.id))
    .returning();
  return row;
}

async function createEventType(db, tenantId, payload) {
  const page = await getBookingPage(db, tenantId);
  if (!page) throw new Error('Página de agendamento não encontrada');

  const activeCount = await db.select({ c: sql`count(*)::int` })
    .from(eventTypes)
    .where(and(eq(eventTypes.bookingPageId, page.id), eq(eventTypes.isActive, true)));
  if ((activeCount[0]?.c || 0) >= MAX_EVENT_TYPES_FREE) {
    throw new Error(`Limite de ${MAX_EVENT_TYPES_FREE} tipos de atendimento no plano gratuito`);
  }

  const name = String(payload.name || '').trim();
  if (name.length < 2) throw new Error('Nome obrigatório');

  let slug = slugify(payload.slug || name);
  const existing = await db.select({ id: eventTypes.id }).from(eventTypes)
    .where(and(eq(eventTypes.bookingPageId, page.id), eq(eventTypes.slug, slug)));
  if (existing.length) slug = `${slug}-${Date.now().toString(36)}`;

  const [row] = await db.insert(eventTypes).values({
    bookingPageId: page.id,
    name,
    slug,
    durationMin: Math.max(5, Math.min(480, Number(payload.durationMin) || 30)),
    bufferBeforeMin: Math.max(0, Number(payload.bufferBeforeMin) || 0),
    bufferAfterMin: Math.max(0, Number(payload.bufferAfterMin) || 0),
    minNoticeMin: Math.max(0, Number(payload.minNoticeMin) ?? 120),
    maxAdvanceDays: Math.max(1, Number(payload.maxAdvanceDays) || 60),
    maxDailyBookings: payload.maxDailyBookings != null && payload.maxDailyBookings !== ''
      ? Math.max(1, Number(payload.maxDailyBookings))
      : null,
    priceBrl: parsePrice(payload.priceBrl),
    isActive: payload.isActive !== false,
    sortOrder: Number(payload.sortOrder) || 0,
  }).returning();

  if (Array.isArray(payload.staffIds)) {
    await setEventTypeStaff(db, tenantId, row.id, payload.staffIds);
  }

  return row;
}

async function updateEventType(db, tenantId, eventTypeId, payload) {
  const page = await getBookingPage(db, tenantId);
  if (!page) throw new Error('Página não encontrada');

  const [current] = await db.select().from(eventTypes)
    .where(and(eq(eventTypes.id, eventTypeId), eq(eventTypes.bookingPageId, page.id)));
  if (!current) throw new Error('Tipo não encontrado');

  const patch = { updatedAt: new Date() };
  if (payload.name != null) patch.name = String(payload.name).trim().slice(0, 120);
  if (payload.durationMin != null) patch.durationMin = Math.max(5, Math.min(480, Number(payload.durationMin) || 30));
  if (payload.bufferBeforeMin != null) patch.bufferBeforeMin = Math.max(0, Number(payload.bufferBeforeMin) || 0);
  if (payload.bufferAfterMin != null) patch.bufferAfterMin = Math.max(0, Number(payload.bufferAfterMin) || 0);
  if (payload.minNoticeMin != null) patch.minNoticeMin = Math.max(0, Number(payload.minNoticeMin) || 0);
  if (payload.maxAdvanceDays != null) patch.maxAdvanceDays = Math.max(1, Number(payload.maxAdvanceDays) || 60);
  if (payload.maxDailyBookings !== undefined) {
    patch.maxDailyBookings = payload.maxDailyBookings != null && payload.maxDailyBookings !== ''
      ? Math.max(1, Number(payload.maxDailyBookings))
      : null;
  }
  if (payload.priceBrl !== undefined) patch.priceBrl = parsePrice(payload.priceBrl);
  if (payload.isActive != null) patch.isActive = !!payload.isActive;
  if (payload.sortOrder != null) patch.sortOrder = Number(payload.sortOrder) || 0;

  const [row] = await db.update(eventTypes).set(patch)
    .where(eq(eventTypes.id, eventTypeId))
    .returning();

  if (Array.isArray(payload.staffIds)) {
    await setEventTypeStaff(db, tenantId, eventTypeId, payload.staffIds);
  }

  return row;
}

async function deleteEventType(db, tenantId, eventTypeId) {
  const page = await getBookingPage(db, tenantId);
  if (!page) throw new Error('Página não encontrada');

  const active = await db.select().from(eventTypes)
    .where(and(eq(eventTypes.bookingPageId, page.id), eq(eventTypes.isActive, true)));
  if (active.length <= 1 && active.some((t) => t.id === eventTypeId)) {
    throw new Error('Mantenha pelo menos um tipo de atendimento ativo');
  }

  await db.update(eventTypes)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(eventTypes.id, eventTypeId), eq(eventTypes.bookingPageId, page.id)));
}

async function setEventTypeStaff(db, tenantId, eventTypeId, staffIds) {
  const ids = [...new Set((staffIds || []).filter(Boolean))];
  if (ids.length) {
    const valid = await db.select({ id: bookingStaff.id }).from(bookingStaff)
      .where(and(eq(bookingStaff.tenantId, tenantId), inArray(bookingStaff.id, ids)));
    if (valid.length !== ids.length) throw new Error('Funcionário inválido');
  }
  await db.delete(eventTypeStaff).where(eq(eventTypeStaff.eventTypeId, eventTypeId));
  for (const staffId of ids) {
    await db.insert(eventTypeStaff).values({ eventTypeId, staffId });
  }
}

async function createBlock(db, tenantId, payload) {
  const startsAt = new Date(payload.startsAt);
  const endsAt = new Date(payload.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error('Datas inválidas');
  }
  if (endsAt <= startsAt) throw new Error('Fim deve ser após o início');

  let staffId = payload.staffId || null;
  if (staffId) {
    const [s] = await db.select().from(bookingStaff)
      .where(and(eq(bookingStaff.id, staffId), eq(bookingStaff.tenantId, tenantId)));
    if (!s) throw new Error('Funcionário não encontrado');
  }

  const [row] = await db.insert(manualBlocks).values({
    tenantId,
    staffId,
    startsAt,
    endsAt,
    allDay: !!payload.allDay,
    reason: payload.reason ? String(payload.reason).trim() : null,
  }).returning();
  return row;
}

async function deleteBlock(db, tenantId, blockId) {
  await db.delete(manualBlocks)
    .where(and(eq(manualBlocks.id, blockId), eq(manualBlocks.tenantId, tenantId)));
}

async function createException(db, tenantId, payload) {
  const from = parseDateKey(payload.fromDate || payload.dateLocal);
  const to = parseDateKey(payload.toDate || payload.fromDate || payload.dateLocal);
  if (!from) throw new Error('Data inválida (YYYY-MM-DD)');

  const dates = [];
  let cur = from;
  const end = to || from;
  let guard = 0;
  while (cur <= end && guard < 366) {
    dates.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cur = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    guard += 1;
  }

  const mode = payload.mode === 'override' ? 'override' : 'closed';
  const reason = payload.reason ? String(payload.reason).trim() : null;
  const rows = [];

  for (const dateLocal of dates) {
    const [row] = await db.insert(availabilityExceptions).values({
      tenantId,
      dateLocal,
      mode,
      startLocalTime: mode === 'override' ? payload.startLocalTime : null,
      endLocalTime: mode === 'override' ? payload.endLocalTime : null,
      reason,
    }).returning();
    rows.push(row);
  }
  return rows;
}

async function deleteException(db, tenantId, exceptionId) {
  await db.delete(availabilityExceptions)
    .where(and(eq(availabilityExceptions.id, exceptionId), eq(availabilityExceptions.tenantId, tenantId)));
}

async function createStaff(db, tenantId, payload) {
  const name = String(payload.name || '').trim();
  if (name.length < 2) throw new Error('Nome obrigatório');
  const email = payload.email ? String(payload.email).trim().toLowerCase() : null;

  const [row] = await db.insert(bookingStaff).values({
    tenantId,
    name,
    email,
    isActive: payload.isActive !== false,
    sortOrder: Number(payload.sortOrder) || 0,
  }).returning();
  return row;
}

async function updateStaff(db, tenantId, staffId, payload) {
  const [current] = await db.select().from(bookingStaff)
    .where(and(eq(bookingStaff.id, staffId), eq(bookingStaff.tenantId, tenantId)));
  if (!current) throw new Error('Funcionário não encontrado');

  const patch = { updatedAt: new Date() };
  if (payload.name != null) patch.name = String(payload.name).trim().slice(0, 120);
  if (payload.email !== undefined) patch.email = payload.email ? String(payload.email).trim().toLowerCase() : null;
  if (payload.isActive != null) patch.isActive = !!payload.isActive;
  if (payload.sortOrder != null) patch.sortOrder = Number(payload.sortOrder) || 0;

  const [row] = await db.update(bookingStaff).set(patch)
    .where(eq(bookingStaff.id, staffId))
    .returning();
  return row;
}

async function deleteStaff(db, tenantId, staffId) {
  await db.update(bookingStaff)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(bookingStaff.id, staffId), eq(bookingStaff.tenantId, tenantId)));
}

async function getStaffIdsForEventType(db, eventTypeId) {
  const rows = await db.select({ staffId: eventTypeStaff.staffId })
    .from(eventTypeStaff)
    .innerJoin(bookingStaff, eq(bookingStaff.id, eventTypeStaff.staffId))
    .where(and(
      eq(eventTypeStaff.eventTypeId, eventTypeId),
      eq(bookingStaff.isActive, true),
    ));
  return rows.map((r) => r.staffId);
}

module.exports = {
  MAX_EVENT_TYPES_FREE,
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
  getStaffIdsForEventType,
  getBookingPage,
};
