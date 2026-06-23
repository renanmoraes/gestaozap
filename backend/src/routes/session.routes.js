const router = require('express').Router();
const { DEFAULT_TENANT_ID } = require('../db');
const whatsapp = require('../services/whatsapp.service');

function getTenantId(req) {
  return (req.tenant && req.tenant.id) || DEFAULT_TENANT_ID;
}

router.get('/', (req, res) => {
  const tenantId = getTenantId(req);
  res.json({ status: whatsapp.getStatus(tenantId) });
});

router.post('/start', (req, res) => {
  const io = req.app.get('io');
  const tenantId = getTenantId(req);
  whatsapp.initWhatsApp(tenantId, io, { force: true });
  res.json({ message: 'Inicialização do WhatsApp iniciada' });
});

module.exports = router;
