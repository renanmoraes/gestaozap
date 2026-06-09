const router = require('express').Router();
const { getDb } = require('../db');
const { getAffiliateByTenantId, getAffiliateDashboard } = require('../services/affiliate.service');
const { affiliateLink } = require('../utils/app-base-url');

router.get('/me', async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Conta não identificada' });

    const db = getDb();
    const affiliate = await getAffiliateByTenantId(db, tenantId);
    if (!affiliate) {
      return res.status(404).json({ error: 'not_affiliate', message: 'Esta conta não é afiliada.' });
    }

    const { stats, referrals } = await getAffiliateDashboard(db, affiliate.id);

    res.json({
      code: affiliate.code,
      name: affiliate.name,
      commissionPct: affiliate.commissionPct,
      discountPct: affiliate.discountPct,
      link: affiliateLink(affiliate.code),
      stats: {
        signups: stats?.signups ?? 0,
        approved: stats?.approved ?? 0,
        pendingReferrals: stats?.pending_referrals ?? 0,
        earnedBrl: Number(stats?.earned_brl ?? 0),
        pendingBrl: Number(stats?.pending_brl ?? 0),
        paidBrl: Number(stats?.paid_brl ?? 0),
      },
      referrals: referrals.map((r) => ({
        id: r.id,
        tenantName: r.tenant_name,
        tenantSlug: r.tenant_slug,
        approvalStatus: r.approval_status,
        status: r.status,
        commissionBrl: Number(r.commission_brl ?? 0),
        createdAt: r.created_at,
        confirmedAt: r.confirmed_at,
        paidAt: r.paid_at,
      })),
    });
  } catch (err) {
    console.error('[affiliate-portal] me:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
