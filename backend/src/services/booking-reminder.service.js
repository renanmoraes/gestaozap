const { eq, and, lte, asc, inArray } = require('drizzle-orm');
const {
  bookings,
  bookingPages,
  bookingStaff,
  eventTypes,
  tenants,
  bookingReminderJobs,
} = require('../db/schema');
const { sendEmail, emailLayout, appBaseDomain } = require('./email.service');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');
const { APP_TIMEZONE } = require('../utils/timezone.util');
const { getIo } = require('../config/registry');

const MAX_ATTEMPTS = 8;
const PRIVACY_URL = `https://${appBaseDomain()}/privacidade`;

function parseReminderHours(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(Number).filter((h) => h > 0 && h <= 168))].sort((a, b) => b - a);
  }
  return [24, 1];
}

function formatDateTimeBr(date, timeZone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

function formatTimeBr(date, timeZone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

function buildWhatsAppReminderBody({
  inviteeName, tenantName, eventName, startsAt, timeZone, hoursBefore, staffName,
}) {
  const when = formatDateTimeBr(startsAt, timeZone);
  const prefix = hoursBefore
    ? `Lembrete: seu agendamento é em ${hoursBefore}h.\n\n`
    : '';
  let text = `${prefix}Olá, ${inviteeName}! 👋\n\n`;
  text += `Confirmamos seu *${eventName}* com *${tenantName}*.\n`;
  text += `📅 ${when}`;
  if (staffName) text += `\n👤 Com ${staffName}`;
  text += `\n\nResponda aqui se precisar remarcar ou cancelar.`;
  return text;
}

function buildEmailConfirmation({ inviteeName, tenantName, eventName, startsAt, timeZone, staffName }) {
  const when = formatDateTimeBr(startsAt, timeZone);
  return emailLayout({
    title: 'Agendamento confirmado',
    bodyHtml: `
      <p>Olá, <strong>${inviteeName}</strong>!</p>
      <p>Seu agendamento com <strong>${tenantName}</strong> está confirmado:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px">
        <tr><td style="padding:12px 16px;color:#64748b">Serviço</td><td style="padding:12px 16px;font-weight:600">${eventName}</td></tr>
        <tr><td style="padding:12px 16px;color:#64748b">Data e hora</td><td style="padding:12px 16px;font-weight:600">${when}</td></tr>
        ${staffName ? `<tr><td style="padding:12px 16px;color:#64748b">Profissional</td><td style="padding:12px 16px;font-weight:600">${staffName}</td></tr>` : ''}
      </table>
      <p style="font-size:14px;color:#64748b">Você receberá lembretes conforme autorizado no momento da reserva.</p>
    `,
  });
}

function buildEmailReminder({ inviteeName, tenantName, eventName, startsAt, timeZone, hoursBefore, staffName }) {
  const when = formatDateTimeBr(startsAt, timeZone);
  return emailLayout({
    title: `Lembrete — faltam ${hoursBefore}h`,
    bodyHtml: `
      <p>Olá, <strong>${inviteeName}</strong>!</p>
      <p>Passando para lembrar do seu agendamento com <strong>${tenantName}</strong> em aproximadamente <strong>${hoursBefore} hora(s)</strong>:</p>
      <p style="font-size:17px;font-weight:600;color:#059669;margin:16px 0">${when}</p>
      <p><strong>${eventName}</strong>${staffName ? ` · ${staffName}` : ''}</p>
    `,
  });
}

async function loadBookingContext(db, bookingId) {
  const [row] = await db.select({
    booking: bookings,
    page: bookingPages,
    eventType: eventTypes,
    tenantName: tenants.name,
    tenantSlug: tenants.slug,
    staffName: bookingStaff.name,
  })
    .from(bookings)
    .innerJoin(bookingPages, eq(bookingPages.id, bookings.bookingPageId))
    .innerJoin(eventTypes, eq(eventTypes.id, bookings.eventTypeId))
    .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
    .leftJoin(bookingStaff, eq(bookingStaff.id, bookings.staffId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return row || null;
}

async function scheduleReminderJobs(db, booking, page) {
  const hoursList = parseReminderHours(page.reminderHoursBefore);
  const jobs = [];

  if (page.reminderEmailEnabled !== false && booking.consentEmail) {
    jobs.push({
      bookingId: booking.id,
      tenantId: booking.tenantId,
      channel: 'email',
      kind: 'confirmation',
      hoursBefore: null,
      dueAt: new Date(),
    });
  }

  for (const hours of hoursList) {
    const dueAt = new Date(booking.startsAt.getTime() - hours * 60 * 60 * 1000);
    if (dueAt <= new Date()) continue;

    if (page.reminderEmailEnabled !== false && booking.consentEmail) {
      jobs.push({
        bookingId: booking.id,
        tenantId: booking.tenantId,
        channel: 'email',
        kind: 'reminder',
        hoursBefore: hours,
        dueAt,
      });
    }

    if (page.reminderWhatsappEnabled !== false && booking.consentWhatsapp && booking.inviteePhone) {
      jobs.push({
        bookingId: booking.id,
        tenantId: booking.tenantId,
        channel: 'whatsapp',
        kind: 'reminder',
        hoursBefore: hours,
        dueAt,
      });
    }
  }

  if (page.reminderWhatsappEnabled !== false && booking.consentWhatsapp && booking.inviteePhone) {
    jobs.push({
      bookingId: booking.id,
      tenantId: booking.tenantId,
      channel: 'whatsapp',
      kind: 'confirmation',
      hoursBefore: null,
      dueAt: new Date(),
    });
  }

  for (const job of jobs) {
    try {
      await db.insert(bookingReminderJobs).values(job);
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
}

async function sendJobEmail(ctx, job) {
  const { booking, page, eventType, tenantName, staffName } = ctx;
  const timeZone = page.timezone || booking.inviteeTimezone || APP_TIMEZONE;
  const base = {
    inviteeName: booking.inviteeName,
    tenantName: page.title || tenantName,
    eventName: eventType.name,
    startsAt: booking.startsAt,
    timeZone,
    staffName,
  };

  if (job.kind === 'confirmation') {
    return sendEmail({
      to: booking.inviteeEmail,
      subject: `Agendamento confirmado — ${base.tenantName}`,
      html: buildEmailConfirmation(base),
    });
  }

  return sendEmail({
    to: booking.inviteeEmail,
    subject: `Lembrete: ${base.eventName} em ${job.hoursBefore}h — ${base.tenantName}`,
    html: buildEmailReminder({ ...base, hoursBefore: job.hoursBefore }),
  });
}

async function sendJobWhatsApp(ctx, job) {
  const { booking, page, eventType, tenantName, staffName } = ctx;
  const phone = normalizePhoneForWhatsApp(booking.inviteePhone);
  if (!phone) return { sent: false, reason: 'PHONE_INVALID' };

  const whatsapp = require('./whatsapp.service');
  if (whatsapp.getStatus(booking.tenantId) !== 'connected') {
    return { sent: false, reason: 'WA_DISCONNECTED' };
  }

  const timeZone = page.timezone || booking.inviteeTimezone || APP_TIMEZONE;
  const body = job.kind === 'confirmation'
    ? buildWhatsAppReminderBody({
      inviteeName: booking.inviteeName,
      tenantName: page.title || tenantName,
      eventName: eventType.name,
      startsAt: booking.startsAt,
      timeZone,
      hoursBefore: null,
      staffName,
    })
    : buildWhatsAppReminderBody({
      inviteeName: booking.inviteeName,
      tenantName: page.title || tenantName,
      eventName: eventType.name,
      startsAt: booking.startsAt,
      timeZone,
      hoursBefore: job.hoursBefore,
      staffName,
    });

  const io = getIo();
  const { sendMessageAndPersist } = require('./conversation.service');
  await sendMessageAndPersist(booking.tenantId, io, phone, body, null, {});
  return { sent: true };
}

async function processReminderJob(db, job) {
  if (job.status !== 'pending') return;

  const ctx = await loadBookingContext(db, job.bookingId);
  if (!ctx || ctx.booking.status !== 'confirmed') {
    await db.update(bookingReminderJobs)
      .set({ status: 'skipped', lastError: 'booking_not_active', sentAt: new Date() })
      .where(eq(bookingReminderJobs.id, job.id));
    return;
  }

  let result;
  try {
    if (job.channel === 'email') {
      result = await sendJobEmail(ctx, job);
    } else if (job.channel === 'whatsapp') {
      result = await sendJobWhatsApp(ctx, job);
    } else {
      result = { sent: false, reason: 'UNKNOWN_CHANNEL' };
    }
  } catch (err) {
    result = { sent: false, reason: err.message };
  }

  const attempts = (job.attempts || 0) + 1;

  if (result.sent) {
    await db.update(bookingReminderJobs)
      .set({ status: 'sent', sentAt: new Date(), attempts, lastError: null })
      .where(eq(bookingReminderJobs.id, job.id));
    return;
  }

  const retryable = ['WA_DISCONNECTED', 'RESEND_NOT_CONFIGURED'].includes(result.reason)
    || (result.reason && result.reason !== 'PHONE_INVALID');
  const pastBooking = ctx.booking.startsAt <= new Date();

  if (!retryable || attempts >= MAX_ATTEMPTS || pastBooking) {
    await db.update(bookingReminderJobs)
      .set({
        status: result.reason === 'RESEND_NOT_CONFIGURED' ? 'skipped' : 'failed',
        attempts,
        lastError: result.reason || 'unknown',
        sentAt: new Date(),
      })
      .where(eq(bookingReminderJobs.id, job.id));
    return;
  }

  await db.update(bookingReminderJobs)
    .set({ attempts, lastError: result.reason || 'unknown' })
    .where(eq(bookingReminderJobs.id, job.id));
}

async function processDueReminderJobs(db) {
  const now = new Date();
  const jobs = await db.select()
    .from(bookingReminderJobs)
    .where(and(
      eq(bookingReminderJobs.status, 'pending'),
      lte(bookingReminderJobs.dueAt, now),
    ))
    .orderBy(asc(bookingReminderJobs.dueAt))
    .limit(50);

  for (const job of jobs) {
    await processReminderJob(db, job);
  }
  return jobs.length;
}

module.exports = {
  scheduleReminderJobs,
  processDueReminderJobs,
  parseReminderHours,
  formatDateTimeBr,
  PRIVACY_URL,
};
