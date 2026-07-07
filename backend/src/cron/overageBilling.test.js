const cron = require('node-cron');
const { OVERAGE_BILLING_CRON, scheduleOverageBilling } = require('./overageBilling');

describe('scheduleOverageBilling', () => {
  test('expressão cron mensal é válida', () => {
    expect(cron.validate(OVERAGE_BILLING_CRON)).toBe(true);
  });

  test('registra o job uma única vez', () => {
    const first = scheduleOverageBilling();
    const second = scheduleOverageBilling();
    expect(second).toBe(first);
    first.stop();
  });
});
