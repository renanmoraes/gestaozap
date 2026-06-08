# Pré-cadastro de afiliados com aprovação e trial (Fase 1) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir pré-cadastro self-service (com/sem afiliado), com gate de aprovação do admin e trial de N dias, criando login para o cliente.

**Architecture:** Backend Express + Postgres (drizzle-orm). Novo endpoint público `/api/signup` cria tenant `pending` + login. Admin aprova/rejeita; aprovação cria contrato `is_trial`. Acesso a rotas de negócio passa por um helper de estado (`tenantAccessState`). Login do cliente vira email+senha (company resolvida pelo subdomínio). Cron marca trial expirado como `expired` sem apagar a conta.

**Tech Stack:** Express, drizzle-orm, Postgres, bcryptjs, Resend (email), React + Vite, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-08-affiliate-signup-approval-trial-design.md`

---

## Realidade de testes (ler antes de começar)

- Os testes em `backend/src/__tests__/` de **rotas** são legados da era MongoDB (usam `mongoose`/`MongoMemoryServer`, mockam `config/db` inexistente) e **não rodam** — o script `npm test` usa `--testPathIgnorePatterns='__tests__'`, ignorando o diretório inteiro. Não recriar essa infra aqui (YAGNI).
- **TDD real** apenas para **funções puras** (slug, CPF/CNPJ, helper de acesso): rode com `npx jest <caminho-do-arquivo>` (passar o caminho explícito evita os testes legados quebrados).
- Tarefas que tocam **DB/rotas**: verificação via `curl`/`psql` contra o stack Docker local (`docker compose up -d`). Comandos exatos em cada task.
- Commits frequentes (um por task, no mínimo).

## Estrutura de arquivos

**Criar:**
- `backend/src/utils/slug.util.js` — `slugify(name)` (puro) + `generateUniqueSlug(db, name)`
- `backend/src/utils/document.util.js` — validação CPF/CNPJ (puro)
- `backend/src/utils/access.util.js` — `tenantAccessState(tenant, contract, now)` + `tenantHasActiveAccess` (puro)
- `backend/src/routes/signup.routes.js` — `POST /api/signup`
- `backend/src/services/signup-email.service.js` — emails de cadastro recebido/aprovado/rejeitado (Resend)
- `backend/src/__tests__/slug.util.test.js`, `document.util.test.js`, `access.util.test.js`
- `frontend/src/pages/SignupPending.jsx` — telas de estado (em análise / recusado / trial encerrado)

**Modificar:**
- `backend/src/db/migrate.js` — colunas novas + backfill
- `backend/src/db/schema.js` — colunas novas no drizzle
- `backend/src/db/seeds/index.js` — chave `trial_days` no platform_config
- `backend/src/services/auth.service.js` — `login()` com `companyId` opcional p/ cliente
- `backend/src/middleware/requireTenant.js` — aplica `tenantAccessState`, retorna código de estado
- `backend/src/routes/admin.routes.js` — `GET /tenants?status=`, `POST /tenants/:id/approve`, `POST /tenants/:id/reject`
- `backend/src/cron/contractExpiry.js` — trial expirado não desativa tenant
- `backend/src/app.js` — montar `/api/signup`; aposentar `/api/affiliates/register`
- `frontend/src/pages/Register.jsx` — CPF/CNPJ, email, senha, slug preview, tela "em análise"
- `frontend/src/pages/Login.jsx` — remover campo companyId; tratar códigos de estado
- `frontend/src/pages/admin/AdminTenants.jsx` — fila de aprovação (aprovar/rejeitar)
- `frontend/src/pages/admin/AdminConfig.jsx` — campo `trial_days`
- `frontend/src/pages/Landing/Landing.jsx` — CTA → `/registrar`

---

## Task 1: Migrations + schema (colunas novas com backfill seguro)

**Files:**
- Modify: `backend/src/db/migrate.js` (dentro de `runMigrations`, após a criação de `tenants`/`contracts`)
- Modify: `backend/src/db/schema.js:21-32` (tenants) e `:168-179` (contracts)
- Modify: `backend/src/db/seeds/index.js` (seedPlatformConfig)

- [ ] **Step 1: Adicionar colunas + backfill atômico no migrate.js**

Inserir no bloco transacional de `runMigrations` (depois que `tenants` e `contracts` existem):

```js
// ─── Pré-cadastro: aprovação + documento (Fase 1) ───
// Cria approval_status e aprova retroativamente os tenants pré-existentes
// (default 'pending' valeria só para novos cadastros). Idempotente: o backfill
// roda apenas quando a coluna é criada pela primeira vez.
await client.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='tenants' AND column_name='approval_status'
    ) THEN
      ALTER TABLE tenants ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'pending';
      UPDATE tenants SET approval_status='approved';
    END IF;
  END $$;
