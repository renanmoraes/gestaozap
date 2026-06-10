const router = require('express').Router();
const { getDb } = require('../db');
const {
  verifyOAuthState,
  exchangeCode,
  fetchGoogleEmail,
  saveConnection,
  tenantBookingsUrl,
  isConfigured,
} = require('../services/google-calendar.service');

router.get('/callback', async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).send('Integração Google Calendar não configurada.');
    }

    const { code, state, error } = req.query;
    if (error) {
      return res.status(400).send(`Autorização cancelada: ${error}`);
    }
    if (!code || !state) {
      return res.status(400).send('Parâmetros OAuth inválidos');
    }

    const { tenantId, tenantSlug } = verifyOAuthState(state);
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      console.warn('[google-calendar] refresh_token ausente — reconecte com prompt=consent');
    }

    const db = getDb();
    const googleEmail = await fetchGoogleEmail(tokens.access_token);
    await saveConnection(db, tenantId, tokens, googleEmail);

    const returnUrl = `${tenantBookingsUrl(tenantSlug)}?tab=settings&google=connected`;
    res.redirect(302, returnUrl);
  } catch (err) {
    console.error('[oauth/google-calendar/callback]', err);
    res.status(400).send(`Erro ao conectar Google Calendar: ${err.message}`);
  }
});

module.exports = router;
