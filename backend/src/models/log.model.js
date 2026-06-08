// Modelo substituído por Drizzle ORM — use getDb() + schema.sendLogs diretamente nas rotas
const { sendLogs } = require('../db/schema');
module.exports = sendLogs;
