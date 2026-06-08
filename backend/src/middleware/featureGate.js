const whatsapp = require('../services/whatsapp.service');

/**
 * Bloqueia rotas que exigem WhatsApp conectado.
 * Na Fase 3 (multi-instance) isto consultará o banco por tenantId.
 * Por ora usa o estado em memória do whatsapp.service.
 */
function requireWAConnected(req, res, next) {
  const tenantId = req.tenant?.id;
  const status = whatsapp.getStatus(tenantId);
  if (status !== 'connected') {
    return res.status(423).json({
      error: 'Funcionalidade bloqueada: WhatsApp não conectado. Acesse a página de Sessão para escanear o QR Code.',
      code: 'WA_DISCONNECTED',
    });
  }
  next();
}

module.exports = { requireWAConnected };
