# Design — Scheduler inteligente, cota/excedente e performance da agenda

**Data:** 2026-06-08
**Branch:** `feat/scheduler-cota-agenda`
**Status:** aprovado (direção + números), pendente revisão do spec

## Contexto

GestãoZap dispara campanhas WhatsApp por tenant via **Bull + Redis** (uma fila
`send-queue:${tenantId}` por conta). Hoje:

- O endpoint `GET /api/contacts` (`backend/src/routes/contacts.routes.js:39`)
  retorna **todas** as linhas que casam, **sem LIMIT/paginação**. Com contas de
  40k+ contatos (ex: `procuraqui` = 43.140), abrir a agenda carrega e serializa
  tudo. Esse é o gargalo nº1, não a falta de índice.
- O processador da fila (`backend/src/services/queue.service.js:122`) checa o
  horário **uma única vez no início** do job. Fora da janela ele **descarta o
  envio inteiro** (`skippedForHours: true`, 0 enviados) — não agenda, não retoma.
- Cota/billing já tem base parcial: `plans.messagesPerMonth`, `contracts`,
  `message_usage` (1 linha por mensagem, com `month`), `payment_records` com tipo
  `per_message`. `trackMessageUsage()` (`queue.service.js:71`) já conta cada
  envio. Faltam: preço de excedente, limite de concorrência, endpoint de consumo
  e UI.

## Objetivos

1. **Agenda rápida** mesmo com dezenas de milhares de contatos.
2. **Scheduler inteligente:** fora do horário → avisa + agenda pro próximo horário
   válido + pausa/retoma **automaticamente** atravessando dias até concluir.
3. **Dashboard de cota:** por plano, mostrar cota / enviados / excedente a pagar +
   envios simultâneos usados/permitidos, com bloqueio de concorrência acima do
   limite.

## Não-objetivos (YAGNI)

- Janela por-tenant ou regra de dias da semana (decisão: **janela global, só
  horas**, padrão **8h–20h America/Sao_Paulo**).
- Cobrança real do excedente via Asaas (apenas **registrar** `payment_records`;
  a cobrança efetiva fica para a integração Asaas já planejada — Fase 2).
- Reescrever a fila para um-job-por-contato.

## Decisões de produto confirmadas

| Item | Starter | Pro | Business |
|---|---|---|---|
| Preço por msg excedente (`overage_price_brl`) | R$ 0,10 | R$ 0,08 | — (ilimitado) |
| Envios simultâneos (`max_concurrent_sends`) | 1 | 3 | 10 |

- Janela global padrão: **8h–20h (Brasília)**.
- Excedente **nunca bloqueia** o envio; bloqueio só por **concorrência**.

---

## Subsistema 1 — Performance da agenda

### Backend
- Paginar `GET /api/contacts`: aceitar `limit` (default 50, máx 200) e `offset`.
  Resposta passa a `{ items, total }` (total via `COUNT(*)` com os mesmos
  filtros). Busca server-side (`q`, `tag`) permanece.
- Demais consumidores que dependem do formato antigo (array puro) precisam ser
  ajustados — auditar usos de `/api/contacts` no frontend antes de mudar o
  contrato (ex: tela de campanha que seleciona contatos).

### Migration (índices)
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_contacts_name_trgm  ON contacts USING gin (name  gin_trgm_ops);
CREATE INDEX idx_contacts_phone_trgm ON contacts USING gin (phone gin_trgm_ops);
CREATE INDEX idx_contacts_tenant_active_created
  ON contacts (tenant_id, active, created_at);
