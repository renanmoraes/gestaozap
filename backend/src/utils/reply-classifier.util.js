// All patterns are tested against normalizeText() output: lowercase, no accents, no punctuation.
// Negative is checked first so "nao vou" doesn't get classified as positive via "vou".

const POSITIVE_PATTERNS = [
  // affirmatives
  /\bsim\b/i,
  /\bok\b/i,
  /\bokey\b/i,
  /\bblz\b/i,
  /\bbeleza\b/i,
  /\bfechou\b/i,
  /\bpartiu\b/i,
  /\bbora\b/i,
  /\btopo\b/i,
  /\btop\b/i,
  /\bshow\b/i,
  /\bperfeito\b/i,
  /\botimo\b/i,
  /\bmaravilha\b/i,
  /\bclaro\b/i,
  /\bafirmativo\b/i,
  /\bpositivo\b/i,
  // confirmations
  /\bcom certeza\b/i,
  /\bcerteza\b/i,
  /\bconfirmo\b/i,
  /\bconfirmad[a-z]+\b/i,
  /\bja confirmo\b/i,
  /\bpode confirmar\b/i,
  /\bpode contar comigo\b/i,
  /\bcom prazer\b/i,
  // intent to attend
  /\bvou\b/i,
  /\bvou sim\b/i,
  /\bvou comparecer\b/i,
  /\bvou estar la\b/i,
  /\bto la\b/i,
  /\bto indo\b/i,
  /\bestarei\b/i,
  /\biremos\b/i,
  /\bvamos\b/i,
  /\bestamos dentro\b/i,
  /\bpresen[ct]e\b/i,
  /\bestarei presente\b/i,
  /\bquero ir\b/i,
  /\bcombinado\b/i,
  // positive emojis
  /👍|✅|🤝|🎉|🥳|🙌|🎊|😁|🤩/,
];

const NEGATIVE_PATTERNS = [
  // negations
  /\bnao\b/i,
  /\bnao vai dar\b/i,
  /\bnao da\b/i,
  /\bnao posso\b/i,
  /\bnao tenho como\b/i,
  /\bnao consigo\b/i,
  /\bnao poderei\b/i,
  /\bnao da para\b/i,
  /\bnao vai ser possivel\b/i,
  /\bnao vou\b/i,
  // expressions
  /\binfelizmente\b/i,
  /\bsem chance\b/i,
  /\bnao rola\b/i,
  /\bdesculpa\b/i,
  /\bimpossivel\b/i,
  /\bestou ocupado\b/i,
  /\bestou ocupada\b/i,
  // negative emojis
  /👎|❌|😞|😔|😢|😟|😕/,
];

const GREETING_PATTERNS = [
  /^oi\b/i,
  /^ola\b/i,
  /^bom dia\b/i,
  /^boa tarde\b/i,
  /^boa noite\b/i,
  /^e ai\b/i,
  /^opa\b/i,
];

function normalizeText(text) {
  return String(text || '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[!?,.;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyReply(text) {
  const normalized = normalizeText(text);
  if (!normalized) return 'neutral';

  // Negative checked first: "nao vou" must not be classified positive via "vou"
  if (NEGATIVE_PATTERNS.some((rx) => rx.test(normalized))) return 'negative';
  if (POSITIVE_PATTERNS.some((rx) => rx.test(normalized))) return 'positive';
  return 'neutral';
}

function isGreetingReply(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  const onlyGreeting = GREETING_PATTERNS.some((rx) => rx.test(normalized));
  if (!onlyGreeting) return false;

  const sentiment = classifyReply(normalized);
  if (sentiment !== 'neutral') return false;

  return normalized.split(' ').length <= 4;
}

module.exports = { classifyReply, isGreetingReply, normalizeText };
