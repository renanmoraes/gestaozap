const cron = require('node-cron');
const { eq, and, sql } = require('drizzle-orm');
const { getDb } = require('../db');
const { contracts, paymentRecords } = require('../db/schema');
const { computeOverage } = require('../utils/usage.util');
const { APP_TIMEZONE, getMonthKeyBr } = require('../utils/timezone.util');

/** Dia 1 de cada mês, 1h em Brasília. */
const OVERAGE_BILLING_CRON = '0 1 1 * *';

function previousMonthKey(date = new Date()) {
  const parts = getMonthKeyBr(date).split('-').map(Number);
  let [year, month] = parts;
  month -= 1;
  if (month < 1) { month = 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function billOverageForPreviousMonth() {
  const refMonth = previousMonthKey();
  const db = getDb();

  const rows = await db.execute(sql`
    SELECT
      c.tenant_id,
      c.id AS contract_id,
      p.messages_per_month,
      p.overage_price_brl,
      (
        SELECT COUNT(*)::int FROM send_logs sl
        WHERE sl.tenant_id = c.tenant_id
          AND sl.status = 'sent'
          AND to_char(sl.sent_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = ${refMonth}
      ) AS messages_sent
    FROM contracts c
    JOIN plans p ON p.id = c.plan_id
    WHERE c.status = 'active'
      AND p.messages_per_month IS NOT NULL
  `).then((r) => r.rows);

  let created = 0;
  for (const row of rows) {
    const { overage, costBrl } = computeOverage({
      used: row.messages_sent,
      quota: row.messages_per_month,
      pricePerMsg: row.overage_price_brl,
    });
    if (overage <= 0 || costBrl <= 0) continue;

    const [existing] = await db.select({ id: paymentRecords.id })
      .from(paymentRecords)
      .where(and(
        eq(paymentRecords.tenantId, row.tenant_id),
        eq(paymentRecords.referenceMonth, refMonth),
        eq(paymentRecords.type, 'per_message'),
      ));
    if (existing) continue;

    await db.insert(paymentRecords).values({
      tenantId: row.tenant_id,
      contractId: row.contract_id,
      amountBrl: String(costBrl),
      type: 'per_message',
      status: 'pending',
      description: `Excedente ${refMonth} (${overage} mensagens)`,
      referenceMonth: refMonth,
    });
    created++;
  }

  console.log(`[cron] overage billing ${refMonth}: ${created} registro(s) criado(s)`);
  return { refMonth, created };
}

let overageBillingTask = null;

function scheduleOverageBilling() {
  if (overageBillingTask) return overageBillingTask;

  overageBillingTask = cron.schedule(OVERAGE_BILLING_CRON, async () => {
    try {
      await billOverageForPreviousMonth();
    } catch (err) {
      console.error('[cron] overage billing falhou:', err.message);
    }
  }, { timezone: APP_TIMEZONE });

  console.log('[cron] cobrança de excedente agendada (dia 1 de cada mês, 1h BR)');
  return overageBillingTask;
}

module.exports = {
  OVERAGE_BILLING_CRON,
  scheduleOverageBilling,
  billOverageForPreviousMonth,
};
