const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client = null;
let status = 'disconnected'; // disconnected | qr_ready | connected
let consecutiveFailures = 0;

function initWhatsApp(io) {
  if (client) return;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', async (qr) => {
    status = 'qr_ready';
    const qrDataUrl = await qrcode.toDataURL(qr);
    io.emit('qr', { qr: qrDataUrl });
    io.emit('session:status', { status });
  });

  client.on('ready', () => {
    status = 'connected';
    io.emit('session:ready');
    io.emit('session:status', { status });
  });

  client.on('disconnected', () => {
    status = 'disconnected';
    client = null;
    io.emit('session:disconnected');
    io.emit('session:status', { status });
  });

  client.initialize().catch((err) => {
    console.error('WhatsApp init error:', err.message);
    status = 'disconnected';
    client = null;
    io.emit('session:error', { message: err.message });
    io.emit('session:status', { status });
  });
}

function getStatus() {
  return status;
}

async function sendMessage(phone, message, imagePath) {
  if (!client || status !== 'connected') throw new Error('WhatsApp not connected');
  const chatId = `${phone}@c.us`;
  if (imagePath) {
    const { MessageMedia } = require('whatsapp-web.js');
    const media = MessageMedia.fromFilePath(imagePath);
    await client.sendMessage(chatId, media, { caption: message });
  } else {
    await client.sendMessage(chatId, message);
  }
}

function resetConsecutiveFailures() { consecutiveFailures = 0; }
function incrementFailures() { return ++consecutiveFailures; }
function getConsecutiveFailures() { return consecutiveFailures; }

module.exports = { initWhatsApp, getStatus, sendMessage, resetConsecutiveFailures, incrementFailures, getConsecutiveFailures };
