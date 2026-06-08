# Pré-cadastro de afiliados com aprovação e trial — Design (Fase 1)

**Data:** 2026-06-08
**Status:** Aprovado para implementação (Fase 1)
**Autor:** Renan + Claude

## Contexto

Hoje a landing direciona o visitante para contato via WhatsApp. Já existe no código um fluxo parcial de auto-cadastro via afiliado (`/registrar?ref=CODE` → `frontend/src/pages/Register.jsx` + `POST /api/affiliates/register` em `backend/src/routes/affiliates.routes.js`), mas ele tem lacunas críticas para o estado atual do produto:

1. **Não cria credenciais de login.** Cria apenas `tenant` + `contract` + `affiliate_referral`, sem `user`/`company`/`user_company`. Como o sistema agora roda com `AUTH_REQUIRED=true`, o cliente se cadastra e não consegue entrar.
2. **Cria o contrato `active` na hora**, liberando acesso sem aprovação nem pagamento.
3. **Não há gate de aprovação** — qualquer pessoa criaria conta e usaria.

Este spec cobre a **Fase 1**: pré-cadastro self-service com CPF/CNPJ, slug automático, criação de login, gate de aprovação pelo admin, e trial iniciado na aprovação. A **Fase 2** (integração Asaas para cobrança automática no fim do trial) é descrita brevemente em "Fora de escopo / Fase 2".

## Objetivos (Fase 1)

- Visitante (com ou sem link de afiliado) faz pré-cadastro self-service que cria conta com login.
- Todo cadastro entra como **pendente de aprovação** — sem acesso ao produto até o admin aprovar.
- Admin tem fila de aprovação no painel para aprovar/rejeitar.
- Na aprovação, inicia um **trial** de N dias (N configurável em `platform_config`).
- No fim do trial, os **envios são bloqueados** (cobrança ainda manual nesta fase).
- Desconto/comissão de afiliado continuam pela regra existente (comissão confirma na 1ª parcela paga — webhook Asaas já implementado).

## Não-objetivos (Fora de escopo / Fase 2)

- **Criação automática de cobrança no Asaas** (customer + subscription via API). Não existe hoje (`asaas.routes.js` só tem o webhook). Fica para a Fase 2.
- Auto-envio de link de pagamento no fim do trial. Fase 2.
- Migração da landing estática (a landing atual será apenas apontada para `/registrar`).

## Regras de negócio

### Fluxo ponta-a-ponta

1. **Link de afiliado:** `https://gestaozap.digital/registrar?ref=JOAO25` abre o pré-cadastro com o código preenchido e validado (banner "Indicação de João" + planos com desconto, via `GET /api/affiliates/validate/:code` já existente). Código é sempre **opcional** (cadastro orgânico funciona sem ele).
2. **Pré-cadastro** coleta: tipo de pessoa (`CPF` ou `CNPJ`), documento, nome (empresa se CNPJ / pessoa se CPF), WhatsApp, email, senha, código de afiliado (opcional). **Slug é gerado automaticamente** a partir do nome (read-only no formulário, com preview).
3. **Criação da conta** (1 transação) em estado `pending`:
   - `tenant` com `approval_status='pending'`, `active=false`, `document`, `document_type`, `affiliate_code`/`affiliate_id` (se houver), slug único gerado.
   - `company` vinculada ao tenant.
   - `user` (email + `password_hash` via bcrypt, `must_change_pwd=false`).
   - `user_company` (role `owner`).
   - `whatsapp_session` (`disconnected`).
   - `affiliate_referral` (`pending`) se houver código.
   - **Nenhum contrato é criado ainda.**
   - Email "recebemos seu cadastro, aguarde aprovação" (Resend, via serviço de email existente).
4. **Aprovação pelo admin** (fila de pendentes):
   - **Aprovar** → `approval_status='approved'`, `active=true`, cria `contract` com `is_trial=true`, `status='active'`, `started_at=now`, `expires_at = now + trial_days` (de `platform_config`). Cliente notificado (email) que pode entrar. Registra processor de fila do tenant.
   - **Rejeitar** → `approval_status='rejected'`, `active=false`. Cliente notificado (opcional).
