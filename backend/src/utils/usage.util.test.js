const { computeOverage } = require('./usage.util');

describe('computeOverage', () => {
  test('abaixo da cota: zero', () => {
    expect(computeOverage({ used: 312, quota: 500, pricePerMsg: 0.10 }))
      .toEqual({ overage: 0, costBrl: 0 });
  });

  test('acima da cota: cobra a diferença', () => {
    expect(computeOverage({ used: 650, quota: 500, pricePerMsg: 0.10 }))
      .toEqual({ overage: 150, costBrl: 15 });
  });

  test('cota null (ilimitado): nunca excede', () => {
    expect(computeOverage({ used: 99999, quota: null, pricePerMsg: null }))
      .toEqual({ overage: 0, costBrl: 0 });
  });
});
