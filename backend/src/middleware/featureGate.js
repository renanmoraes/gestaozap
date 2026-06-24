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

/**
 * Como `requireWAConnected`, mas tolerante ao modelo de sessão SOB DEMANDA: se a
 * sessão caiu por ociosidade (o sweeper derruba o Chrome após 10 min) mas existe
 * cache do LocalAuth, libera a ação e acorda a sessão em background — o
 * processador da fila também religa via `ensureConnected` no envio. Só bloqueia
 * (423) quando NÃO há sessão para religar sem QR (tenant nunca conectou).
 *
 * Sem isto, um disparo logo após a sessão ficar ociosa era barrado com
 * WA_DISCONNECTED, forçando o usuário a reabrir a tela de Sessão antes de cada
 * campanha.
 */
function ensureWAConnected(req, res, next) {
  const tenantId = req.tenant?.id;
  if (whatsapp.getStatus(tenantId) === 'connected') return next();

  if (whatsapp.hasResumableSession(tenantId)) {
    // Acorda em background (não bloqueia a resposta): o envio em si aguarda o
    // `ready` via ensureConnected no processador da fila.
    whatsapp.ensureConnected(tenantId).catch((e) =>
      console.warn(`[wa] wake-on-action falhou tenant=${tenantId}:`, e.message));
    return next();
  }

  return res.status(423).json({
    error: 'Funcionalidade bloqueada: WhatsApp não conectado. Acesse a página de Sessão para escanear o QR Code.',
    code: 'WA_DISCONNECTED',
  });
}

module.exports = { requireWAConnected, ensureWAConnected };
