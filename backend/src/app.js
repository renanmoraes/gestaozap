require('dotenv').config();
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Cada conexão Socket.IO entra na sala do seu tenant (eventos isolados por tenant)
const { DEFAULT_TENANT_ID } = require('./db');
io.on('connection', (socket) => {
  // Aceita tenantId do auth handshake, query param, ou usa o tenant default (modo dev)
  const tenantId = socket.handshake.auth?.tenantId || socket.handshake.query?.tenantId || DEFAULT_TENANT_ID;
  socket.join(tenantId);
});

app.use(cors({ origin: true, credentials: true }));
// Limite generoso — importação de contatos do WhatsApp pode trazer milhares.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Serve uploads garantindo Content-Type correto para áudios do WhatsApp (Opus/OGG).
// Sem isso, browsers retornam "unsupported" porque o MIME default não bate.
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res, filepath) => {
    const ext = path.extname(filepath).toLowerCase();
    const map = {
      // WhatsApp envia áudio .ogg sempre como Opus — declarar codec ajuda Chrome/Firefox
      '.ogg':  'audio/ogg; codecs=opus',
      '.oga':  'audio/ogg; codecs=opus',
      '.opus': 'audio/ogg; codecs=opus',
      '.mp3':  'audio/mpeg',
      '.m4a':  'audio/mp4',
      '.aac':  'audio/aac',
      '.wav':  'audio/wav',
      '.webm': 'audio/webm',
      '.mp4':  'video/mp4',
      '.mov':  'video/quicktime',
    };
    if (map[ext]) res.setHeader('Content-Type', map[ext]);
    res.setHeader('Accept-Ranges', 'bytes'); // permite seek/scrubbing no <audio>
  },
}));

// Health check (sem middleware de auth)
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date() }));

// ASAAS webhook — sem tenant middleware
app.use('/api/asaas', require('./routes/asaas.routes'));

// Middlewares
const tenantResolver = require('./middleware/tenantResolver');
const requireAdmin = require('./middleware/requireAdmin');
const requireTenant = require('./middleware/requireTenant');

// AUTH_REQUIRED=false apenas em dev explícito; produção exige token
const authRequired = process.env.AUTH_REQUIRED !== 'false'
  && (process.env.AUTH_REQUIRED === 'true' || process.env.NODE_ENV === 'production');
const authGuard = authRequired ? requireTenant : (req, res, next) => next();

// Afiliados: rotas públicas (/validate/:code, /register) + admin protegido
const affiliatesRoutes = require('./routes/affiliates.routes');
app.use('/api/admin/affiliates', requireAdmin, affiliatesRoutes);
app.use('/api/affiliates', affiliatesRoutes);

const adminRoutes = require('./routes/admin.routes');
app.use('/api/admin', requireAdmin, adminRoutes);

// Rotas de auth (públicas por design — é onde o token é criado)
app.use('/api/auth', require('./routes/auth.routes'));

// Pré-cadastro self-service (público) — cria conta 'pending' p/ aprovação do admin
app.use('/api/signup', require('./routes/signup.routes'));

// Rotas de negócio: tenantResolver resolve o tenant + authGuard verifica token (quando AUTH_REQUIRED)
app.use('/api/session', tenantResolver, authGuard, require('./routes/session.routes'));
app.use('/api/contacts', tenantResolver, authGuard, require('./routes/contacts.routes'));
app.use('/api/campaigns', tenantResolver, authGuard, require('./routes/campaigns.routes'));
app.use('/api/send', tenantResolver, authGuard, require('./routes/send.routes'));
app.use('/api/logs', tenantResolver, authGuard, require('./routes/logs.routes'));
app.use('/api/queue', tenantResolver, authGuard, require('./routes/queue.routes'));
app.use('/api/backup', tenantResolver, authGuard, require('./routes/backup.routes'));
app.use('/api/billing', tenantResolver, authGuard, require('./routes/billing.routes'));
app.use('/api/usage', tenantResolver, authGuard, require('./routes/usage.routes'));
app.use('/api/affiliate', tenantResolver, authGuard, require('./routes/affiliate-portal.routes'));
app.use('/api/chats', tenantResolver, authGuard, require('./routes/chats.routes'));
app.use('/api/quick-replies', tenantResolver, authGuard, require('./routes/quick-replies.routes'));
app.use('/api/features', tenantResolver, authGuard, require('./routes/features.routes'));
app.use('/api/promotions', tenantResolver, authGuard, require('./routes/promotions.routes'));
app.use('/api/bookings', tenantResolver, authGuard, require('./routes/bookings.routes'));
app.use('/api/intent-rules', tenantResolver, authGuard, require('./routes/intent-rules.routes'));
app.use('/api/tenant/profile', tenantResolver, authGuard, require('./routes/tenant-profile.routes'));
app.use('/api/public/promotions', tenantResolver, require('./routes/public-promotions.routes'));
app.use('/api/public/bookings', tenantResolver, require('./routes/public-bookings.routes'));
app.use('/api/oauth/google-calendar', require('./routes/google-calendar-oauth.routes'));

app.set('io', io);

const PORT = process.env.PORT || 3001;

const { registerProcessor } = require('./services/queue.service');
const { scheduleAutoBackup } = require('./services/backup.service');
const { startConfigPoller } = require('./config/platform');
const { scheduleContractExpiryCheck } = require('./cron/contractExpiry');
const { scheduleOverageBilling } = require('./cron/overageBilling');
const { schedulePromotionExpiryCheck } = require('./cron/promotionExpiry');
const { scheduleBookingUpcomingAlerts } = require('./cron/bookingUpcoming');
const { scheduleBookingReminderJobs } = require('./cron/bookingReminders');
const { setIo } = require('./config/registry');

if (require.main === module) {
  setIo(io);
  connectDB().then(() => {
    startConfigPoller();
    registerProcessor(io);
    require('./services/intent-history.service').registerIntentHistoryProcessor(io).catch((e) => console.warn('[intent] history processor:', e.message));
    scheduleAutoBackup();
    scheduleContractExpiryCheck();
    scheduleOverageBilling();
    schedulePromotionExpiryCheck();
    scheduleBookingUpcomingAlerts();
    scheduleBookingReminderJobs();
    server.listen(PORT, () => console.log(`Backend running on :${PORT}`));

    // Auto-restaura sessões WhatsApp que estavam ativas (usa cache do LocalAuth).
    // Roda 3s depois do boot para garantir que tudo está pronto.
    setTimeout(() => {
      const { autoReconnectSessions } = require('./services/whatsapp.service');
      autoReconnectSessions(io);
    }, 3000);
  });
}

module.exports = { app, server, io };
