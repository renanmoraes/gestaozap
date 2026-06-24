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

// Heartbeat das telas operacionais (Conversas/Sessão): religa a sessão se caiu e
// renova o timer de ociosidade enquanto a tela está aberta, p/ o usuário não
// ficar desconectado recebendo/respondendo mensagens.
router.post('/keepalive', async (req, res) => {
  const tenantId = getTenantId(req);
  try {
    const status = await whatsapp.keepAlive(tenantId);
    res.json({ status });
  } catch (_) {
    res.json({ status: whatsapp.getStatus(tenantId) });
  }
});

module.exports = router;
