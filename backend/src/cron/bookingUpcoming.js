const { getIo } = require('../config/registry');
const { getDb } = require('../db');
const {
  getUpcomingForOperatorNotify,
  markOperatorNotified,
} = require('../services/booking-availability.service');

function scheduleBookingUpcomingAlerts() {
  const tick = async () => {
    try {
      const db = getDb();
      const rows = await getUpcomingForOperatorNotify(db);
      const io = getIo();
      for (const row of rows) {
        const payload = {
          bookingId: row.booking.id,
          inviteeName: row.booking.inviteeName,
          startsAt: row.booking.startsAt,
          endsAt: row.booking.endsAt,
          tenantSlug: row.tenantSlug,
          tenantName: row.tenantName,
          minutesUntil: Math.max(1, Math.round((row.booking.startsAt - Date.now()) / 60000)),
        };
        if (io) {
          io.to(row.booking.tenantId).emit('booking:upcoming', payload);
        }
        await markOperatorNotified(db, row.booking.id);
      }
    } catch (err) {
      console.error('[cron bookingUpcoming]', err.message);
    }
  };

  tick();
  setInterval(tick, 60 * 1000);
  console.log('[cron] booking upcoming alerts agendado (1 min)');
}

module.exports = { scheduleBookingUpcomingAlerts };