5. **Durante o trial:** cliente entra em `slug.gestaozap.digital` e usa o produto normalmente até `expires_at`.
6. **Fim do trial:** o cron detecta `expires_at <= now` num contrato `is_trial` e **bloqueia os envios** (tenant entra em estado bloqueado), mas a conta segue acessível. Nesta fase, reativação/cobrança é **manual pelo admin**.
7. **Pagamento confirmado (Fase 2 / webhook já existente):** 1ª parcela paga → contrato deixa de ser trial, envios reliberados, `affiliate_referral` vira `confirmed`.

### Regra de acesso (autoritativa)

Para evitar ambiguidade, o acesso é definido por **duas regras separadas**:

- **Pode logar:** sempre que o `user` existir e estiver `active`. Login nunca depende de `approval_status` nem de contrato — isso garante que contas `pending`/`rejected`/trial-expirado consigam entrar e ver a tela informativa correta.
- **Pode usar o produto (envios/rotas de negócio):** `tenant.approval_status='approved'` **E** existe um `contract` do tenant com `status='active'` **E** (`expires_at IS NULL` OU `expires_at > now`). Avaliado por um helper único (ex.: `tenantHasActiveAccess(tenant)`), usado pelo middleware de rotas de negócio.
  - **Fonte de verdade:** o gate decide por `contract.status='active'` (o cron é quem vira `expired` no fim do trial). A comparação `expires_at > now` é uma rede de segurança para o caso de o cron atrasar — as duas concordam (contrato `expired` falha na cláusula de `status`), então não há duplo-gate.

O middleware de negócio, quando o acesso é negado, retorna um **código de estado** (`pending_approval` | `rejected` | `trial_expired` | `no_contract`) que o frontend usa para escolher a tela.

### Máquina de estados da conta (tenant)

`approval_status`: `pending` → `approved` | `rejected`

| Situação | approval_status | contrato | Pode logar | Pode usar produto | Código p/ frontend |
|---|---|---|---|---|---|
| Pré-cadastrado | pending | nenhum | sim | não | `pending_approval` |
| Aprovado / trial | approved | is_trial, vigente | sim | sim | — |
| Rejeitado | rejected | nenhum | sim | não | `rejected` |
| Trial expirado | approved | is_trial, `status='expired'` | sim | não | `trial_expired` |
| Pago (Fase 2) | approved | não-trial, vigente | sim | sim | — |

O flag `tenants.active` continua existindo e é gerenciado pelo admin (suspensão manual), mas **não é** o que o login checa — o gate de produto é a regra de acesso acima.

### Regras de slug

- Gerado server-side a partir do nome: normaliza (minúsculas, remove acentos, troca não-`[a-z0-9]` por `-`, colapsa hífens, trim).
- Garante unicidade: se já existir, anexa sufixo numérico incremental (`-2`, `-3`, …).
- Read-only no formulário (preview informativo). Admin pode editar o slug na tela de aprovação, se necessário.

### Regras de CPF/CNPJ

- Radio obrigatório: Pessoa Física (CPF) / Pessoa Jurídica (CNPJ).
- Máscara no input conforme o tipo. Validação de formato + dígitos verificadores no backend (rejeita inválido com 400).
- Armazenado em `tenants.document` (somente dígitos) e `tenants.document_type` (`cpf`/`cnpj`).
- Reuso na Fase 2 para criar o customer no Asaas (que exige `cpfCnpj`).

### Login do cliente (mudança necessária)

Hoje `auth.service.js::login(companyId, email, password, context)` exige um **`companyId` textual** (hex aleatório, ex.: `A1B2C3D4E5`) entregue no email de boas-vindas, e o `Login.jsx` tem um campo "Identificador da empresa". Para o self-service (cliente define a própria senha e acessa pelo subdomínio), exigir esse hex é inviável.

