# Scheduler, Cota/Excedente e Performance da Agenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a agenda rápida com 40k+ contatos, fazer envios fora do horário se agendarem e retomarem sozinhos atravessando dias, e expor cota/excedente/concorrência por plano.

**Architecture:** Backend Express + Drizzle/Postgres; fila Bull+Redis (uma por tenant). Migrations são SQL cru idempotente em `src/db/migrate.js`. Scheduler usa **jobs de continuação atrasados** (`delay`) no Bull para pausar/retomar. Lógica pura (janela, excedente) testada via Jest sem DB.

**Tech Stack:** Node 20, Express 4, Drizzle ORM, Postgres 16 (`pg_trgm`), Bull 4 + Redis, React (Vite), Jest 29.

---

## ⚠️ Estado do harness de testes (ler antes de começar)

- `npm test` hoje roda **zero** testes: o script ignora `__tests__/` (`--testPathIgnorePatterns='__tests__'`) e os arquivos lá são **obsoletos** (era Mongo/Mongoose; referenciam `config/queue.sendQueue` que não existe mais). **Não tente consertá-los — estão fora de escopo.**
- Jest pega `*.test.js` **fora** de `__tests__` (testMatch default). Então **novos testes de lógica pura** colocados ao lado do código (ex: `src/utils/schedule.util.test.js`) **rodam** com `npm test`, sem DB nem Redis.
- TDD neste plano = **testes unitários de função pura** (janela, excedente). Mudanças de DB/rota/processador usam **verificação manual** descrita em cada tarefa (não há harness de integração; criar um está fora de escopo).

## Mapa de arquivos

**Criar:**
- `backend/src/utils/schedule.util.js` — cálculo de janela (`isWithinWindow`, `msUntilNextWindowOpen`). Pura.
- `backend/src/utils/schedule.util.test.js` — unit tests.
- `backend/src/utils/usage.util.js` — cálculo de excedente/custo (`computeOverage`). Pura.
- `backend/src/utils/usage.util.test.js` — unit tests.
- `backend/src/routes/usage.routes.js` — `GET /api/usage`.
- `frontend/src/pages/Usage*` ou card no dashboard existente (definir no Part 3).

**Modificar:**
- `backend/src/db/migrate.js` — colunas novas + índices + constraint (append idempotente).
- `backend/src/db/schema.js` — declarar colunas novas em `plans` e `send_logs`.
- `backend/src/db/seeds/index.js` — popular `overage_price_brl` / `max_concurrent_sends`.
- `backend/src/routes/contacts.routes.js` — paginação no GET.
- `backend/src/routes/send.routes.js` — enforcement de concorrência + `dispatchId`.
- `backend/src/services/queue.service.js` — check de janela no loop + re-enfileirar continuação.
- `backend/src/app.js` — registrar `/api/usage`.
- `frontend/src/pages/Contacts.jsx` — scroll infinito + debounce.

---

## Part 0 — Correção de dados + integridade (pré-requisito)

### Task 0.1: Resolver contrato duplicado e impedir recorrência

**Files:** Modify `backend/src/db/migrate.js`

- [ ] **Step 1: Confirmar o estado em produção (read-only)**

Run (na VPS):
```bash
ssh root@2.25.186.75 "cd /opt/gestaozap && docker compose exec -T postgres psql -U wa_invites -d wa_invites -c \"SELECT ct.id, t.slug, p.slug AS plano, ct.status, ct.created_at FROM contracts ct JOIN tenants t ON t.id=ct.tenant_id JOIN plans p ON p.id=ct.plan_id WHERE ct.status='active' ORDER BY t.slug, ct.created_at;\""
```
Esperado: `procuraqui` aparece 2x (Starter e Business). **Confirmar com o dono qual plano fica** antes de cancelar o outro (decisão de negócio — provavelmente Business). NÃO assumir.

- [ ] **Step 2: Cancelar o contrato extra (após confirmação do dono)**

