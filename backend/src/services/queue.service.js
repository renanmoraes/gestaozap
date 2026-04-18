const { sendQueue } = require('../config/queue');
const Log = require('../models/log.model');
const whatsapp = require('./whatsapp.service');

const BATCH_SIZE = 30;
const BATCH_PAUSE_MS = 10 * 60 * 1000; // 10 min

function buildAntibanDelay() {
  return Math.floor(Math.random() * (60000 - 15000 + 1)) + 15000;
}

function shouldPauseBatch(sentCount) {
  return sentCount > 0 && sentCount % BATCH_SIZE === 0;
}

function buildMessage(template, name) {
  return template.replace(/\{nome\}/g, name);
}

function registerProcessor(io) {
  sendQueue.process(async (job) => {
    const { campaignId, contacts, text, imagePath, hourStart = 8, hourEnd = 20 } = job.data;

    let sentCount = 0;

    for (const contact of contacts) {
      const hour = new Date().getHours();
      if (hour < hourStart || hour >= hourEnd) {
        io.emit('send:paused', { reason: 'outside_hours', campaignId });
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }

      const log = await Log.findOneAndUpdate(
        { campaignId, phone: contact.phone },
        { $setOnInsert: { name: contact.name, status: 'pending' } },
        { upsert: true, new: true }
      );

      if (log.status === 'sent') continue;

      try {
        const message = buildMessage(text, contact.name);
        await whatsapp.sendMessage(contact.phone, message, imagePath || null);
        await Log.findByIdAndUpdate(log._id, { status: 'sent', sentAt: new Date() });
        whatsapp.resetConsecutiveFailures();
        sentCount++;

        io.emit('send:progress', { campaignId, phone: contact.phone, status: 'sent', sentCount, total: contacts.length });

        if (shouldPauseBatch(sentCount)) {
          io.emit('send:batch_pause', { campaignId, sentCount });
          await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
        } else {
          await new Promise(r => setTimeout(r, buildAntibanDelay()));
        }
      } catch (err) {
        await Log.findByIdAndUpdate(log._id, { status: 'failed', error: err.message });
        const failures = whatsapp.incrementFailures();
        io.emit('send:progress', { campaignId, phone: contact.phone, status: 'failed', sentCount, total: contacts.length });

        if (failures >= 3) {
          io.emit('send:alert', { campaignId, message: '3 falhas consecutivas — envio pausado' });
          await new Promise(r => setTimeout(r, 5 * 60 * 1000));
        }
      }
    }

    io.emit('send:done', { campaignId, sentCount, total: contacts.length });
  });
}

module.exports = { registerProcessor, buildAntibanDelay, shouldPauseBatch, buildMessage };