`);
await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS document VARCHAR(20);`);
await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS document_type VARCHAR(4);`);
await client.query(`CREATE INDEX IF NOT EXISTS idx_tenants_approval_status ON tenants(approval_status);`);
await client.query(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT false;`);
```

- [ ] **Step 2: Refletir no schema.js (drizzle)**

Em `tenants` (após `termsVersion`):
```js
  approvalStatus: varchar('approval_status', { length: 20 }).notNull().default('pending'),
  document: varchar('document', { length: 20 }),
  documentType: varchar('document_type', { length: 4 }),
```
Em `contracts` (após `autoRenew`):
```js
  isTrial: boolean('is_trial').notNull().default(false),
```

- [ ] **Step 3: Seed do trial_days no platform_config**

Em `seedPlatformConfig` (`backend/src/db/seeds/index.js`), seguir o padrão das chaves existentes e adicionar:
```js
// trial_days: dias de teste grátis após aprovação do cadastro
await client.query(`
  INSERT INTO platform_config (key, value, description)
  VALUES ('trial_days', '7', 'Dias de trial grátis após aprovação do cadastro')
  ON CONFLICT (key) DO NOTHING;
`);
```

- [ ] **Step 4: Rodar migrations no stack local e verificar**

Run:
```bash
docker compose up -d
docker compose exec -T backend npm run db:migrate
docker compose exec -T postgres psql -U wa_invites -d wa_invites -c "\d tenants" | grep -E "approval_status|document"
docker compose exec -T postgres psql -U wa_invites -d wa_invites -c "SELECT approval_status, count(*) FROM tenants GROUP BY 1;"
docker compose exec -T postgres psql -U wa_invites -d wa_invites -c "SELECT key,value FROM platform_config WHERE key='trial_days';"
```
Expected: colunas presentes; tenants existentes com `approved`; `trial_days=7`.

- [ ] **Step 5: Commit**
```bash
git add backend/src/db/migrate.js backend/src/db/schema.js backend/src/db/seeds/index.js
git commit -m "feat(db): approval_status/document/is_trial columns + trial_days seed"
```

---

## Task 2: Util de slug (TDD)

**Files:**
- Create: `backend/src/utils/slug.util.js`
- Test: `backend/src/__tests__/slug.util.test.js`

- [ ] **Step 1: Escrever o teste que falha**
```js
const { slugify } = require('../utils/slug.util');