**Mudança:** o login do cliente passa a ser **email + senha**, com a `company` resolvida pelo **tenant do subdomínio** (relação tenant↔company é 1:1 para clientes). Implementação compatível: `companyId` torna-se opcional em `login()`; quando ausente e `context.tenantId` presente (acesso por subdomínio de cliente), resolve a company por `company.tenantId = context.tenantId`. O **login admin** (sentinela `companyId='0'` em `admin.gestaozap.digital`) permanece inalterado. O campo "Identificador da empresa" é removido do `Login.jsx` no contexto de cliente.

Como consequência, o `companyId` gerado no signup é interno (não precisa ser mostrado ao cliente).

### Premissas confirmadas

- Slug auto-gerado e read-only no formulário (admin ajusta se preciso).
- Cliente `pending` consegue logar (email+senha no subdomínio), mas vê tela "conta em análise".
- Senha: reutiliza `hashPassword` (bcrypt cost 10); mínimo de 8 caracteres; `must_change_pwd=false` no signup (cliente já definiu a própria senha).

## Modelo de dados (migrations idempotentes em `backend/src/db/migrate.js` + `schema.js`)

- `tenants`:
  - `approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'` (`pending`/`approved`/`rejected`)
  - `document VARCHAR(20)`
  - `document_type VARCHAR(4)` (`cpf`/`cnpj`)
  - (mantém `active BOOLEAN` existente)
- `contracts`:
  - `is_trial BOOLEAN NOT NULL DEFAULT false`
- `platform_config`:
  - chave `trial_days` (default `7`), exposta no admin de configuração.

Todas via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `INSERT ... ON CONFLICT DO NOTHING`, seguindo o padrão idempotente já usado no projeto.

## Mudanças no backend

### Novo endpoint de signup (substitui/expande `POST /api/affiliates/register`)
`POST /api/signup` (público):
- Body: `{ documentType, document, name, whatsapp, email, password, affiliateCode? }`.
- Valida: documento (formato+DV), email único (`users.email`), formato de senha (mínimo ex.: 8 chars).
- Gera slug único a partir de `name`.
- Valida afiliado se `affiliateCode` informado (reusa lógica existente).
- Transação: cria `tenant`(pending) + `company` + `user` + `user_company`(owner) + `whatsapp_session` + `affiliate_referral`(pending, se houver). **Sem contrato.**
  - **Importante:** o `user` é criado aqui com a **senha escolhida pelo cliente** (`hashPassword`, `must_change_pwd=false`). NÃO usar `provisionClientAccess` (ele gera senha temporária e `must_change_pwd=true`). Reusar apenas `generateUniqueCompanyId` para o `companyId` interno.
- Dispara email de "cadastro recebido".
- Retorna `{ tenantId, slug, status: 'pending' }`.
- O endpoint antigo `POST /api/affiliates/register` é aposentado (ou redirecionado) para evitar criar trial sem aprovação.

### Endpoints de admin (em `backend/src/routes/admin.routes.js`)
- `GET /api/admin/tenants?status=pending` — fila de aprovação (já existe listagem de tenants; adicionar filtro por `approval_status`).
- `POST /api/admin/tenants/:id/approve` — body opcional `{ slug?, trialDays? }`. Seta `approval_status='approved'` + `active=true`, cria `contract` trial (`is_trial=true`, `expires_at = now + trial_days`), notifica, registra processor de fila. **NÃO cria company/user** — já existem do signup (evita usuário/empresa duplicados). Idempotente: aprovar quem não está `pending` → 409.
- `POST /api/admin/tenants/:id/reject` — seta `approval_status='rejected'`, `active=false`, notifica (opcional).

