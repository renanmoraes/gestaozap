const {
  getQueueForTenant,
  isCancelRequested,
  clearCancelFlag,
  isPauseRequested,
  clearPauseFlag,
} = require('../config/queue');
const { eq, and, sql } = require('drizzle-orm');
const { getDb, DEFAULT_TENANT_ID } = require('../db');
const { sendLogs, tenants, messageUsage, contracts } = require('../db/schema');
const { getConfigInt } = require('../config/platform');
const whatsapp = require('./whatsapp.service');
const guard = require('./whatsapp.guard');
const metrics = require('./metrics.service');
const incidents = require('./incidents.service');
const { normalizePhoneForWhatsApp } = require('../utils/phone.util');
const { getMonthKeyBr, isOutsideSendWindow } = require('../utils/timezone.util');

function getBatchSize()             { return getConfigInt('batch_size', 30); }
function getBatchPauseMs()          { return getConfigInt('batch_pause_ms', 600_000); }
function getMaxConsecutiveFailures(){ return getConfigInt('max_consecutive_failures', 3); }
function getFailurePauseMs()        { return getConfigInt('failure_pause_ms', 300_000); }

function buildAntibanDelay() {
  const min = getConfigInt('antiban_delay_min_ms', 15_000);
  const max = getConfigInt('antiban_delay_max_ms', 60_000);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shouldPauseBatch(sentCount) {
  return sentCount > 0 && sentCount % getBatchSize() === 0;
}

function buildMessage(template, variables = {}, appendOptOut = false, optOutText = '') {
  let msg = template
    .replace(/\{nome\}/gi, variables.name || '')
    .replace(/\{evento\}/gi, variables.evento || '')
    .replace(/\{data\}/gi, variables.data || '')
    .replace(/\{horario\}/gi, variables.horario || '')
    .replace(/\{local\}/gi, variables.local || '');
  if (appendOptOut && optOutText) msg = `${msg}\n\n${optOutText}`;
  return msg;
}

async function sleepWithCancel(ms, tenantId, jobId) {
  const chunk = 2000;
  let elapsed = 0;
  while (elapsed < ms) {
    if (await isCancelRequested(tenantId, jobId)) return true;
    const step = Math.min(chunk, ms - elapsed);
    await new Promise((r) => setTimeout(r, step));
    elapsed += step;
  }
  return false;
}

async function waitWhilePaused(tenantId, jobId, io, ctx) {
  if (!(await isPauseRequested(tenantId, jobId))) return false;
  io.to(tenantId).emit('send:paused', { ...ctx, jobId });
  while (await isPauseRequested(tenantId, jobId)) {
    if (await isCancelRequested(tenantId, jobId)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (await isCancelRequested(tenantId, jobId)) return true;
  io.to(tenantId).emit('send:resumed', { ...ctx, jobId });
  return false;
}

async function trackMessageUsage(db, tenantId, sendLogId) {
  const month = getMonthKeyBr();
  const [contract] = await db.select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.tenantId, tenantId), eq(contracts.status, 'active')))
    .limit(1);
  await db.insert(messageUsage).values({
    tenantId,
    contractId: contract?.id || null,
    sendLogId,
    month,
  }).onConflictDoNothing();
}

/**
 * Persiste uma falha pré-envio (validação E.164 reprovou, etc.).
 * Marca direto como DLQ — sem retry.
 */
async function persistFailure(db, opts) {
  const inserted = await db.insert(sendLogs).values({
    tenantId: opts.tenantId,
    campaignId: opts.campaignId,
    sendJobId: opts.sendJobId,
    phone: opts.phone,
    name: opts.name,
    status: 'dlq',
    error: opts.error,
    dispatchedAt: opts.dispatchedAt ? new Date(opts.dispatchedAt) : new Date(),
  }).onConflictDoNothing().returning();
  return inserted[0] || null;
}

