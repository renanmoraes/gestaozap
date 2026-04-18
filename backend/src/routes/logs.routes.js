const router = require('express').Router();
const Log = require('../models/log.model');
const Campaign = require('../models/campaign.model');
const { sendQueue } = require('../config/queue');

router.get('/:campaignId', async (req, res) => {
  const logs = await Log.find({ campaignId: req.params.campaignId }).sort({ createdAt: -1 });
  res.json(logs);
});

router.post('/:campaignId/retry-failed', async (req, res) => {
  const campaign = await Campaign.findById(req.params.campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const failedLogs = await Log.find({ campaignId: req.params.campaignId, status: 'failed' });
  if (!failedLogs.length) return res.json({ message: 'No failed logs' });

  await Log.updateMany({ campaignId: req.params.campaignId, status: 'failed' }, { status: 'pending' });

  const job = await sendQueue.add({
    campaignId: req.params.campaignId,
    contacts: failedLogs.map(l => ({ phone: l.phone, name: l.name })),
    text: campaign.text,
    imagePath: campaign.imagePath || null,
  });

  res.json({ jobId: job.id, retrying: failedLogs.length });
});

module.exports = router;
