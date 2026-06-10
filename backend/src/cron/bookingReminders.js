const { getDb } = require('../db');
const { processDueReminderJobs } = require('../services/booking-reminder.service');

function scheduleBookingReminderJobs() {
  const tick = async () => {
    try {
      const db = getDb();
      const count = await processDueReminderJobs(db);
      if (count > 0) {
        console.log(`[cron bookingReminders] processados ${count} job(s)`);
      }
    } catch (err) {
      console.error('[cron bookingReminders]', err.message);
    }
  };

  tick();
  setInterval(tick, 60 * 1000);
  console.log('[cron] booking reminder jobs agendado (1 min)');
}

module.exports = { scheduleBookingReminderJobs };
