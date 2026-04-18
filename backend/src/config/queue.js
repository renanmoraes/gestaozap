const Bull = require('bull');

const sendQueue = new Bull('send-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

module.exports = { sendQueue };
