// Modelo substituído por Drizzle ORM — use getDb() + schema.feedbackAnalyses diretamente nas rotas
const { feedbackAnalyses } = require('../db/schema');
module.exports = feedbackAnalyses;
