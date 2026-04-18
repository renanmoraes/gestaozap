const router = require('express').Router();
const whatsapp = require('../services/whatsapp.service');

router.get('/', (req, res) => {
  res.json({ status: whatsapp.getStatus() });
});

router.post('/start', (req, res) => {
  const io = req.app.get('io');
  whatsapp.initWhatsApp(io);
  res.json({ message: 'WhatsApp initialization started' });
});

module.exports = router;
