const {
  normalize,
  scoreRule,
  detectIntents,
  getIntentTemperature,
  getTemporalWeight,
  finalScore,
} = require('../services/intent-engine.service');

const { DEFAULT_INTENTS } = require('../db/seeds/intent-defaults');

// Regras de teste (formato compatível com intent_rules)
const rules = DEFAULT_INTENTS.map((it) => ({
  intentKey: it.intentKey,
  keywords: it.keywords,
  regexPatterns: [],
  tags: it.tags,
  priority: it.priority,
  minScore: it.minScore,
  active: true,
}));

describe('normalize', () => {
  it('remove acentos e baixa caixa', () => {
    expect(normalize('Quanto CUSTA o Plano Pró?')).toBe('quanto custa o plano pro?');
  });
  it('colapsa espaços', () => {
    expect(normalize('  oi    mundo ')).toBe('oi mundo');
  });
});

describe('scoreRule', () => {
  const pricing = rules.find((r) => r.intentKey === 'pricing');

  it('não pontua sem match', () => {
    expect(scoreRule(normalize('bom dia, tudo certo?'), pricing).confidence).toBe(0);
  });

  it('1 sinal = 0.75', () => {
    const res = scoreRule(normalize('qual o investimento disso?'), pricing);
    expect(res.confidence).toBe(0.75);
    expect(res.matchedKeywords).toContain('investimento');
  });

  it('mais sinais aumentam a confiança (teto 1.0)', () => {
    const res = scoreRule(normalize('quanto custa? qual o preco e o valor do plano?'), pricing);
    expect(res.confidence).toBeGreaterThan(0.75);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });

  it('não casa substring parcial (word boundary)', () => {
    // "apreco" não deve casar "preco"
    expect(scoreRule(normalize('apreco muito isso'), pricing).matchedKeywords).not.toContain('preco');
  });
});

describe('detectIntents', () => {
  it('classifica pergunta de preço como pricing', () => {
    const hits = detectIntents('Oi, queria saber quanto custa o plano Pro', rules);
    expect(hits.length).toBe(1);
    expect(hits[0].intentKey).toBe('pricing');
    expect(hits[0].confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('prioriza opt_out sobre outras em overlap', () => {
    const hits = detectIntents('quero cancelar e sair, parar de receber', rules, { multi: true });
    // opt_out (prio 100) deve vir antes de cancel (prio 85)
    expect(hits[0].intentKey).toBe('opt_out');
  });

  it('retorna vazio para texto sem intenção', () => {
    expect(detectIntents('kkkk', rules)).toEqual([]);
  });

  it('ignora regras inativas', () => {
    const inactive = rules.map((r) => ({ ...r, active: false }));
    expect(detectIntents('quanto custa o plano', inactive)).toEqual([]);
  });

  it('multi=true captura várias intenções numa só mensagem', () => {
    const hits = detectIntents('qual o preço? vocês entregam? é urgente', rules, { multi: true });
    const keys = hits.map((h) => h.intentKey);
    expect(keys).toEqual(expect.arrayContaining(['pricing', 'delivery', 'urgent']));
    expect(keys.length).toBeGreaterThanOrEqual(3);
    // ordenado por prioridade desc (urgent=72 antes de delivery=52 antes de pricing=40)
    expect(keys.indexOf('urgent')).toBeLessThan(keys.indexOf('pricing'));
  });
});

describe('temperatura e peso temporal (spec §11/§12)', () => {
  const ref = new Date('2026-06-10T12:00:00Z');

  it('temperatura por janela', () => {
    expect(getIntentTemperature(new Date('2026-06-03T12:00:00Z'), ref)).toBe('hot');   // 7d
    expect(getIntentTemperature(new Date('2026-05-20T12:00:00Z'), ref)).toBe('warm');  // 21d
    expect(getIntentTemperature(new Date('2026-04-01T12:00:00Z'), ref)).toBe('cool');  // ~70d
    expect(getIntentTemperature(new Date('2025-12-01T12:00:00Z'), ref)).toBe('cold');  // ~191d
    expect(getIntentTemperature(new Date('2021-01-01T12:00:00Z'), ref)).toBe('expired');
  });

  it('pesos temporais', () => {
    expect(getTemporalWeight(7)).toBe(1.0);
    expect(getTemporalWeight(30)).toBe(0.7);
    expect(getTemporalWeight(90)).toBe(0.4);
    expect(getTemporalWeight(365)).toBe(0.15);
    expect(getTemporalWeight(2000)).toBe(0.03);
  });

  it('final_score = confidence * peso (exemplos da spec)', () => {
    // compra há 7 dias: 0.90 * 1.00 = 0.90
    expect(finalScore(0.9, new Date('2026-06-03T12:00:00Z'), ref)).toBe(0.9);
    // compra há ~5 anos: 0.90 * 0.03 = 0.027
    expect(finalScore(0.9, new Date('2021-06-10T12:00:00Z'), ref)).toBe(0.027);
  });
});