### Auth / acesso
- `login()`: tornar `companyId` opcional para clientes — resolver a `company` por `context.tenantId` quando o acesso vier por subdomínio de cliente (ver "Login do cliente"). Admin (`'0'`) inalterado.
- Middleware de rotas de negócio (`requireTenant`/`requireAuth`): aplicar a **regra de acesso** (helper `tenantHasActiveAccess`) e, quando negar, retornar o **código de estado** (`pending_approval`/`rejected`/`trial_expired`/`no_contract`) para o frontend.
- O gate de envio passa a checar a regra de acesso (contrato vigente), não apenas `tenant.active`.

### Cron de trial (`backend/src/cron/contractExpiry.js`)
- Ajustar `deactivateExpiredContracts`: ao expirar um contrato **`is_trial`**, marcar `contract.status='expired'` (isso já bloqueia envios pela regra de acesso) e **não apagar** a conta nem forçar `tenant.active=false` — login segue disponível para o cliente ver "trial encerrado". Distinguir via `is_trial` para a Fase 2 (hook de cobrança isolado).
- Para contratos **não-trial** (pagos) vencidos, manter o comportamento atual (desativar tenant).

### Email
- Reusar o serviço de email (Resend) existente: templates "cadastro recebido (em análise)", "cadastro aprovado — trial liberado", "cadastro recusado" (opcional).

## Mudanças no frontend

### `frontend/src/pages/Register.jsx` (rota `/registrar`)
- Adicionar: radio CPF/CNPJ, campo documento com máscara, email, senha. Label do nome muda conforme o tipo.
- Remover campo manual de slug; mostrar **preview read-only** do slug gerado a partir do nome.
- Tela de sucesso passa a ser "Cadastro enviado! Sua conta está **em análise**. Avisaremos por email quando for aprovada." (não promete acesso imediato).

### Login / tela do tenant (`frontend/src/pages/Login.jsx`)
- **Remover o campo "Identificador da empresa"** no login de cliente (subdomínio) — passa a ser só email + senha. (Login admin em `admin.gestaozap.digital` permanece como está.)
- Tratar os códigos de estado retornados pelo middleware: telas informativas para `pending_approval` ("conta em análise"), `rejected` ("cadastro recusado") e `trial_expired` ("trial encerrado — pague para continuar").

### Admin
- Fila de aprovação (em `AdminTenants.jsx` ou nova aba): lista pendentes com dados do cadastro (nome, documento, WhatsApp, afiliado, slug editável) + botões Aprovar/Rejeitar. Aprovar dispara início do trial.
- Config: campo `trial_days` na tela de configuração da plataforma.

## Tratamento de erros / casos de borda

- Email já cadastrado → 409 com mensagem clara.
- Slug colidindo → resolvido automaticamente com sufixo (não é erro para o usuário).
- Documento inválido → 400.
- Código de afiliado inválido/inativo → 400 (campo é opcional; se vazio, segue sem afiliado).
- Aprovar tenant que não está `pending` → 409 (idempotência).
- `trial_days` ausente/zerado no config → fallback para default 7.
- Transação de signup deve ser atômica (rollback total em qualquer falha).

## Testes

- Unit: geração de slug (acentos, colisão, caracteres inválidos); validação CPF/CNPJ (válidos/ inválidos).
- Integração: `POST /api/signup` cria todas as entidades em `pending` sem contrato; rejeita email duplicado; com/sem afiliado.
- Integração: `approve` cria contrato trial com `expires_at` correto e ativa o tenant; `reject` não cria contrato; idempotência.
- Integração: login de tenant `pending` retorna estado "em análise" e bloqueia envio.
- Cron: contrato trial expirado bloqueia envios sem apagar a conta; contrato pago vencido mantém comportamento atual.

## Fase 2 (resumo, fora deste spec)

- `backend/src/services/asaas.service.js`: criar customer (cpfCnpj) + subscription com desconto do afiliado na 1ª parcela; salvar `asaas_subscription_id`.
- Cron de fim de trial gera a cobrança automaticamente e envia link por email/WhatsApp.
- Webhook (`asaas.routes.js`) já confirma pagamento e libera comissão — sem mudança.
