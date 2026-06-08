const { classifyReply, isGreetingReply } = require('../utils/reply-classifier.util');

describe('classifyReply — positive', () => {
  const cases = [
    'sim, vou sim',
    'ok, confirmado',
    'Sim!',
    'Sim, iremos',
    'Confirmadíssimo!',
    'Pode confirmar',
    'Certeza',
    'blz',
    'beleza',
    'fechou',
    'partiu',
    'bora',
    'topo',
    'top',
    'show',
    'perfeito',
    'ótimo',
    'maravilha',
    'claro',
    'afirmativo',
    'positivo',
    'com certeza',
    'já confirmo',
    'pode contar comigo',
    'com prazer',
    'vou sim',
    'vou comparecer',
    'vou estar lá',
    'tô lá',
    'tô indo',
    'estarei',
    'iremos',
    'vamos',
    'estamos dentro',
    'presente',
    'estarei presente',
    'quero ir',
    'combinado',
    '👍',
    '✅',
    '🎉',
    '🥳',
    '🙌',
  ];

  cases.forEach((text) => {
    it(`classifica "${text}" como positive`, () => {
      expect(classifyReply(text)).toBe('positive');
    });
  });
});

describe('classifyReply — negative', () => {
  const cases = [
    'nao vou conseguir',
    'infelizmente não vai dar',
    'não',
    'nao',
    'não posso',
    'não tenho como',
    'não consigo',
    'não poderei ir',
    'não dá para mim',
    'sem chance',
    'não rola',
    'desculpa',
    'impossível',
    'estou ocupado',
    'estou ocupada',
    '👎',
    '❌',
    '😞',
  ];

  cases.forEach((text) => {
    it(`classifica "${text}" como negative`, () => {
      expect(classifyReply(text)).toBe('negative');
    });
  });
});

describe('classifyReply — negação prevalece sobre afirmação', () => {
  it('"não vou" é negative (não sobrescreve o "vou" positivo)', () => {
    expect(classifyReply('não vou')).toBe('negative');
  });

  it('"nao vou conseguir" é negative', () => {
    expect(classifyReply('nao vou conseguir')).toBe('negative');
  });
});

describe('classifyReply — neutral', () => {
  it('texto vazio é neutral', () => {
    expect(classifyReply('')).toBe('neutral');
  });

  it('"talvez mais tarde" é neutral', () => {
    expect(classifyReply('talvez mais tarde')).toBe('neutral');
  });

  it('"obrigado pelo convite" é neutral', () => {
    expect(classifyReply('obrigado pelo convite')).toBe('neutral');
  });
});

describe('isGreetingReply', () => {
  it('detecta saudação simples', () => {
    expect(isGreetingReply('oi')).toBe(true);
    expect(isGreetingReply('bom dia!')).toBe(true);
    expect(isGreetingReply('olá')).toBe(true);
  });

  it('não classifica como saudação quando tem confirmação', () => {
    expect(isGreetingReply('bom dia, vou sim')).toBe(false);
    expect(isGreetingReply('sim confirmado')).toBe(false);
    expect(classifyReply('bom dia, vou sim')).toBe('positive');
  });
});