describe('slugify', () => {
  it('normaliza acentos e espaços', () => {
    expect(slugify('Farmácia Vida Plena')).toBe('farmacia-vida-plena');
  });
  it('remove caracteres inválidos e colapsa hífens', () => {
    expect(slugify('  João & Cia!! ')).toBe('joao-cia');
  });
  it('fallback quando vazio', () => {
    expect(slugify('@@@')).toBe('cliente');
  });
  it('limita a 63 caracteres', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(63);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**
Run: `cd backend && npx jest src/__tests__/slug.util.test.js`
Expected: FAIL (Cannot find module '../utils/slug.util').

- [ ] **Step 3: Implementar**
```js
function slugify(name) {
  const s = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
  return s || 'cliente';
}

// Gera slug único consultando a tabela tenants (sufixo numérico em colisão).
async function generateUniqueSlug(db, name) {
  const { tenants } = require('../db/schema');
  const { eq } = require('drizzle-orm');
  const base = slugify(name);
  let candidate = base;
  for (let n = 2; n < 1000; n += 1) {
    const [hit] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate));
    if (!hit) return candidate;
    const suffix = `-${n}`;
    candidate = `${base.slice(0, 63 - suffix.length)}${suffix}`;
  }
  throw new Error('Não foi possível gerar slug único');
}

module.exports = { slugify, generateUniqueSlug };
```

- [ ] **Step 4: Rodar e ver passar**
Run: `cd backend && npx jest src/__tests__/slug.util.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**
```bash
git add backend/src/utils/slug.util.js backend/src/__tests__/slug.util.test.js
git commit -m "feat(util): slugify + generateUniqueSlug"
```

---

## Task 3: Util de validação CPF/CNPJ (TDD)

**Files:**
- Create: `backend/src/utils/document.util.js`
- Test: `backend/src/__tests__/document.util.test.js`

- [ ] **Step 1: Teste que falha**
```js
const { isValidCPF, isValidCNPJ, validateDocument } = require('../utils/document.util');

describe('document.util', () => {
  it('CPF válido', () => { expect(isValidCPF('529.982.247-25')).toBe(true); });
  it('CPF inválido (DV)', () => { expect(isValidCPF('529.982.247-20')).toBe(false); });
  it('CPF repetido inválido', () => { expect(isValidCPF('111.111.111-11')).toBe(false); });
  it('CNPJ válido', () => { expect(isValidCNPJ('11.222.333/0001-81')).toBe(true); });
  it('CNPJ inválido', () => { expect(isValidCNPJ('11.222.333/0001-80')).toBe(false); });
  it('validateDocument despacha por tipo', () => {
    expect(validateDocument('cpf', '529.982.247-25')).toBe(true);
    expect(validateDocument('cnpj', '11.222.333/0001-81')).toBe(true);
    expect(validateDocument('xx', '123')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**
Run: `cd backend && npx jest src/__tests__/document.util.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar**
```js
function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }

function isValidCPF(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function isValidCNPJ(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len) => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cnpj[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

function validateDocument(type, value) {
  if (type === 'cpf') return isValidCPF(value);
  if (type === 'cnpj') return isValidCNPJ(value);
  return false;
}

module.exports = { onlyDigits, isValidCPF, isValidCNPJ, validateDocument };
```

- [ ] **Step 4: Rodar e ver passar**
Run: `cd backend && npx jest src/__tests__/document.util.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/utils/document.util.js backend/src/__tests__/document.util.test.js
git commit -m "feat(util): CPF/CNPJ validation"
```

---

## Task 4: Helper de estado de acesso (TDD)

**Files:**
- Create: `backend/src/utils/access.util.js`
- Test: `backend/src/__tests__/access.util.test.js`

- [ ] **Step 1: Teste que falha**
```js
const { tenantAccessState, tenantHasActiveAccess } = require('../utils/access.util');
const now = new Date('2026-06-08T12:00:00Z');
const future = new Date('2026-06-20T12:00:00Z');
const past = new Date('2026-06-01T12:00:00Z');

describe('tenantAccessState', () => {
  it('pending', () => {
    expect(tenantAccessState({ approvalStatus: 'pending' }, null, now)).toBe('pending_approval');
  });
  it('rejected', () => {
    expect(tenantAccessState({ approvalStatus: 'rejected' }, null, now)).toBe('rejected');
  });
  it('approved sem contrato', () => {
    expect(tenantAccessState({ approvalStatus: 'approved' }, null, now)).toBe('no_contract');
  });
  it('trial vigente => active', () => {
    expect(tenantAccessState({ approvalStatus: 'approved' }, { status: 'active', isTrial: true, expiresAt: future }, now)).toBe('active');
  });
  it('trial expirado', () => {
    expect(tenantAccessState({ approvalStatus: 'approved' }, { status: 'expired', isTrial: true, expiresAt: past }, now)).toBe('trial_expired');
  });
  it('pago vencido', () => {
    expect(tenantAccessState({ approvalStatus: 'approved' }, { status: 'expired', isTrial: false, expiresAt: past }, now)).toBe('contract_expired');
  });
  it('vitalício (expiresAt null) ativo', () => {
    expect(tenantHasActiveAccess({ approvalStatus: 'approved' }, { status: 'active', isTrial: false, expiresAt: null }, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**
Run: `cd backend && npx jest src/__tests__/access.util.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar**
```js
// Fonte de verdade do gate: contract.status (o cron vira 'expired' no fim do trial).
// expiresAt > now é rede de segurança caso o cron atrase.
function tenantAccessState(tenant, contract, now = new Date()) {
  if (!tenant) return 'no_tenant';
  if (tenant.approvalStatus === 'pending') return 'pending_approval';
  if (tenant.approvalStatus === 'rejected') return 'rejected';
  if (!contract) return 'no_contract';
  const vigente = contract.status === 'active'
    && (!contract.expiresAt || new Date(contract.expiresAt) > now);
  if (vigente) return 'active';
  return contract.isTrial ? 'trial_expired' : 'contract_expired';
}

function tenantHasActiveAccess(tenant, contract, now) {
  return tenantAccessState(tenant, contract, now) === 'active';
}

module.exports = { tenantAccessState, tenantHasActiveAccess };
```

- [ ] **Step 4: Rodar e ver passar**
Run: `cd backend && npx jest src/__tests__/access.util.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/utils/access.util.js backend/src/__tests__/access.util.test.js
git commit -m "feat(util): tenant access-state helper"
```

---

## Task 5: Serviço de emails de cadastro

**Files:**
- Create: `backend/src/services/signup-email.service.js`
- Reference: `backend/src/services/welcome-email.service.js` (padrão Resend já existente)

- [ ] **Step 1: Implementar (espelhar o padrão do welcome-email.service.js)**
```js
const { Resend } = require('resend');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function domain() { return process.env.APP_BASE_DOMAIN || 'gestaozap.digital'; }
function from() { return process.env.RESEND_FROM || `noreply@${domain()}`; }

async function send(to, subject, html) {
  if (!resend) { console.warn('[signup-email] RESEND_API_KEY ausente — email não enviado'); return; }
  try { await resend.emails.send({ from: from(), to, subject, html }); }
  catch (err) { console.error('[signup-email] falha:', err.message); }
}

async function sendSignupReceived(to, name) {
  await send(to, 'Recebemos seu cadastro — GestãoZap',
    `<p>Olá, ${name}!</p><p>Recebemos seu cadastro e ele está <strong>em análise</strong>. Avisaremos por email assim que for aprovado e seu período de teste começar.</p>`);
}

async function sendSignupApproved(to, name, slug, trialDays) {
  const url = `https://${slug}.${domain()}`;
  await send(to, 'Cadastro aprovado — seu trial começou!',
    `<p>Olá, ${name}!</p><p>Seu cadastro foi aprovado e você tem <strong>${trialDays} dias de teste grátis</strong>.</p><p>Acesse: <a href="${url}">${url}</a> com seu email e senha cadastrados.</p>`);
}

async function sendSignupRejected(to, name) {
  await send(to, 'Sobre seu cadastro — GestãoZap',
    `<p>Olá, ${name}.</p><p>Infelizmente seu cadastro não foi aprovado no momento. Em caso de dúvidas, entre em contato.</p>`);
}

module.exports = { sendSignupReceived, sendSignupApproved, sendSignupRejected };
```

- [ ] **Step 2: Commit**
```bash
git add backend/src/services/signup-email.service.js
git commit -m "feat(email): signup received/approved/rejected templates"
```

---

## Task 6: Endpoint público POST /api/signup

**Files:**
- Create: `backend/src/routes/signup.routes.js`
- Modify: `backend/src/app.js` (montar a rota; aposentar `/api/affiliates/register`)
- Reference: `backend/src/routes/affiliates.routes.js` (validação de afiliado + `calcValues`), `backend/src/services/auth.service.js` (`hashPassword`, `generateUniqueCompanyId`)

- [ ] **Step 1: Implementar a rota**
```js
const router = require('express').Router();
const { eq, and } = require('drizzle-orm');
const { getDb } = require('../db');
const {
  tenants, companies, users, userCompany, whatsappSessions, affiliates, affiliateReferrals,
} = require('../db/schema');
const { hashPassword, generateUniqueCompanyId } = require('../services/auth.service');
const { generateUniqueSlug } = require('../utils/slug.util');
const { validateDocument, onlyDigits } = require('../utils/document.util');
const { sendSignupReceived } = require('../services/signup-email.service');

// POST /api/signup — pré-cadastro self-service (cria conta 'pending', sem contrato)
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const {
      documentType, document, name, whatsapp, email, password, affiliateCode,
    } = req.body || {};

    // Validações
    if (!['cpf', 'cnpj'].includes(documentType)) return res.status(400).json({ error: 'Tipo de documento inválido' });
    if (!validateDocument(documentType, document)) return res.status(400).json({ error: 'Documento inválido' });
    if (!name || !whatsapp) return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios' });
    const normEmail = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normEmail)) return res.status(400).json({ error: 'Email inválido' });
    if (!password || String(password).length < 8) return res.status(400).json({ error: 'Senha deve ter ao menos 8 caracteres' });

    // Email único
    const [emailHit] = await db.select({ id: users.id }).from(users).where(eq(users.email, normEmail));
    if (emailHit) return res.status(409).json({ error: 'Email já cadastrado' });

    // Afiliado (opcional)
    let affiliate = null;
    if (affiliateCode) {
      [affiliate] = await db.select().from(affiliates)
        .where(and(eq(affiliates.code, String(affiliateCode).toUpperCase()), eq(affiliates.active, true)));
      if (!affiliate) return res.status(400).json({ error: 'Código de afiliado inválido' });
    }

    const slug = await generateUniqueSlug(db, name);
    const companyId = await generateUniqueCompanyId(db);
    const passwordHash = await hashPassword(password);

    // Transação: tenant(pending) + company + user + user_company + wa_session + referral
    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({
        slug,
        name,
        registeredPhone: onlyDigits(whatsapp),
        active: false,
        approvalStatus: 'pending',
        document: onlyDigits(document),
        documentType,
        affiliateCode: affiliate?.code || null,
        affiliateId: affiliate?.id || null,
      }).returning();

      const [company] = await tx.insert(companies).values({
        companyId, tenantId: tenant.id, name, active: true,
      }).returning();

      const [user] = await tx.insert(users).values({
        email: normEmail, passwordHash, mustChangePwd: false, active: true,
      }).returning();

      await tx.insert(userCompany).values({ userId: user.id, companyId: company.id, role: 'owner' });
      await tx.insert(whatsappSessions).values({ tenantId: tenant.id, status: 'disconnected' });

      if (affiliate) {
        await tx.insert(affiliateReferrals).values({
          affiliateId: affiliate.id,
          tenantId: tenant.id,
          planSlug: null,
          commissionPct: String(affiliate.commissionPct),
          discountPct: String(affiliate.discountPct),
          status: 'pending',
        });
      }
      return { tenant };
    });

    sendSignupReceived(normEmail, name).catch(() => {});

    res.status(201).json({ tenantId: result.tenant.id, slug: result.tenant.slug, status: 'pending' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Dados já cadastrados (slug ou email)' });
    console.error('[signup] erro:', err);
    res.status(500).json({ error: 'Erro ao processar cadastro' });
  }
});

module.exports = router;
```

> Nota: `affiliate_referrals` exige alguns campos `NOT NULL DEFAULT 0` (original/discount/final/commission BRL) — eles têm default no banco, então omiti-los é seguro. Se o executor encontrar erro de NOT NULL, preencher com `'0'`.

- [ ] **Step 2: Montar a rota e aposentar a antiga em app.js**

Em `backend/src/app.js`, perto de onde `/api/auth` é montado:
```js
app.use('/api/signup', require('./routes/signup.routes'));
```
Em `backend/src/routes/affiliates.routes.js`, neutralizar o `POST /register` para não criar trial sem aprovação:
```js
// Aposentado pela Fase 1 — use POST /api/signup (pré-cadastro com aprovação)
router.post('/register', (req, res) => res.status(410).json({ error: 'Endpoint descontinuado. Use /api/signup.' }));
```
(Remover o handler antigo de `/register`.)

- [ ] **Step 3: Verificar via curl no stack local**
Run:
```bash
docker compose restart backend && sleep 4
# cadastro válido (CNPJ)
curl -s -X POST localhost:3001/api/signup -H 'Content-Type: application/json' \
  -d '{"documentType":"cnpj","document":"11.222.333/0001-81","name":"Farmácia Teste","whatsapp":"11999990000","email":"teste1@ex.com","password":"senha1234"}' | jq
# email duplicado → 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/api/signup -H 'Content-Type: application/json' \
  -d '{"documentType":"cnpj","document":"11.222.333/0001-81","name":"X","whatsapp":"11999990000","email":"teste1@ex.com","password":"senha1234"}'
# documento inválido → 400
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/api/signup -H 'Content-Type: application/json' \
  -d '{"documentType":"cpf","document":"111","name":"X","whatsapp":"1","email":"a@b.com","password":"senha1234"}'
# confere estado no banco
docker compose exec -T postgres psql -U wa_invites -d wa_invites -c "SELECT slug, approval_status, active, document_type FROM tenants WHERE name='Farmácia Teste';"
```
Expected: 1º → `{tenantId, slug, status:"pending"}`; 2º → `409`; 3º → `400`; banco mostra `pending`/`active=f`.

- [ ] **Step 4: Commit**
```bash
git add backend/src/routes/signup.routes.js backend/src/app.js backend/src/routes/affiliates.routes.js
git commit -m "feat(signup): public pre-signup endpoint creating pending tenant + login"
```

---

## Task 7: Login do cliente sem companyId (resolve company pelo subdomínio)

**Files:**
- Modify: `backend/src/services/auth.service.js:51-78` (função `login`)

- [ ] **Step 1: Tornar companyId opcional para cliente**

Substituir o início de `login()` (a parte que valida `companyId` e resolve `company`) por:
```js
async function login(companyId, email, password, context = {}) {
  try {
    const db = getDb();
    const normalizedId = String(companyId ?? '').trim();
    let company;

    if (normalizedId === '0') {
      // Admin: sentinela inalterada
      [company] = await db.select().from(companies).where(eq(companies.companyId, '0'));
    } else if (normalizedId) {
      // companyId explícito (compat)
      [company] = await db.select().from(companies).where(eq(companies.companyId, normalizedId));
    } else if (context.tenantId) {
      // Cliente via subdomínio: resolve a company pelo tenant (relação 1:1)
      [company] = await db.select().from(companies).where(eq(companies.tenantId, context.tenantId));
    } else {
      return { valid: false, error: 'Acesse pelo subdomínio da sua empresa' };
    }

    if (!company || !company.active) {
      return { valid: false, error: 'Empresa não encontrada ou inativa' };
    }

    // Cliente: company precisa pertencer ao tenant do subdomínio
    if (company.companyId !== '0') {
      if (!context.tenantId || company.tenantId !== context.tenantId) {
        return { valid: false, error: 'Email ou senha incorretos' };
      }
    } else if (!context.isAdminHost && process.env.NODE_ENV === 'production') {
      return { valid: false, error: 'Acesso administrativo apenas em admin.gestaozap.digital' };
    }
    // ... segue igual: busca user por email, verifica user_company, verifica senha, monta retorno
```
Manter o restante da função (busca de `user`, `userCompany`, `verifyPassword`, retorno) inalterado.

- [ ] **Step 2: Verificar via curl (subdomínio simulado pelo header X-Tenant-Slug)**
Run:
```bash
docker compose restart backend && sleep 4
# aprova manualmente o tenant de teste p/ poder logar (a aprovação real vem na Task 9; aqui só validamos login)
# login do cliente SEM companyId, identificando o tenant pelo slug:
SLUG=$(docker compose exec -T postgres psql -tA -U wa_invites -d wa_invites -c "SELECT slug FROM tenants WHERE name='Farmácia Teste' LIMIT 1;")
curl -s -X POST localhost:3001/api/auth/login -H 'Content-Type: application/json' -H "X-Tenant-Slug: $SLUG" \
  -d '{"email":"teste1@ex.com","password":"senha1234"}' | jq '{ok:.token!=null, error}'
```
Expected: retorna token (`ok:true`) sem precisar de companyId. (Se a rota de login exigir o tenant resolvido, garantir que `tenantResolver`/`/api/auth/login` repassa `context.tenantId` a partir do header `X-Tenant-Slug` — conferir `auth.routes.js`.)

- [ ] **Step 3: Commit**
```bash
git add backend/src/services/auth.service.js
git commit -m "feat(auth): client login by subdomain (companyId optional)"
```

---

## Task 8: Gate de acesso no middleware (códigos de estado)

**Files:**
- Modify: `backend/src/middleware/requireTenant.js`
- Reference: `backend/src/utils/access.util.js`, `backend/src/db/schema.js` (contracts)

- [ ] **Step 1: Ler o requireTenant.js atual** para entender como o tenant é resolvido/anexado a `req` (ex.: `req.tenant`/`req.tenantId`).

- [ ] **Step 2: Aplicar o gate**

Após o tenant ser resolvido, carregar o contrato mais recente e aplicar `tenantAccessState`. Esboço a integrar conforme o padrão do arquivo:
```js
const { eq, desc } = require('drizzle-orm');
const { contracts } = require('../db/schema');
const { tenantAccessState } = require('../utils/access.util');

// ...depois de obter o objeto `tenant` (com approvalStatus):
const [contract] = await db.select().from(contracts)
  .where(eq(contracts.tenantId, tenant.id))
  .orderBy(desc(contracts.createdAt))
  .limit(1);

const state = tenantAccessState(tenant, contract);
if (state !== 'active') {
  return res.status(403).json({ error: 'Acesso indisponível', state });
}
req.tenant = tenant;
next();
```
Importante: o login (`/api/auth/*`) NÃO passa por esse gate — apenas as rotas de negócio (`/api/session`, `/api/send`, etc.), que já usam `authGuard`/`requireTenant`. Assim, conta `pending`/`trial_expired` loga mas recebe `403 {state}` nas rotas de negócio.

- [ ] **Step 3: Verificar**
Run:
```bash
docker compose restart backend && sleep 4
# tenant 'pending' (sem aprovação) → rota de negócio deve dar 403 com state=pending_approval
TOKEN=... # token do login da Task 7
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/api/session -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Slug: $SLUG"
curl -s localhost:3001/api/session -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Slug: $SLUG" | jq .state
```
Expected: `403` e `"pending_approval"`.

- [ ] **Step 4: Commit**
```bash
git add backend/src/middleware/requireTenant.js
git commit -m "feat(auth): business-route access gate with state codes"
```

---

## Task 9: Admin — fila de aprovação (listar/aprovar/rejeitar)

**Files:**
- Modify: `backend/src/routes/admin.routes.js`
- Reference: `backend/src/db/seeds`/`platform_config` para `trial_days`; `backend/src/services/signup-email.service.js`; `backend/src/services/queue.service.js` (`registerProcessorForTenant`); `backend/src/config/registry.js` (`getIo`)

- [ ] **Step 1: Filtro de status na listagem de tenants**
No handler `GET /tenants`, aceitar `?status=pending|approved|rejected` e filtrar por `tenants.approval_status` quando presente.

- [ ] **Step 2: Endpoint de aprovação**
```js
const { sendSignupApproved, sendSignupRejected } = require('../services/signup-email.service');
const { registerProcessorForTenant } = require('../services/queue.service');
const { getIo } = require('../config/registry');

// POST /api/admin/tenants/:id/approve  body: { slug?, trialDays? }
router.post('/tenants/:id/approve', async (req, res) => {
  try {
    const db = getDb();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.params.id));
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    if (tenant.approvalStatus !== 'pending') return res.status(409).json({ error: 'Tenant não está pendente' });

    // trial_days do platform_config (fallback 7)
    const cfg = await db.execute(sql`SELECT value FROM platform_config WHERE key='trial_days' LIMIT 1`);
    const trialDays = Number(req.body?.trialDays) || Number(cfg.rows?.[0]?.value) || 7;

    // plano default p/ o contrato trial (primeiro plano ativo)
    const [plan] = await db.select().from(plans).where(eq(plans.active, true)).orderBy(plans.priceBrl).limit(1);
    if (!plan) return res.status(400).json({ error: 'Nenhum plano ativo configurado' });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const newSlug = (req.body?.slug || tenant.slug).toLowerCase();

    await db.transaction(async (tx) => {
      await tx.update(tenants).set({
        approvalStatus: 'approved', active: true, slug: newSlug, updatedAt: now,
      }).where(eq(tenants.id, tenant.id));
      await tx.insert(contracts).values({
        tenantId: tenant.id, planId: plan.id, status: 'active',
        startedAt: now, expiresAt, isTrial: true,
      });
    });

    const io = getIo();
    if (io) registerProcessorForTenant(tenant.id, io);

    // email de aprovação (best-effort) — busca email do owner
    const ownerEmail = await db.execute(sql`
      SELECT u.email FROM users u
      JOIN user_company uc ON uc.user_id=u.id
      JOIN companies c ON c.id=uc.company_id
      WHERE c.tenant_id=${tenant.id} LIMIT 1`);
    if (ownerEmail.rows?.[0]?.email) {
      sendSignupApproved(ownerEmail.rows[0].email, tenant.name, newSlug, trialDays).catch(() => {});
    }

    res.json({ ok: true, slug: newSlug, trialDays, expiresAt });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug já em uso' });
    console.error('[admin approve]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/tenants/:id/reject
router.post('/tenants/:id/reject', async (req, res) => {
  try {
    const db = getDb();
    const [tenant] = await db.update(tenants)
      .set({ approvalStatus: 'rejected', active: false, updatedAt: new Date() })
      .where(eq(tenants.id, req.params.id)).returning();
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado' });
    // email opcional
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```
Garantir que `plans`, `contracts`, `sql` estão importados no topo do arquivo.

- [ ] **Step 3: Verificar fluxo completo**
Run:
```bash
docker compose restart backend && sleep 4
ADMIN="Authorization: Bearer <token-admin>"   # obter via login admin (companyId 0)
TID=$(docker compose exec -T postgres psql -tA -U wa_invites -d wa_invites -c "SELECT id FROM tenants WHERE name='Farmácia Teste' LIMIT 1;")
# lista pendentes
curl -s "localhost:3001/api/admin/tenants?status=pending" -H "$ADMIN" | jq 'length'
# aprova
curl -s -X POST "localhost:3001/api/admin/tenants/$TID/approve" -H "$ADMIN" -H 'Content-Type: application/json' -d '{}' | jq
# contrato trial criado?
docker compose exec -T postgres psql -U wa_invites -d wa_invites -c "SELECT is_trial, status, expires_at FROM contracts WHERE tenant_id='$TID';"
# agora a rota de negócio deve responder (não mais 403)
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/api/session -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Slug: $SLUG"
```
Expected: pendentes ≥1; approve `ok:true`; contrato `is_trial=t, status=active`; sessão deixa de dar 403.

- [ ] **Step 4: Commit**
```bash
git add backend/src/routes/admin.routes.js
git commit -m "feat(admin): approval queue (list/approve/reject) + trial start"
```

---

## Task 10: Cron — trial expirado não desativa o tenant

**Files:**
- Modify: `backend/src/cron/contractExpiry.js`

- [ ] **Step 1: Distinguir trial de contrato pago**

Em `deactivateExpiredContracts`, incluir `isTrial` no select e, no loop, **pular** a desativação do tenant/WA quando `isTrial=true` (apenas marcar o contrato como `expired`):
```js
const expired = await db.select({
  contractId: contracts.id,
  tenantId: contracts.tenantId,
  isTrial: contracts.isTrial,
}).from(contracts).where(and(
  eq(contracts.status, 'active'),
  isNotNull(contracts.expiresAt),
  lte(contracts.expiresAt, now),
));
// ...
for (const { contractId, tenantId, isTrial } of expired) {
  await db.update(contracts).set({ status: 'expired', updatedAt: now }).where(eq(contracts.id, contractId));
  if (isTrial) {
    // Trial: só bloqueia envios (via gate); mantém conta acessível p/ pagar. (Fase 2: gerar cobrança Asaas aqui.)
    console.log(`[cron] trial ${contractId} expirou — tenant ${tenantId} mantido para conversão`);
    continue;
  }
  // Pago vencido: comportamento atual (desativa tenant + WA)
  await db.update(tenants).set({ active: false, updatedAt: now }).where(eq(tenants.id, tenantId));
  // ...resto inalterado (whatsappSessions + destroy client)
}
```

- [ ] **Step 2: Verificar (forçar expiração de um trial)**
Run:
```bash
# expira o trial do tenant de teste manualmente
docker compose exec -T postgres psql -U wa_invites -d wa_invites -c "UPDATE contracts SET expires_at = now() - interval '1 day' WHERE tenant_id='$TID';"
# roda o cron à mão
docker compose exec -T backend node -e "require('./src/cron/contractExpiry').deactivateExpiredContracts().then(r=>console.log(r))"
# tenant deve continuar active=true (trial), contrato expired; rota de negócio dá 403 trial_expired
docker compose exec -T postgres psql -U wa_invites -d wa_invites -c "SELECT t.active, c.status, c.is_trial FROM tenants t JOIN contracts c ON c.tenant_id=t.id WHERE t.id='$TID';"
curl -s localhost:3001/api/session -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Slug: $SLUG" | jq .state
```
Expected: `active=t`, `status=expired`, `is_trial=t`; gate retorna `"trial_expired"`.

- [ ] **Step 3: Commit**
```bash
git add backend/src/cron/contractExpiry.js
git commit -m "feat(cron): expired trial blocks sends without deactivating tenant"
```

---

## Task 11: Frontend — Register.jsx (CPF/CNPJ, email, senha, slug preview)

> Ao executar tarefas de UI, **usar a skill frontend-design**. Manter o visual coerente com o `Register.jsx` atual (cards, brand colors, lucide-react).

**Files:**
- Modify: `frontend/src/pages/Register.jsx`
- Reference: `frontend/src/utils/phone.js` (máscara telefone), `frontend/src/api`

- [ ] **Step 1: Form** — adicionar:
  - Radio **CPF/CNPJ** (controla máscara do documento e o label do nome: "Nome completo" vs "Nome da empresa").
  - Campo **documento** com máscara conforme tipo.
  - Campos **email** e **senha** (senha mínima 8; mostrar dica).
  - **Slug**: remover input manual; mostrar **preview read-only** derivado do nome (usar uma `slugify` no frontend espelhando a do backend) — apenas informativo (`gestaozap.digital/<slug>`).
- [ ] **Step 2: Submit** — `POST /api/signup` com `{ documentType, document, name, whatsapp, email, password, affiliateCode }`. Manter validação do código de afiliado via `GET /api/affiliates/validate/:code` (já existe) para o banner/desconto.
- [ ] **Step 3: Tela de sucesso** — trocar para: "Cadastro enviado! Sua conta está **em análise**. Avisaremos por email quando for aprovada." (não prometer acesso imediato nem subdomínio ativo).
- [ ] **Step 4: Verificar no navegador** (`run` skill ou manualmente): preencher e enviar; conferir 201 e a tela "em análise". Documento inválido mostra erro do backend.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/Register.jsx
git commit -m "feat(ui): signup form with CPF/CNPJ, email+password, slug preview"
```

---

## Task 12: Frontend — Login.jsx (sem companyId, telas de estado)

**Files:**
- Modify: `frontend/src/pages/Login.jsx`
- Create: `frontend/src/pages/SignupPending.jsx`
- Reference: `frontend/src/context/TenantContext.jsx`, `frontend/src/api`

- [ ] **Step 1: Login.jsx** — remover o campo "Identificador da empresa"; enviar `POST /api/auth/login` com `{ email, password }` apenas (o backend resolve a company pelo subdomínio). Ajustar o texto de ajuda.
- [ ] **Step 2: Telas de estado** — quando uma rota de negócio retornar `403 {state}` (ou o login retornar um estado pendente), renderizar `SignupPending.jsx` com a mensagem certa por `state`: `pending_approval` ("conta em análise"), `rejected` ("cadastro recusado"), `trial_expired` ("trial encerrado — pague para continuar"). Definir onde interceptar (ex.: no `TenantContext`/wrapper de rotas, lendo o `state` do 403).
- [ ] **Step 3: Verificar** — login de conta `pending` mostra "em análise"; conta aprovada entra normal.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/Login.jsx frontend/src/pages/SignupPending.jsx frontend/src/context/TenantContext.jsx
git commit -m "feat(ui): email+password login and account-state screens"
```

---

## Task 13: Frontend admin — fila de aprovação + trial_days

**Files:**
- Modify: `frontend/src/pages/admin/AdminTenants.jsx`, `frontend/src/pages/admin/AdminConfig.jsx`

- [ ] **Step 1: AdminTenants** — aba/filtro "Pendentes" (`GET /api/admin/tenants?status=pending`) listando nome, documento, WhatsApp, afiliado e slug (editável). Botões **Aprovar** (`POST .../approve` com `{slug?, trialDays?}`) e **Rejeitar** (`POST .../reject`). Atualizar a lista após a ação.
- [ ] **Step 2: AdminConfig** — campo numérico **trial_days** lido/gravado no `platform_config` (seguir o padrão das outras chaves de config já presentes na tela).
- [ ] **Step 3: Verificar** — aprovar um pendente pelo painel inicia o trial; conta some da fila de pendentes.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/admin/AdminTenants.jsx frontend/src/pages/admin/AdminConfig.jsx
git commit -m "feat(admin-ui): approval queue + trial_days config"
```

---

## Task 14: Landing — CTA para /registrar (preservando ?ref)

**Files:**
- Modify: `frontend/src/pages/Landing/Landing.jsx`

- [ ] **Step 1:** Apontar o CTA principal de contratação para `/registrar` (preservando `?ref=` se presente na URL). Manter o botão de WhatsApp como canal secundário, se desejado.
- [ ] **Step 2: Verificar** — clicar no CTA leva ao `/registrar`; com `?ref=CODE` o banner do afiliado aparece.
- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/Landing/Landing.jsx
git commit -m "feat(landing): CTA to self-service signup preserving affiliate ref"
```

---

## Verificação final (smoke E2E no stack local)

- [ ] `docker compose exec -T backend npm run db:migrate` sem erro.
- [ ] Fluxo: signup (pending) → login mostra "em análise" → admin aprova → login entra e usa → expira trial (cron) → rota de negócio bloqueia com `trial_expired`, login ainda funciona.
- [ ] Tenants pré-existentes seguem `approved` e funcionando (sem regressão).
- [ ] Rodar os testes puros: `cd backend && npx jest src/__tests__/slug.util.test.js src/__tests__/document.util.test.js src/__tests__/access.util.test.js` → todos PASS.

## Fora de escopo (Fase 2)
Integração Asaas (criar customer + subscription com desconto na 1ª parcela), auto-cobrança no fim do trial e envio do link de pagamento. O hook está isolado no cron (Task 10) e o webhook de confirmação + comissão já existem.
