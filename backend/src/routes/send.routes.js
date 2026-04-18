const router = require('express').Router();
const { sendQueue } = require('../config/queue');
const Campaign = require('../models/campaign.model');
const Contact = require('../models/contact.model');
const whatsapp = require('../services/whatsapp.service');

router.post('/', async (req, res) => {
  if (whatsapp.getStatus() !== 'connected') {
    return res.status(400).json({ error: 'WhatsApp not connected' });
  }

  const { campaignId, contactIds, hourStart = 8, hourEnd = 20 } = req.body;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const contacts = await Contact.find({ _id: { $in: contactIds }, active: true }).lean();

  const job = await sendQueue.add({
    campaignId,
    contacts: contacts.map(c => ({ phone: c.phone, name: c.name })),
    text: campaign.text,
    imagePath: campaign.imagePath || null,
    hourStart,
    hourEnd,
  });

  res.json({ jobId: job.id, queued: contacts.length });
});

module.exports = router;
