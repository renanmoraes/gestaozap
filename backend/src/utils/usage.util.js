function computeOverage({ used, quota, pricePerMsg }) {
  if (quota == null) return { overage: 0, costBrl: 0 };
  const overage = Math.max(0, used - quota);
  const price = Number(pricePerMsg) || 0;
  return { overage, costBrl: Number((overage * price).toFixed(2)) };
}

module.exports = { computeOverage };