Run (na VPS, com o `<ID>` do contrato a descartar):
```bash
ssh root@2.25.186.75 "cd /opt/gestaozap && docker compose exec -T postgres psql -U wa_invites -d wa_invites -c \"UPDATE contracts SET status='cancelled', updated_at=now() WHERE id='<ID>';\""
```

- [ ] **Step 3: Constraint — no máximo 1 contrato ativo por tenant**

Adicionar ao fim do bloco de índices em `migrate.js` (idempotente):
```js
await client.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_active_contract_per_tenant
  ON contracts (tenant_id) WHERE status = 'active';
`);
```

- [ ] **Step 4: Verificar**

Run: `cd backend && npm run db:migrate` (local) e repetir o SELECT do Step 1 (deve haver 1 ativo por tenant). Commit.

```bash
git add backend/src/db/migrate.js && git commit -m "fix(data): single active contract per tenant + partial unique index"
```

---

## Part 1 — Performance da agenda

### Task 1.1: Migration de índices (trigram + composto + tags + dashboard)

**Files:** Modify `backend/src/db/migrate.js`

- [ ] **Step 1: Adicionar SQL idempotente** (após criação das tabelas relevantes)

```js
await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm  ON contacts USING gin (name  gin_trgm_ops);`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm ON contacts USING gin (phone gin_trgm_ops);`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_tenant_active_created ON contacts (tenant_id, active, created_at);`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin (tags);`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_message_usage_tenant_month ON message_usage (tenant_id, month);`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_send_logs_tenant_campaign ON send_logs (tenant_id, campaign_id);`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_send_logs_tenant_status ON send_logs (tenant_id, status);`);
```

- [ ] **Step 2: Rodar migration local**

Run: `cd backend && npm run db:migrate`
Esperado: sem erro; reexecutar é no-op (todos `IF NOT EXISTS`).

- [ ] **Step 3: Verificar uso do índice (manual, contra o postgres com dados)**

Numa base com volume (ex: prod, read-only), rodar `EXPLAIN ANALYZE SELECT * FROM contacts WHERE tenant_id='...' AND active AND name ILIKE '%ana%' ORDER BY created_at LIMIT 50;`
Esperado: usa `idx_contacts_name_trgm` (Bitmap Index Scan), **sem** Seq Scan.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrate.js && git commit -m "perf(db): trigram + composite indexes for contacts and dashboard queries"
```

> **Produção:** índices nessa tabela grande devem ser criados com `CREATE INDEX CONCURRENTLY` **fora de transação**. Como `migrate.js` roda tudo em `BEGIN/COMMIT`, criar os índices de `contacts` **manualmente com CONCURRENTLY** na VPS antes do deploy (o `IF NOT EXISTS` na migration vira no-op depois). Comando documentado no Step de rollout (Part 4).

### Task 1.2: Paginação no `GET /api/contacts`

**Files:** Modify `backend/src/routes/contacts.routes.js:14-48`

- [ ] **Step 1: Auditar consumidores do endpoint** (o contrato vai de array → `{items,total}`)

Run: `grep -rn "/api/contacts'" frontend/src | grep -v "/api/contacts/"`
Listar todos os pontos que esperam um array. Confirmar que serão ajustados (Task 1.3 cobre `Contacts.jsx`; ajustar também a tela de seleção de contatos da campanha se consumir esse GET).

- [ ] **Step 2: Implementar paginação**

Substituir o bloco `const rows = await db.select()...orderBy(...)` + `res.json(...)` por:
```js
const limit  = Math.min(parseInt(req.query.limit ?? '50', 10) || 50, 200);
const offset = Math.max(parseInt(req.query.offset ?? '0', 10) || 0, 0);
const whereExpr = and(...conditions);

const [{ total }] = await db
  .select({ total: sql`COUNT(*)::int` })
  .from(contacts).where(whereExpr);