function buildProcessor(io) {
  return async (job) => {
    const jobId = job.id;
    const tenantId = job.data.tenantId || DEFAULT_TENANT_ID;
    try {
      const {
        campaignId,
        contacts,
        text,
        imagePath,
        appendOptOut = false,
        optOutText = '',
        variables = {},
        hourStart = 8,
        hourEnd = 20,
        ignoreHours = false,
        dispatchedAt,
      } = job.data;

      const db = getDb();
      job.progress(0);

      if (!ignoreHours && isOutsideSendWindow(hourStart, hourEnd)) {
        const total = contacts.length;
        io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount: 0, failedCount: 0, total, skippedForHours: true, hourStart, hourEnd });
        return { sentCount: 0, failedCount: 0, total, skippedForHours: true };
      }

      let sentCount = 0;
      let failedCount = 0;
      const total = contacts.length;

      // KILL SWITCH: aborta job inteiro se admin acionou
      const killReason = await guard.getKillSwitch(tenantId);
      if (killReason) {
        io.to(tenantId).emit('send:alert', { campaignId, jobId, message: `Envios bloqueados pelo admin: ${killReason}` });
        io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount: 0, failedCount: 0, total, cancelled: true });
        return { sentCount: 0, failedCount: 0, total, cancelled: true, killed: true };
      }

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];

        await waitWhilePaused(tenantId, jobId, io, { campaignId, sentCount, total });
        if (await isCancelRequested(tenantId, jobId)) {
          io.to(tenantId).emit('send:cancelled', { campaignId, jobId, sentCount, total });
          io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount, failedCount, total, cancelled: true });
          return { sentCount, failedCount, total, cancelled: true };
        }

        // QUALITY GATE: pausa se taxa de erro > 2% nos últimos N envios
        if (guard.isQualityGateBreached(tenantId)) {
          const errorRate = guard.getErrorRate(tenantId);
          io.to(tenantId).emit('send:alert', {
            campaignId, jobId,
            message: `Quality gate: taxa de erro acima de ${guard.QUALITY_GATE_THRESHOLD * 100}% — pausando para evitar bloqueio do número`,
          });
          await guard.setKillSwitch(tenantId, 'quality_gate', 3600); // pausa 1h
          incidents.record(tenantId, io, 'quality_gate', 'warning', { errorRate, threshold: guard.QUALITY_GATE_THRESHOLD, campaignId, jobId });
          io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount, failedCount, total, cancelled: true });
          return { sentCount, failedCount, total, cancelled: true, qualityGate: true };
        }

        // VALIDAÇÃO E.164 ESTRITA
        const validation = guard.validateE164(contact.phone, 'BR');
        if (!validation.ok) {
          await persistFailure(db, { tenantId, campaignId, sendJobId: String(jobId), phone: contact.phone, name: contact.name,
            dispatchedAt, errorKind: 'permanent', error: `phone_${validation.reason}` });
          failedCount++;
          guard.recordAckResult(tenantId, true);
          metrics.recordSendOutcome(tenantId, 'dlq');
          metrics.recordDlq(tenantId, 'invalid_phone');
          io.to(tenantId).emit('send:progress', { campaignId, jobId, phone: contact.phone, status: 'dlq', sentCount, total, index: i + 1, reason: 'invalid_phone' });
          job.progress(Math.round(((i + 1) / total) * 100));
          continue;
        }

        const phone = validation.digits;
        const sendJobId = String(jobId);

        // DEDUPE INSERT (mesma chave reservada → outro worker já está enviando)
        const inserted = await db.insert(sendLogs).values({
          tenantId,
          campaignId,
          sendJobId,
          phone,
          name: contact.name,
          status: 'pending',
          dispatchedAt: dispatchedAt ? new Date(dispatchedAt) : new Date(),
        }).onConflictDoNothing().returning();

        let log;
        if (inserted.length) {
          log = inserted[0];
        } else {
          const [existing] = await db.select().from(sendLogs)
            .where(and(eq(sendLogs.campaignId, campaignId), eq(sendLogs.sendJobId, sendJobId), eq(sendLogs.phone, phone)));
          log = existing;
        }

        if (!log || log.status === 'sent' || log.status === 'dlq') {
          job.progress(Math.round(((i + 1) / total) * 100));
          continue;
        }

        // RATE LIMIT POR DESTINATÁRIO 24h (Redis SET NX EX)
        const acquired = await guard.tryReserveRecipient(tenantId, phone, 86400);
        if (!acquired) {
          await db.update(sendLogs).set({ status: 'failed', error: 'rate_limit_24h', updatedAt: new Date() })
            .where(eq(sendLogs.id, log.id));
          failedCount++;
          metrics.recordDedupeHit(tenantId, 'recipient_24h');
          metrics.recordSendOutcome(tenantId, 'skipped');
          io.to(tenantId).emit('send:progress', { campaignId, jobId, phone, status: 'skipped', sentCount, total, index: i + 1, reason: 'rate_limit_24h' });
          job.progress(Math.round(((i + 1) / total) * 100));
          continue;
        }

        // PRE-FLIGHT: número existe no WhatsApp?
        const client = whatsapp.getClientFor ? whatsapp.getClientFor(tenantId) : null;
        if (client) {
          const isReg = await guard.isRecipientRegistered(tenantId, client, phone);
          if (!isReg) {
            await db.update(sendLogs).set({ status: 'dlq', error: 'not_on_whatsapp', updatedAt: new Date() })
              .where(eq(sendLogs.id, log.id));
            await guard.releaseRecipientLock(tenantId, phone);
            failedCount++;
            io.to(tenantId).emit('send:progress', { campaignId, jobId, phone, status: 'dlq', sentCount, total, index: i + 1, reason: 'not_on_whatsapp' });
            job.progress(Math.round(((i + 1) / total) * 100));
            continue;
          }
        }

        const attempts = Number(log.error?.startsWith?.('attempt:') ? log.error.split(':')[1] : 0) || 0;

        try {
          const message = buildMessage(text, { ...variables, name: contact.name }, appendOptOut, optOutText);
          const sent = await whatsapp.sendMessage(tenantId, phone, message, imagePath || null);

          await db.update(sendLogs).set({
            status: 'sent',
            sentAt: new Date(),
            outboundMessageId: sent && sent.messageId ? String(sent.messageId) : null,
            outboundAt: sent && sent.timestamp != null ? Number(sent.timestamp) : Date.now(),
            chatId: sent && sent.chatId ? String(sent.chatId) : null,
            error: null,
            updatedAt: new Date(),
          }).where(eq(sendLogs.id, log.id));

          whatsapp.resetConsecutiveFailures(tenantId);
          guard.recordAckResult(tenantId, false);
          metrics.recordSendOutcome(tenantId, 'sent');
          sentCount++;
          trackMessageUsage(db, tenantId, log.id).catch(() => {});

          io.to(tenantId).emit('send:progress', { campaignId, jobId, phone, status: 'sent', sentCount, total, index: i + 1 });
          job.progress(Math.round(((i + 1) / total) * 100));

          if (shouldPauseBatch(sentCount)) {
            io.to(tenantId).emit('send:batch_pause', { campaignId, jobId, sentCount });
            if (await sleepWithCancel(getBatchPauseMs(), tenantId, jobId)) {
              io.to(tenantId).emit('send:cancelled', { campaignId, jobId, sentCount, total });
              io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount, failedCount, total, cancelled: true });
              return { sentCount, failedCount, total, cancelled: true };
            }
          } else {
            if (await sleepWithCancel(buildAntibanDelay(), tenantId, jobId)) {
              io.to(tenantId).emit('send:cancelled', { campaignId, jobId, sentCount, total });
              io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount, failedCount, total, cancelled: true });
              return { sentCount, failedCount, total, cancelled: true };
            }
          }
        } catch (err) {
          const cls = guard.classifyError(err);
          guard.recordAckResult(tenantId, true);
          metrics.recordSendOutcome(tenantId, cls.kind === 'transient' ? 'retry' : 'dlq');

          if (cls.kind === 'permanent' || cls.kind === 'policy') {
            metrics.recordDlq(tenantId, cls.reason);
            incidents.bumpDlqCounter(tenantId, io, cls.reason);
            if (cls.kind === 'policy') {
              incidents.record(tenantId, io, 'policy_violation', 'critical', { reason: cls.reason, original: cls.original });
            }
            // DLQ direto — sem retry
            await db.update(sendLogs).set({
              status: 'dlq',
              error: `${cls.kind}:${cls.reason}`,
              updatedAt: new Date(),
            }).where(eq(sendLogs.id, log.id));
            // Libera o lock do destinatário (permite que outro flow tente depois)
            await guard.releaseRecipientLock(tenantId, phone);
            failedCount++;
            io.to(tenantId).emit('send:progress', { campaignId, jobId, phone, status: 'dlq', sentCount, total, index: i + 1, reason: cls.reason });

            if (cls.kind === 'policy') {
              io.to(tenantId).emit('send:alert', { campaignId, jobId, message: `Aviso de política: ${cls.reason}` });
            }
            job.progress(Math.round(((i + 1) / total) * 100));
            continue;
          }

          // Transient: backoff com jitter + retry no próximo loop (até 5 tentativas)
          const newAttempts = attempts + 1;
          if (newAttempts >= 5) {
            await db.update(sendLogs).set({ status: 'dlq', error: `max_retries:${cls.reason}`, updatedAt: new Date() })
              .where(eq(sendLogs.id, log.id));
            await guard.releaseRecipientLock(tenantId, phone);
            failedCount++;
            io.to(tenantId).emit('send:progress', { campaignId, jobId, phone, status: 'dlq', sentCount, total, index: i + 1, reason: 'max_retries' });
            job.progress(Math.round(((i + 1) / total) * 100));
            continue;
          }

          await db.update(sendLogs).set({
            status: 'failed',
            error: `attempt:${newAttempts}:${cls.reason}`,
            updatedAt: new Date(),
          }).where(eq(sendLogs.id, log.id));

          // Libera o lock pra próxima tentativa (mas o backoff vai segurar)
          await guard.releaseRecipientLock(tenantId, phone);

          const backoff = guard.computeBackoffMs(newAttempts - 1);
          io.to(tenantId).emit('send:progress', {
            campaignId, jobId, phone, status: 'retry', sentCount, total, index: i + 1,
            attempt: newAttempts, backoffMs: backoff, reason: cls.reason,
          });
          failedCount++;

          const failures = whatsapp.incrementFailures(tenantId);
          job.progress(Math.round(((i + 1) / total) * 100));

          if (await sleepWithCancel(backoff, tenantId, jobId)) {
            io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount, failedCount, total, cancelled: true });
            return { sentCount, failedCount, total, cancelled: true };
          }

          // Falhas consecutivas → pausa longa (defesa adicional)
          const maxFailures = getMaxConsecutiveFailures();
          if (failures >= maxFailures) {
            io.to(tenantId).emit('send:alert', { campaignId, jobId, message: `${maxFailures} falhas consecutivas — envio pausado` });
            if (await sleepWithCancel(getFailurePauseMs(), tenantId, jobId)) {
              io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount, failedCount, total, cancelled: true });
              return { sentCount, failedCount, total, cancelled: true };
            }
          }
        }
      }

      io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount, failedCount, total, cancelled: false });
      return { sentCount, failedCount, total, cancelled: false };
    } finally {
      await clearCancelFlag(tenantId, jobId);
      await clearPauseFlag(tenantId, jobId);
    }
  };
}

/**
 * Registra processor em todos os tenants ativos.
 * Chamado no startup do servidor.
 */
async function registerProcessor(io) {
  const db = getDb();
  const activeTenants = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.active, true));
  for (const tenant of activeTenants) {
    registerProcessorForTenant(tenant.id, io);
  }
  console.log(`[queue] processors registrados para ${activeTenants.length} tenant(s)`);
}

/**
 * Registra processor para um tenant específico.
 * Usado pelo admin ao criar um novo tenant em runtime.
 */
function registerProcessorForTenant(tenantId, io) {
  const queue = getQueueForTenant(tenantId);
  queue.process(buildProcessor(io));
}

module.exports = {
  registerProcessor,
  registerProcessorForTenant,
  buildAntibanDelay,
  shouldPauseBatch,
  buildMessage,
};
