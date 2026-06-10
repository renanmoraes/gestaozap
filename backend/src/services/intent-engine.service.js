// Motor de detecção de intenção — rule_based, SEM IA.
// Funções puras (sem DB) para facilitar testes. A camada de aplicação
// (intent.service.js) é quem busca regras e persiste eventos.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Normaliza texto: minúsculas, remove acentos, colapsa espaços. */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True se a keyword (já normalizada) aparece no texto como palavra/frase delimitada. */
function keywordMatches(normalizedText, keyword) {
  const kw = normalize(keyword);
  if (!kw) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(kw)}([^a-z0-9]|$)`);
  return re.test(normalizedText);
}

/**
 * Pontua uma regra contra um texto normalizado.
 * confidence cresce com o nº de sinais batidos (keywords + regex), teto 1.0.
 * @returns {{ confidence: number, matchedKeywords: string[], matchedRegex: string[] }}
 */
function scoreRule(normalizedText, rule) {
  const matchedKeywords = [];
  const matchedRegex = [];

  for (const kw of rule.keywords || []) {
    if (keywordMatches(normalizedText, kw)) matchedKeywords.push(kw);
  }
  for (const pattern of rule.regexPatterns || []) {
    try {
      // Regex do usuário roda contra o texto normalizado (case-insensitive já implícito).
      if (new RegExp(pattern, 'i').test(normalizedText)) matchedRegex.push(pattern);
    } catch (_) {
      // padrão inválido → ignora
    }
  }

  const matched = matchedKeywords.length + matchedRegex.length;
  if (matched === 0) {
    return { confidence: 0, matchedKeywords, matchedRegex };
  }
  // 1 sinal = 0.75; cada sinal extra +0.08; teto 1.0.
  const confidence = Math.min(1, 0.75 + 0.08 * (matched - 1));
  return {
    confidence: Math.round(confidence * 100) / 100,
    matchedKeywords,
    matchedRegex,
  };
}

/**
 * Detecta intenções num texto contra uma lista de regras ativas.
 * Aplica min_score por regra. Ordena por prioridade desc, depois confiança desc.
 * @param {string} text
 * @param {Array} rules
 * @param {{ multi?: boolean }} [opts] multi=true retorna todas que passaram; senão só a melhor.
 * @returns {Array<{ rule, intentKey, confidence, matchedKeywords, matchedRegex }>}
 */
function detectIntents(text, rules = [], opts = {}) {
  const normalizedText = normalize(text);
  if (!normalizedText) return [];

  const hits = [];
  for (const rule of rules) {
    if (rule.active === false) continue;
    const { confidence, matchedKeywords, matchedRegex } = scoreRule(normalizedText, rule);
    const minScore = Number(rule.minScore ?? 0.6);
    if (confidence >= minScore && confidence > 0) {
      hits.push({
        rule,
        intentKey: rule.intentKey,
        confidence,
        matchedKeywords,
        matchedRegex,
      });
    }
  }

  hits.sort((a, b) => {
    const pa = Number(a.rule.priority ?? 0);
    const pb = Number(b.rule.priority ?? 0);
    if (pb !== pa) return pb - pa;
    return b.confidence - a.confidence;
  });

  return opts.multi ? hits : hits.slice(0, 1);
}

/** Diferença em dias inteiros entre referenceDate e intentDate (>= 0 para passado). */
function diffInDays(intentDate, referenceDate) {
  const ref = new Date(referenceDate).getTime();
  const intent = new Date(intentDate).getTime();
  return Math.floor((ref - intent) / MS_PER_DAY);
}

/** Temperatura temporal calculada dinamicamente (spec §11). */
function getIntentTemperature(intentDate, referenceDate = new Date()) {
  const days = diffInDays(intentDate, referenceDate);
  if (days <= 7) return 'hot';
  if (days <= 30) return 'warm';
  if (days <= 90) return 'cool';
  if (days <= 365) return 'cold';
  return 'expired';
}

/** Peso temporal (spec §12). */
function getTemporalWeight(days) {
  if (days <= 7) return 1.0;
  if (days <= 30) return 0.7;
  if (days <= 90) return 0.4;
  if (days <= 365) return 0.15;
  return 0.03;
}

/** final_score = confidence * peso_temporal (spec §12). */
function finalScore(confidence, intentDate, referenceDate = new Date()) {
  const days = diffInDays(intentDate, referenceDate);
  const weight = getTemporalWeight(days);
  return Math.round(Number(confidence) * weight * 1000) / 1000;
}

/** Mapeia uma temperatura para a janela de dias [minDays, maxDays] (inclusivo). */
const TEMPERATURE_WINDOWS = {
  hot: [0, 7],
  warm: [8, 30],
  cool: [31, 90],
  cold: [91, 365],
  expired: [366, Infinity],
};

module.exports = {
  normalize,
  keywordMatches,
  scoreRule,
  detectIntents,
  diffInDays,
  getIntentTemperature,
  getTemporalWeight,
  finalScore,
  TEMPERATURE_WINDOWS,
};