const rows = await db.select().from(contacts)
  .where(whereExpr)
  .orderBy(contacts.createdAt)
  .limit(limit).offset(offset);

res.json({ items: rows.map(normalizeDoc), total: Number(total) });
```
(Garantir `sql` importado de `drizzle-orm` no topo.)

- [ ] **Step 3: Verificação manual**

Run (backend up): `curl -s '.../api/contacts?limit=2' -H '<auth>' | jq '{n: (.items|length), total}'`
Esperado: `n=2`, `total` = total real do tenant.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/contacts.routes.js && git commit -m "feat(contacts): paginate list endpoint ({items,total})"
```

### Task 1.3: Frontend — scroll infinito + debounce

**Files:** Modify `frontend/src/pages/Contacts.jsx`

> **REQUIRED SUB-SKILL ao implementar UI:** invoque `frontend-design` antes de escrever JSX/CSS.

- [ ] **Step 1:** Ajustar `load()` para enviar `limit`/`offset` e ler `res.data.items`/`res.data.total`. Manter `q`/`tag` server-side.
- [ ] **Step 2:** Debounce de ~300ms no `search` (não recarregar a cada tecla). Resetar `offset=0` ao mudar busca/tag.
- [ ] **Step 3:** Scroll infinito (IntersectionObserver) ou botão "carregar mais": acumula páginas até `items.length >= total`.
- [ ] **Step 4: Verificação manual** — agenda do `procuraqui` (43k) abre a 1ª página rápido; rolar carrega mais; busca filtra no servidor.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Contacts.jsx && git commit -m "perf(ui): paginated agenda with infinite scroll + debounced search"
```

---

## Part 2 — Cota, excedente e concorrência

### Task 2.1: Colunas de plano + seed dos valores

**Files:** Modify `backend/src/db/migrate.js`, `backend/src/db/schema.js`, `backend/src/db/seeds/index.js`

- [ ] **Step 1: migrate.js (idempotente)**
```js
await client.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS overage_price_brl NUMERIC(10,4);`);
await client.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_concurrent_sends INTEGER NOT NULL DEFAULT 1;`);
```
- [ ] **Step 2: schema.js** — em `plans`, adicionar:
```js
overagePriceBrl: numeric('overage_price_brl', { precision: 10, scale: 4 }),
maxConcurrentSends: integer('max_concurrent_sends').notNull().default(1),
```
- [ ] **Step 3: seed** — UPDATE idempotente dos valores confirmados:
```sql
UPDATE plans SET overage_price_brl=0.10, max_concurrent_sends=1  WHERE slug='starter';
UPDATE plans SET overage_price_brl=0.08, max_concurrent_sends=3  WHERE slug='pro';
UPDATE plans SET overage_price_brl=NULL, max_concurrent_sends=10 WHERE slug='business';
```
(Adicionar à função de seed existente em `seeds/index.js`, seguindo o padrão atual.)
- [ ] **Step 4:** `npm run db:migrate` + verificar `SELECT slug, overage_price_brl, max_concurrent_sends FROM plans;`. Commit.

### Task 2.2: Cálculo de excedente (lógica pura, TDD)

**Files:** Create `backend/src/utils/usage.util.js` + `.test.js`

- [ ] **Step 1: Teste que falha** (`usage.util.test.js`)
```js
const { computeOverage } = require('./usage.util');
describe('computeOverage', () => {
  test('abaixo da cota: zero', () => {
    expect(computeOverage({ used: 312, quota: 500, pricePerMsg: 0.10 }))
      .toEqual({ overage: 0, costBrl: 0 });
  });
  test('acima da cota: cobra a diferença', () => {
    expect(computeOverage({ used: 650, quota: 500, pricePerMsg: 0.10 }))
      .toEqual({ overage: 150, costBrl: 15 });
  });
  test('cota null (ilimitado): nunca excede', () => {
    expect(computeOverage({ used: 99999, quota: null, pricePerMsg: null }))
      .toEqual({ overage: 0, costBrl: 0 });
  });
});
```
- [ ] **Step 2:** `cd backend && npx jest src/utils/usage.util.test.js` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar**
```js
function computeOverage({ used, quota, pricePerMsg }) {
  if (quota == null) return { overage: 0, costBrl: 0 };
  const overage = Math.max(0, used - quota);
  const price = Number(pricePerMsg) || 0;
  return { overage, costBrl: Number((overage * price).toFixed(2)) };
}
module.exports = { computeOverage };
```
- [ ] **Step 4:** `npx jest src/utils/usage.util.test.js` → PASS. Commit.

### Task 2.3: Endpoint `GET /api/usage`

**Files:** Create `backend/src/routes/usage.routes.js`; Modify `backend/src/app.js`

- [ ] **Step 1: Implementar rota** (segue padrão `tenantResolver, authGuard`; usa `getTenantId(req)`)
   - Resolve contrato ativo + plano do tenant.
   - `used = COUNT(message_usage WHERE tenant_id=? AND month=<YYYY-MM atual>)`.
   - `{ overage, costBrl } = computeOverage({ used, quota: plan.messagesPerMonth, pricePerMsg: plan.overagePriceBrl })`.
   - `concurrency.inUse` = `getQueueForTenant(tenantId).getActiveCount() + getWaitingCount()` (Bull) **menos** continuações (ver Task 3.3: continuações carregam `isContinuation` e são contadas como o mesmo dispatch — para o MVP, contar **dispatches distintos** via `COUNT(DISTINCT dispatch_id)` dos jobs ativos; se inviável no MVP, documentar que `inUse` conta jobs ativos e tratar continuação no Part 3).
   - `allowed = plan.maxConcurrentSends`.
   - Resposta no formato do spec.
- [ ] **Step 2: Registrar em app.js** (junto das demais rotas tenant):
```js
app.use('/api/usage', tenantResolver, authGuard, require('./routes/usage.routes'));
```
- [ ] **Step 3: Verificação manual** — `curl .../api/usage` retorna JSON coerente para `procuraqui` (após Part 0). Commit.

### Task 2.4: Enforcement de concorrência no disparo

**Files:** Modify `backend/src/routes/send.routes.js`

- [ ] **Step 1:** Antes de `getQueueForTenant(tenantId).add(...)`:
   - Buscar `max_concurrent_sends` do plano ativo.
   - `inUse` = nº de **dispatches** ativos (ver nota Task 2.3; **continuações não contam como novo**).
   - Se `inUse >= allowed`: `return res.status(409).json({ error: 'concurrency_limit', message: 'Limite de N envios simultâneos do seu plano atingido.' })`.
- [ ] **Step 2:** Gerar `dispatchId` (uuid) no disparo e incluí-lo em `job.data` (usado no Part 3).
- [ ] **Step 3: Verificação manual** — disparar 2 envios numa conta starter (limite 1): o 2º responde 409. Commit.

### Task 2.5: Cron mensal de excedente (registro, sem cobrança real)

**Files:** Create `backend/src/cron/overageBilling.js`; Modify wherever crons são iniciados (mesmo ponto que `cron/contractExpiry.js`)

- [ ] **Step 1:** Job mensal: para o mês anterior, para cada tenant com contrato ativo e `used > quota`, **upsert** em `payment_records` (`type='per_message'`, `referenceMonth=<mês anterior>`, `amount_brl=costBrl`, `status='pending'`). Idempotente (chave lógica: tenant+referenceMonth+type).
- [ ] **Step 2: Verificação manual** — rodar a função pontualmente num mês de teste e conferir a linha gerada. Commit.

> Cobrança efetiva via Asaas = **Fase 2**, fora deste plano.

### Task 2.6: Card de cota no dashboard

**Files:** Modify dashboard frontend (localizar a página principal pós-login)

> **REQUIRED SUB-SKILL:** invoque `frontend-design` antes da UI. Considere mock no companion visual.

- [ ] **Step 1:** Consumir `GET /api/usage`. Mostrar barra cota usada/total (ou "ilimitado"), custo de excedente projetado, e "envios simultâneos X/Y".
- [ ] **Step 2:** Tratar plano ilimitado (business) sem barra de cota.
- [ ] **Step 3: Verificação manual** + Commit.

---

## Part 3 — Scheduler inteligente (janela global, só horas)

### Task 3.1: Lógica de janela (pura, TDD)

**Files:** Create `backend/src/utils/schedule.util.js` + `.test.js`

- [ ] **Step 1: Teste que falha**
```js
const { isWithinWindow, msUntilNextWindowOpen } = require('./schedule.util');
const at = (y,mo,d,h) => new Date(y, mo, d, h, 0, 0, 0); // hora local

