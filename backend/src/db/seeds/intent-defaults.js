// Templates globais de intenção (tenant_id NULL, system_default=true).
// Motor rule_based — sem IA. Keywords em PT-BR (já normalizadas pelo motor:
// minúsculas e sem acento na hora do match, então aqui pode ter acento).
//
// Quando o admin ativa a feature "intencoes" para um tenant, estes templates
// são copiados para intent_rules com tenant_id preenchido (ver intent.service.js).

const DEFAULT_INTENTS = [
  {
    intentKey: 'opt_out',
    name: 'Sair / parar de receber',
    description: 'Pediu para parar de receber mensagens.',
    keywords: ['sair', 'parar', 'descadastrar', 'cancelar inscricao', 'nao quero receber', 'nao envie mais', 'me tira da lista', 'remover', 'stop', 'pare de enviar'],
    tags: ['opt_out'],
    priority: 100,
    minScore: 0.5,
  },
  {
    intentKey: 'human',
    name: 'Falar com atendente',
    description: 'Quer falar com uma pessoa / atendimento humano.',
    keywords: ['falar com atendente', 'falar com alguem', 'atendente', 'atendimento humano', 'pessoa de verdade', 'quero falar com um humano', 'me transfere', 'suporte humano', 'falar com vendedor', 'quero falar com alguem'],
    tags: ['quer_atendente'],
    priority: 90,
    minScore: 0.6,
  },
  {
    intentKey: 'cancel',
    name: 'Cancelamento',
    description: 'Quer cancelar o serviço/assinatura.',
    keywords: ['cancelar', 'quero cancelar', 'cancelamento', 'encerrar assinatura', 'encerrar conta', 'desistir', 'nao quero mais', 'quero sair do plano', 'rescindir', 'dar baixa'],
    tags: ['risco_cancelamento'],
    priority: 85,
    minScore: 0.6,
  },
  {
    intentKey: 'complaint',
    name: 'Reclamação',
    description: 'Está reclamando ou insatisfeito.',
    keywords: ['reclamacao', 'reclamar', 'pessimo', 'horrivel', 'nao funciona', 'nao gostei', 'insatisfeito', 'decepcionado', 'problema', 'pessima experiencia', 'absurdo', 'descaso', 'reclame aqui', 'procon'],
    tags: ['reclamacao'],
    priority: 80,
    minScore: 0.55,
  },
  {
    intentKey: 'purchase_intent',
    name: 'Intenção de compra',
    description: 'Demonstrou intenção clara de comprar/contratar.',
    keywords: ['quero comprar', 'quero contratar', 'como faco para comprar', 'fechar negocio', 'fechar contrato', 'quero assinar', 'pode mandar o link de pagamento', 'quero fechar', 'como contrato', 'vou querer', 'me manda pra pagar', 'quero adquirir'],
    tags: ['lead_quente'],
    priority: 75,
    minScore: 0.6,
  },
  {
    intentKey: 'payment',
    name: 'Pagamento / boleto / pix',
    description: 'Falou sobre pagamento, boleto, pix ou cartão.',
    keywords: ['boleto', 'pix', 'pagamento', 'pagar', 'forma de pagamento', 'cartao', 'fatura', 'segunda via', 'link de pagamento', 'como pago', 'parcelar', 'parcelamento'],
    tags: ['interesse_pagamento'],
    priority: 70,
    minScore: 0.6,
  },
  {
    intentKey: 'renewal',
    name: 'Renovação',
    description: 'Quer renovar o plano/assinatura.',
    keywords: ['renovar', 'renovacao', 'quero renovar', 'continuar assinando', 'manter o plano', 'prorrogar', 'estender assinatura'],
    tags: ['quer_renovar'],
    priority: 60,
    minScore: 0.6,
  },
  {
    intentKey: 'upgrade',
    name: 'Upgrade de plano',
    description: 'Quer um plano maior / mais recursos.',
    keywords: ['upgrade', 'plano maior', 'plano superior', 'aumentar plano', 'mais recursos', 'subir de plano', 'plano premium', 'fazer upgrade'],
    tags: ['quer_upgrade', 'lead_quente'],
    priority: 55,
    minScore: 0.6,
  },
  {
    intentKey: 'downgrade',
    name: 'Downgrade de plano',
    description: 'Quer reduzir o plano.',
    keywords: ['downgrade', 'plano menor', 'reduzir plano', 'plano mais barato', 'baixar plano', 'diminuir plano', 'plano basico'],
    tags: ['quer_downgrade', 'risco_cancelamento'],
    priority: 50,
    minScore: 0.6,
  },
  {
    intentKey: 'trial',
    name: 'Quer testar',
    description: 'Quer testar / período de teste / demonstração.',
    keywords: ['testar', 'teste gratis', 'periodo de teste', 'trial', 'demonstracao', 'demo', 'experimentar', 'quero testar', 'tem teste gratis', 'avaliar antes', 'free trial'],
    tags: ['quer_teste'],
    priority: 45,
    minScore: 0.6,
  },
  {
    intentKey: 'pricing',
    name: 'Preço / valor / plano',
    description: 'Perguntou preço, valor ou planos.',
    keywords: ['preco', 'valor', 'quanto custa', 'quanto e', 'plano', 'planos', 'mensalidade', 'tabela de precos', 'qual o valor', 'quanto fica', 'orcamento', 'quanto sai', 'investimento'],
    tags: ['interesse_preco'],
    priority: 40,
    minScore: 0.6,
  },
  {
    intentKey: 'schedule',
    name: 'Agendar',
    description: 'Quer agendar um horário / marcar.',
    keywords: ['agendar', 'marcar horario', 'agendamento', 'marcar', 'reservar horario', 'quero agendar', 'tem horario', 'marcar uma reuniao', 'agenda', 'horario disponivel'],
    tags: ['quer_agendar'],
    priority: 38,
    minScore: 0.6,
  },
  {
    intentKey: 'support',
    name: 'Ajuda / suporte',
    description: 'Pediu ajuda ou suporte.',
    keywords: ['ajuda', 'preciso de ajuda', 'suporte', 'me ajuda', 'duvida', 'tenho uma duvida', 'como funciona', 'nao consigo', 'nao sei usar', 'me ajude', 'socorro', 'como faco'],
    tags: ['pediu_suporte'],
    priority: 35,
    minScore: 0.6,
  },
  {
    intentKey: 'competitor',
    name: 'Concorrente',
    description: 'Mencionou um concorrente / comparação.',
    keywords: ['concorrente', 'outra empresa', 'comparar com', 'a outra empresa', 'vi mais barato', 'no concorrente', 'similar ao', 'parecido com', 'mesma coisa que'],
    tags: ['mencionou_concorrente'],
    priority: 30,
    minScore: 0.6,
  },
  {
    intentKey: 'lost_lead',
    name: 'Perdeu interesse',
    description: 'Demonstrou que perdeu o interesse.',
    keywords: ['nao tenho interesse', 'perdi o interesse', 'deixa pra la', 'nao quero mais saber', 'depois eu vejo', 'agora nao', 'nao e o momento', 'talvez mais pra frente', 'esquece'],
    tags: ['lead_frio'],
    priority: 28,
    minScore: 0.6,
  },
  {
    intentKey: 'business_hours',
    name: 'Horário de funcionamento',
    description: 'Perguntou o horário de atendimento.',
    keywords: ['horario de funcionamento', 'que horas abre', 'que horas fecha', 'estao abertos', 'funcionam ate', 'horario de atendimento', 'abrem que horas', 'atende ate que horas', 'funciona no domingo', 'funciona no sabado'],
    tags: ['perguntou_horario'],
    priority: 20,
    minScore: 0.6,
  },
  {
    intentKey: 'location',
    name: 'Endereço / localização',
    description: 'Perguntou o endereço ou localização.',
    keywords: ['endereco', 'onde fica', 'localizacao', 'como chegar', 'qual o endereco', 'onde voces estao', 'fica onde', 'tem loja fisica', 'rua', 'mapa'],
    tags: ['perguntou_local'],
    priority: 18,
    minScore: 0.6,
  },
  {
    intentKey: 'positive_feedback',
    name: 'Elogio / feedback positivo',
    description: 'Elogiou ou demonstrou interesse positivo.',
    keywords: ['adorei', 'amei', 'excelente', 'otimo', 'maravilhoso', 'parabens', 'muito bom', 'gostei muito', 'sensacional', 'perfeito', 'top', 'recomendo'],
    tags: ['feedback_positivo'],
    priority: 15,
    minScore: 0.6,
  },

  // ─── Intenções genéricas para pequenos negócios (varejo/serviços) ───
  {
    intentKey: 'warranty_exchange',
    name: 'Troca / devolução / garantia',
    description: 'Quer trocar, devolver ou acionar garantia de um produto.',
    keywords: ['quero trocar', 'fazer a troca', 'troca do produto', 'devolver', 'devolucao', 'quero devolver', 'esta com defeito', 'veio com defeito', 'garantia', 'dentro da garantia', 'produto com problema', 'com defeito', 'defeito'],
    tags: ['pos_venda', 'atencao'],
    priority: 78,
    minScore: 0.6,
  },
  {
    intentKey: 'urgent',
    name: 'Urgência',
    description: 'Demonstrou urgência ou pressa no atendimento.',
    keywords: ['urgente', 'e urgente', 'pra hoje', 'para hoje', 'com urgencia', 'o mais rapido possivel', 'com pressa', 'preciso agora', 'pode ser hoje', 'ainda hoje', 'o quanto antes'],
    tags: ['urgente', 'prioridade'],
    priority: 72,
    minScore: 0.6,
  },
  {
    intentKey: 'reschedule',
    name: 'Remarcar horário',
    description: 'Quer remarcar, adiar ou trocar o horário de um agendamento.',
    keywords: ['remarcar', 'remarcar horario', 'mudar o horario', 'trocar o horario', 'trocar o dia', 'mudar o dia', 'posso remarcar', 'preciso remarcar', 'adiar', 'antecipar o horario', 'mudar meu agendamento'],
    tags: ['quer_remarcar'],
    priority: 68,
    minScore: 0.6,
  },
  {
    intentKey: 'order_status',
    name: 'Status do pedido',
    description: 'Quer acompanhar/rastrear um pedido em andamento.',
    keywords: ['cade meu pedido', 'status do pedido', 'meu pedido', 'ja saiu para entrega', 'codigo de rastreio', 'rastreamento', 'quando chega', 'previsao de entrega', 'ja postou', 'ja enviou meu pedido', 'rastrear'],
    tags: ['acompanha_pedido'],
    priority: 58,
    minScore: 0.6,
  },
  {
    intentKey: 'delivery',
    name: 'Entrega / frete',
    description: 'Perguntou sobre entrega, frete ou delivery.',
    keywords: ['voces entregam', 'vcs entregam', 'tem entrega', 'fazem entrega', 'tem delivery', 'qual o frete', 'valor do frete', 'entrega em casa', 'entregam na minha regiao', 'taxa de entrega', 'entrega para'],
    tags: ['interesse_entrega'],
    priority: 52,
    minScore: 0.6,
  },
  {
    intentKey: 'invoice',
    name: 'Nota fiscal',
    description: 'Pediu nota fiscal ou cupom.',
    keywords: ['nota fiscal', 'emitir nota', 'cupom fiscal', 'preciso da nota', 'manda a nota', 'nota fiscal eletronica', 'emite nf', 'com nota'],
    tags: ['pediu_nota'],
    priority: 47,
    minScore: 0.6,
  },
  {
    intentKey: 'discount_request',
    name: 'Desconto / negociação',
    description: 'Pediu desconto ou tentou negociar o preço.',
    keywords: ['tem desconto', 'faz por menos', 'melhor preco', 'ultimo preco', 'da um desconto', 'consegue melhorar', 'fazer um precinho', 'sai por quanto a vista', 'desconto a vista', 'qual o melhor valor', 'tem condicao'],
    tags: ['negociando'],
    priority: 46,
    minScore: 0.6,
  },
  {
    intentKey: 'product_availability',
    name: 'Disponibilidade / estoque',
    description: 'Perguntou se um produto está disponível ou em estoque.',
    keywords: ['tem disponivel', 'tem em estoque', 'tem no estoque', 'voces tem', 'vcs tem', 'ainda tem', 'tem pronta entrega', 'tem disponibilidade', 'esta disponivel', 'tem a venda', 'tem esse produto'],
    tags: ['interesse_produto'],
    priority: 44,
    minScore: 0.6,
  },
  {
    intentKey: 'catalog_request',
    name: 'Pedir catálogo / fotos',
    description: 'Quer ver catálogo, cardápio, fotos ou modelos.',
    keywords: ['manda o catalogo', 'tem catalogo', 'quero ver as fotos', 'manda foto', 'tem cardapio', 'ver o cardapio', 'lista de produtos', 'tabela de produtos', 'manda os modelos', 'quero ver os modelos', 'tem fotos'],
    tags: ['pediu_catalogo', 'lead_quente'],
    priority: 42,
    minScore: 0.6,
  },
];

/**
 * Seed dos templates globais de intenção (tenant_id NULL).
 * Idempotente via ON CONFLICT no índice parcial uniq_intent_rule_global.
 */
async function seedIntentDefaults(pool) {
  const client = await pool.connect();
  try {
    for (const it of DEFAULT_INTENTS) {
      await client.query(
        `INSERT INTO intent_rules
           (tenant_id, intent_key, name, description, keywords, regex_patterns, tags, priority, min_score, system_default, active)
         VALUES (NULL, $1, $2, $3, $4, '{}', $5, $6, $7, true, true)
         ON CONFLICT (intent_key) WHERE tenant_id IS NULL AND system_default DO NOTHING`,
        [
          it.intentKey,
          it.name,
          it.description,
          it.keywords,
          it.tags,
          it.priority,
          String(it.minScore),
        ],
      );
    }
    console.log('[db] intenções padrão (templates globais) seed aplicado');
  } finally {
    client.release();
  }
}

module.exports = { DEFAULT_INTENTS, seedIntentDefaults };