CREATE INDEX idx_contacts_tags ON contacts USING gin (tags);
-- suporte ao dashboard de cota:
CREATE INDEX idx_message_usage_tenant_month ON message_usage (tenant_id, month);
CREATE INDEX idx_send_logs_tenant_campaign  ON send_logs (tenant_id, campaign_id);
CREATE INDEX idx_send_logs_tenant_status    ON send_logs (tenant_id, status);
```
Criar com a migration idempotente padrão do projeto (`db:migrate`). Em produção,
criar com `CONCURRENTLY` se a tabela estiver sob carga (avaliar no plano).

### Frontend (`Contacts.jsx`)
- Scroll infinito (ou paginação) consumindo `{ items, total }`.
- Debounce (~300ms) no campo de busca para não disparar request por tecla.

### Critérios de aceite
- Abrir agenda de uma conta com 43k contatos retorna a 1ª página em < 300ms.
- Buscar por nome/telefone parcial usa índice (verificar via `EXPLAIN` que não há
  seq scan).

---

## Subsistema 2 — Scheduler inteligente

**Abordagem escolhida: continuação durável com `delay` no Bull.**

### Comportamento
1. O check de horário passa para **dentro do loop**, avaliado a cada **lote**
   (`batch_size`, hoje 30) — não só no início.
2. Quando a hora atual sai da janela `[hourStart, hourEnd)`:
   - Emite `send:paused` com `reason: 'outside_hours'` + `resumesAt` (timestamp da
     próxima abertura) para a UI alertar.
   - **Re-enfileira um job de continuação** na mesma fila do tenant com:
     - `contacts`: o restante (`contacts.slice(i)`),
     - todos os demais campos do job (campaignId, text, etc.),
     - `delay = msAtéPróximaAbertura`.
   - Encerra o job atual com `{ rescheduled: true, resumesAt }`.
3. O Bull persiste o job atrasado no Redis → **sobrevive a restart do backend** e
   **dispara sozinho** na próxima janela. Um envio longo (ex: 3 dias) encadeia
   continuações automaticamente, parando toda noite e retomando toda manhã.

### Cálculo da próxima abertura
- `hour >= hourEnd` → próxima abertura = **amanhã** às `hourStart`.
- `hour <  hourStart` → próxima abertura = **hoje** às `hourStart`.
- Tudo em `America/Sao_Paulo` (já é o TZ do container; `getHours()` retorna hora
  de Brasília — verificado em produção).

### Idempotência e segurança
- A unique existente `send_logs (tenant_id, send_job_id, phone)` + o
  `INSERT ... ON CONFLICT DO NOTHING` garantem que reprocessamento de uma
  continuação **não duplica** envio.
- **Atenção:** a continuação é um **novo `jobId`**. O `send_job_id` gravado em
  `send_logs` muda entre continuações, então a unit de dedupe por `send_job_id`
  só protege dentro da mesma continuação, não entre elas. Para dedupe de ponta a
  ponta do mesmo envio, a continuação deve **propagar um `dispatchId` estável**
  (gerado no primeiro disparo) e a dedupe/contagem usar esse `dispatchId` em vez
  de `jobId`. Isso será detalhado no plano (provável coluna nova
  `send_logs.dispatch_id` + ajuste do índice de dedupe).
- Pause/cancel manual (flags Redis em `config/queue.js`) continuam válidos e têm
  precedência sobre a retomada automática.
- Kill switch e quality gate (já existentes) inalterados.

### Critérios de aceite
- Disparar às 19h55 um envio que cruza as 20h: ele pausa no lote seguinte às 20h,
  emite `resumesAt` = amanhã 08:00, e retoma sozinho às 08:00 sem ação humana.
- Reiniciar o backend durante a pausa noturna não perde o envio: ele retoma na
  janela seguinte.
- Nenhum contato recebe a mensagem duas vezes entre continuações.

---

## Subsistema 3 — Cota, excedente e concorrência

### Modelo de dados
- `plans`: adicionar `overage_price_brl numeric(10,4)` (nullable; null em planos
  ilimitados) e `max_concurrent_sends integer NOT NULL DEFAULT 1`.
- Popular os valores confirmados (starter/pro/business) via seed/migration.

### Endpoint `GET /api/usage`
Retorna, para o tenant autenticado:
```json
{
  "plan": { "slug": "starter", "name": "Starter", "messagesPerMonth": 500 },
  "month": "2026-06",
  "used": 312,
  "quota": 500,
  "overage": 0,
  "overagePriceBrl": 0.10,
  "overageCostBrl": 0.00,
  "concurrency": { "inUse": 1, "allowed": 1 }
}
```
- `used` = `COUNT(message_usage WHERE tenant_id = ? AND month = ?)`.
- `quota` null (business) ⇒ `overage` sempre 0, UI mostra "ilimitado".
- `concurrency.inUse` = nº de jobs ativos+aguardando da fila do tenant (Bull
  `getActiveCount() + getWaitingCount()` ou contagem própria).

### Concorrência (enforcement)
- No `POST /api/send` (`send.routes.js`), antes de enfileirar: se
  `inUse >= max_concurrent_sends`, responder `409` com mensagem clara
  ("Limite de N envios simultâneos do seu plano atingido"). Continuações
  agendadas (subsistema 2) **não contam** como novo envio para esse limite — são
  o mesmo envio retomando; o plano deve marcá-las (ex: flag `isContinuation` no
  job) para não inflar a contagem nem barrar a retomada.

### Excedente (registro, sem cobrança real)
- Excedente nunca bloqueia o envio.
- Cron mensal (junto de `cron/contractExpiry.js`) fecha o mês anterior: para cada
  tenant com `used > quota`, cria/atualiza um `payment_records` tipo
  `per_message`, `referenceMonth`, `amountBrl = (used - quota) * overage_price`.
  Cobrança efetiva fica para a integração Asaas (Fase 2).

### Frontend — card de cota no dashboard
- Mostrar: barra cota usada/total, custo de excedente projetado, e
  "envios simultâneos X/Y". Implementação visual definida na fase de plano
  (skill frontend-design + possível mock no companion visual).

### Correção de dados (pré-requisito)
- `procuraqui` tem **dois contratos ativos** (Starter + Business). Antes de
  qualquer cálculo de cota, resolver para **um único** contrato ativo por tenant.
  Definir qual mantém (provável: o pretendido pelo dono) e expirar/cancelar o
  outro. Avaliar constraint para impedir 2 contratos ativos por tenant
  (índice único parcial `WHERE status = 'active'`).

### Critérios de aceite
- Conta starter com 312/500 enviados mostra "312/500, R$0,00 de excedente".
- Ultrapassar 500 não bloqueia; dashboard passa a mostrar excedente > 0 e custo
  projetado correto.
- 2º envio simultâneo numa conta starter (limite 1) é barrado com 409; a
  retomada automática de um envio pausado **não** é barrada.

---

## Ordem de implementação sugerida (no plano)

1. **Correção de dados** (contrato duplicado do procuraqui) + constraint.
2. **Subsistema 1** (índices + paginação + frontend) — isolado, baixo risco.
3. **Subsistema 3** (campos de plano, `/api/usage`, enforcement de concorrência,
   cron de excedente, card no dashboard).
4. **Subsistema 2** (refactor do processador para continuação durável +
   `dispatch_id`) — o de maior risco; por último, com testes de continuação.

## Riscos / pontos de atenção

- **Mudança de contrato da API `/api/contacts`** (array → `{items,total}`):
  auditar todos os consumidores no frontend antes de mudar.
- **`dispatch_id` estável** entre continuações é essencial para não duplicar
  envio nem contar errado a cota num envio multi-dia.
- **Criação de índices em produção** sobre tabela grande: usar `CONCURRENTLY`.
- **Contagem de concorrência** precisa distinguir envio novo de continuação.

## Testes

- Unit: cálculo de próxima abertura da janela (vários horários/limites).
- Unit: cálculo de excedente e custo (quota null, abaixo, acima).
- Integração: continuação atravessando a janela não duplica `send_logs`.
- Integração: enforcement de concorrência (novo bloqueia, continuação passa).
- Performance: `EXPLAIN` confirma uso dos índices trigram/composto.