describe('janela 8-20', () => {
  test('dentro', () => expect(isWithinWindow(at(2026,5,8,10), 8, 20)).toBe(true));
  test('borda fim exclusiva', () => expect(isWithinWindow(at(2026,5,8,20), 8, 20)).toBe(false));
  test('antes da abertura: espera até hoje 08h', () => {
    const now = at(2026,5,8,6);
    expect(msUntilNextWindowOpen(now, 8, 20)).toBe(2*3600*1000);
  });
  test('depois do fim: espera até amanhã 08h', () => {
    const now = at(2026,5,8,21);
    expect(msUntilNextWindowOpen(now, 8, 20)).toBe(11*3600*1000);
  });
});
```
- [ ] **Step 2:** `npx jest src/utils/schedule.util.test.js` → FAIL.
- [ ] **Step 3: Implementar**
```js
function isWithinWindow(date, hourStart, hourEnd) {
  const h = date.getHours();
  return h >= hourStart && h < hourEnd;
}
function msUntilNextWindowOpen(now, hourStart, hourEnd) {
  const target = new Date(now);
  target.setHours(hourStart, 0, 0, 0);
  if (now.getHours() >= hourEnd) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}
module.exports = { isWithinWindow, msUntilNextWindowOpen };
```
- [ ] **Step 4:** `npx jest src/utils/schedule.util.test.js` → PASS. Commit.

### Task 3.2: Propagar `dispatchId` e flag de continuação

**Files:** Modify `backend/src/db/schema.js`, `backend/src/db/migrate.js`, `backend/src/services/queue.service.js`

- [ ] **Step 1:** Coluna `send_logs.dispatch_id UUID` (idempotente) + índice `(tenant_id, dispatch_id)`:
```js
await client.query(`ALTER TABLE send_logs ADD COLUMN IF NOT EXISTS dispatch_id UUID;`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_send_logs_tenant_dispatch ON send_logs (tenant_id, dispatch_id);`);
```
Declarar em `schema.js`. `dispatchId` permite **cancelar o envio inteiro** e **contar concorrência** por dispatch (não por job).
- [ ] **Step 2:** No processor, ao gravar `send_logs`, incluir `dispatchId` (de `job.data.dispatchId`).
- [ ] **Step 3:** Commit.

### Task 3.3: Check de janela no loop + continuação durável

**Files:** Modify `backend/src/services/queue.service.js` (processor `buildProcessor`, loop ~line 141) e `config/queue.js` se precisar helper de re-add.

- [ ] **Step 1:** No início do `for` (a cada início de **lote**, isto é, quando `i % batchSize === 0`), checar janela:
```js
const { isWithinWindow, msUntilNextWindowOpen } = require('../utils/schedule.util');
// ...dentro do loop, antes de processar o contato i:
if (!ignoreHours && i % getBatchSize() === 0 && !isWithinWindow(new Date(), hourStart, hourEnd)) {
  const delay = msUntilNextWindowOpen(new Date(), hourStart, hourEnd);
  const resumesAt = new Date(Date.now() + delay).toISOString();
  await getQueueForTenant(tenantId).add(
    { ...job.data, contacts: contacts.slice(i), isContinuation: true },
    { delay },
  );
  io.to(tenantId).emit('send:paused', { campaignId, jobId, reason: 'outside_hours', resumesAt, sentCount, total });
  io.to(tenantId).emit('send:done', { campaignId, jobId, sentCount, failedCount, total, rescheduled: true, resumesAt });
  return { sentCount, failedCount, total, rescheduled: true, resumesAt };
}
```
   - `contacts.slice(i)` garante que a continuação processa só o restante (fatias disjuntas → sem reenvio).
   - `isContinuation: true` evita que a contagem de concorrência (Task 2.4) trate a retomada como envio novo.
- [ ] **Step 2: Remover** o antigo check de "skip no início" (`queue.service.js:122-127`) — substituído por este comportamento. (Manter `ignoreHours` como bypass.)
- [ ] **Step 3:** Garantir que `hourStart`/`hourEnd` venham do `platform_config` global (defaults 8/20) e não dependam só do payload — ler via `getConfigInt('hour_start_default', 8)`/`('hour_end_default', 20)` se o payload não trouxer, mantendo override por `ignoreHours`.
- [ ] **Step 4: Verificação manual (controlada)** — setar temporariamente `hour_end_default` para a hora atual e disparar um envio pequeno: deve emitir `paused/outside_hours` com `resumesAt` e re-enfileirar; conferir no Bull (`getDelayedCount()`) que há 1 job atrasado; reiniciar o backend e confirmar que o job atrasado persiste.
- [ ] **Step 5: Commit**

```bash
git add backend/src/services/queue.service.js backend/src/config/queue.js
git commit -m "feat(scheduler): window-aware durable continuation (auto pause/resume across days)"
```

### Task 3.4: Cancelar dispatch inteiro (multi-dia)

**Files:** Modify `backend/src/routes/queue.routes.js` (cancel) + `config/queue.js`

- [ ] **Step 1:** Cancelamento por `dispatchId`: além da flag por `jobId`, marcar cancel por `dispatchId` (flag Redis) e remover o job atrasado da fila (`queue.getDelayed()` → `job.remove()` os que casam o `dispatchId`).
- [ ] **Step 2:** No processor, checar cancel por `dispatchId` no início do loop.
- [ ] **Step 3: Verificação manual** — pausar (fora da janela), depois cancelar; confirmar que a continuação não dispara na janela seguinte. Commit.

---

## Part 4 — Rollout

- [ ] **Índices em produção com CONCURRENTLY (antes do deploy do código):**
```bash
ssh root@2.25.186.75
docker compose -f /opt/gestaozap/docker-compose.yml exec -T postgres psql -U wa_invites -d wa_invites <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_name_trgm  ON contacts USING gin (name  gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_phone_trgm ON contacts USING gin (phone gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_tenant_active_created ON contacts (tenant_id, active, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_tags ON contacts USING gin (tags);
SQL
```
(`CONCURRENTLY` não roda dentro de transação — por isso fora do `migrate.js`. Depois o `IF NOT EXISTS` na migration vira no-op.)
- [ ] **Deploy** conforme `[[gestaozap-prod-deploy]]`: `git fetch/reset` → `docker compose build backend frontend` → `up -d` → `docker compose exec -T backend npm run db:migrate`.
- [ ] **Smoke test prod:** agenda abre rápido; `GET /api/usage` ok; disparo fora da janela agenda+retoma; limite de concorrência barra o 2º envio.

## Riscos / atenção
- Mudança de contrato `/api/contacts` (array→`{items,total}`): auditar todos os consumidores (Task 1.2 Step 1).
- Concorrência precisa distinguir **dispatch novo** de **continuação** (`isContinuation`/`dispatchId`).
- Índices grandes em prod: sempre `CONCURRENTLY`.
- `__tests__/` obsoletos: não tocar.
```
