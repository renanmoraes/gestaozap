# GestãoZap — Documento de Contexto do Projeto

> Documento analítico completo para onboarding, planejamento e uso com assistentes de IA.
> Última atualização: jun/2026.

---

## 1. O que é o GestãoZap

O **GestãoZap** é uma plataforma **SaaS multi-tenant** para gestão de comunicação via **WhatsApp pessoal/comercial**. Nasceu como ferramenta local para envio de convites personalizados a empresários (encontros presenciais) e evoluiu para produto com:

- Conexão WhatsApp via QR Code (`whatsapp-web.js`)
- Disparo em massa com fila, anti-ban e horário comercial
- CRM leve de contatos com tags, opt-out e consentimento LGPD
- Templates de campanha com variáveis (`{nome}`, `{evento}`, etc.)
- Chat ao vivo estilo WhatsApp Web
- Mensagens rápidas (atalhos)
- Histórico, métricas e análise de respostas (positivo/negativo/neutro)
- Billing por plano (Starter/Pro/Business)
- Painel admin para operação da plataforma
- Programa de afiliados
- Backup/restore
- Integração de pagamentos (Asaas)

**Domínio de produção:** `gestaozap.digital`  
**Modelo de tenancy:** subdomínio por cliente — `[slug].gestaozap.digital`  
**Admin:** `admin.gestaozap.digital` (ou `?admin=1` em localhost)

---

## 2. Evolução do Projeto

### Fase original (abr/2026 — spec `wa-invites-design.md`)

- Ferramenta **local** para envios ocasionais (30–100 contatos)
- Stack: React + Express + **MongoDB** + Bull/Redis
- Foco: convites via conta pessoal do WhatsApp
- Sem multi-tenant, sem billing

### Estado atual (v2.0)

- **PostgreSQL** com Drizzle ORM (migrou de MongoDB)
- **Multi-tenant** completo com isolamento por `tenant_id`
- SaaS com planos, contratos, uso de mensagens e Asaas
- Chat ao vivo, magic link login, storage R2, painel admin
- Deploy em VPS (Hostinger) com Nginx wildcard + blue-green

O banco ainda se chama `wa_invites` (legado do nome original do projeto).

---

## 3. Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite 5, TailwindCSS 3, React Router 6, Axios, Socket.IO Client, Lucide Icons, Recharts |
| Backend | Node.js, Express 4, Socket.IO 4 |
| WhatsApp | whatsapp-web.js 1.25 (Puppeteer/Chrome headless) |
| ORM/DB | Drizzle ORM 0.32 + PostgreSQL 16 |
| Fila | Bull 4 + Redis 7 |
| Email | Resend (magic links) |
| Storage | Local (`/uploads`) ou Cloudflare R2 (S3-compatible via `@aws-sdk/client-s3`) |
| Pagamentos | Asaas (webhook) |
| Telefone | libphonenumber-js (validação E.164) |
| Mídia | ffmpeg-static + fluent-ffmpeg (transcodifica áudio Opus → MP3) |
| Testes | Jest + Supertest |
| Infra | Docker Compose, Nginx, Let's Encrypt wildcard |

---

## 4. Estrutura de Pastas

```
gestaozap/
├── docker-compose.yml          # backend, frontend, postgres, redis
├── .env.example
├── backend/
│   ├── package.json            # v2.0.0
│   ├── Dockerfile
│   ├── src/
│   │   ├── app.js              # Express + Socket.IO bootstrap
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   ├── platform.js     # cache de platform_config
│   │   │   ├── queue.js        # Bull queues por tenant
│   │   │   └── registry.js     # io global
│   │   ├── db/
│   │   │   ├── schema.js       # Drizzle schema completo
│   │   │   ├── migrate.js
│   │   │   ├── index.js
│   │   │   └── seeds/index.js
│   │   ├── middleware/
│   │   │   ├── tenantResolver.js
│   │   │   ├── requireTenant.js
│   │   │   ├── requireAdmin.js
│   │   │   └── featureGate.js  # requireWAConnected
│   │   ├── routes/             # 15+ routers
│   │   ├── services/           # lógica de negócio
│   │   ├── models/             # legado/alternativos
│   │   ├── utils/
│   │   ├── cron/
│   │   ├── scripts/
│   │   └── __tests__/
│   ├── uploads/                # mídia local
│   └── backups/                # backups JSON
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # roteamento tenant vs admin
│   │   ├── api/index.js        # Axios + interceptors
│   │   ├── context/TenantContext.jsx
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/              # telas tenant
│   │   └── pages/admin/        # telas admin
│   └── vite.config.js
├── infra/
│   ├── nginx.conf              # wildcard SSL + proxy
│   ├── deploy.sh               # blue-green
│   └── initial-deploy.sh
├── imports/                    # batches JSON de contatos
├── docs/                       # documentação do projeto
└── memory/gestaozap-ops.md     # notas operacionais
```

---

## 5. Arquitetura Geral

```
                    ┌─────────────────────────────────────┐
                    │  Nginx (wildcard SSL)               │
                    │  [slug].gestaozap.digital           │
                    │  admin.gestaozap.digital            │
                    │  Header: X-Tenant-Slug              │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
     │ Frontend :3002  │  │ Backend :3001  │  │ Socket.IO      │
     │ React/Vite     │  │ Express        │  │ (salas/tenant) │
     └─────────────────┘  └───────┬────────┘  └────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
  ┌──────▼──────┐         ┌───────▼───────┐        ┌───────▼───────┐
  │ PostgreSQL  │         │ Redis + Bull  │        │ whatsapp-web  │
  │ (Drizzle)   │         │ fila envio    │        │ .js/Puppeteer │
  └─────────────┘         └───────────────┘        └───────────────┘
                                                          │
                                                  volume: wwebjs_auth
                                                  (sessões por tenant)
```

### Fluxo de request tenant

1. Nginx extrai slug do subdomínio → header `X-Tenant-Slug`
2. `tenantResolver` middleware busca tenant no PostgreSQL
3. `requireTenant` (se `AUTH_REQUIRED=true`) valida Bearer token
4. Rota executa com `req.tenant.id` isolando dados

### Socket.IO

- Cada conexão entra na sala do `tenantId`
- Eventos: `qr`, `session:status`, `session:ready`, `send:progress`, `send:paused`, etc.
- Isolamento por tenant evita vazamento de eventos entre clientes

---

## 6. Multi-Tenancy

### Identificação

- **Produção:** subdomínio → slug → tenant
- **Dev:** sem header → `DEFAULT_TENANT_ID` (`00000000-0000-0000-0000-000000000001`)

### Isolamento

- Todas as tabelas de negócio têm `tenant_id`
- Sessão WhatsApp separada por tenant: `.wwebjs_auth/session-{tenantId}/`
- Fila Bull separada por tenant (`getQueueForTenant`)
- Estado WA em memória: `Map<tenantId, { client, status, consecutiveFailures }>`

### Campos do tenant

- `slug`, `name`, `registeredPhone` (número que DEVE conectar no QR)
- `active` (kill switch)
- `asaasCustomerId`
- `termsAcceptedAt`, `termsVersion`

---

## 7. Modelo de Dados (PostgreSQL / Drizzle)

### Enums

- `send_status`: pending, sent, failed
- `contract_status`: active, expired, cancelled, pending
- `payment_type`: subscription, per_message, credit, refund
- `payment_status`: pending, paid, failed, cancelled
- `wa_session_status`: disconnected, qr_ready, connected

### Tabelas principais

**Core / Auth**

- `tenants` — clientes da plataforma
- `tenant_sessions` — tokens Bearer (hash SHA-256, 30 dias)
- `admin_sessions` — sessões admin (24h)
- `tenant_users` — usuários por tenant (email, role)
- `magic_link_tokens` — login passwordless (15 min, uso único)
- `platform_config` — config global key/value (anti-ban, storage, termos)

**WhatsApp**

- `whatsapp_sessions` — status persistido (1:1 com tenant)

**CRM**

- `contacts` — nome, phone, tags, active, optedOut, consentimentos LGPD granulares (marketing, transactional, support, billing)

**Campanhas / Envio**

- `campaigns` — template texto, imagem, opt-out configurável
- `send_logs` — log por destinatário (status, erro, messageId WA, chatId)
- `feedback_analyses` — análise de respostas por campanha
- `message_usage` — contagem mensal para billing

**Chat ao vivo**

- `conversations` — espelho de chats WA (unread, preview, tags, pinned, archived)
- `messages` — mensagens in/out/note com mídia
- `quick_replies` — atalhos `/shortcut`

**Monetização**

- `plans` — Starter (500 msg/mês, R$97), Pro (2000, R$197), Business (ilimitado, R$397)
- `contracts` — vínculo tenant↔plano, expires_at (null = vitalício)
- `payment_records` — histórico financeiro

**Afiliados**

- `affiliates` — código, comissão %, desconto %
- `affiliate_referrals` — conversões e comissões

---

## 8. Backend — Rotas da API

### Públicas / especiais

| Rota | Descrição |
|------|-----------|
| `GET /api/health` | Healthcheck |
| `POST /api/asaas/webhook` | Webhook pagamentos Asaas |
| `POST /api/admin/login` | Login admin (email + secret) |
| `POST /api/auth/*` | Login, magic link, termos, logout, me |
| `GET/POST /api/affiliates/validate/:code` | Validação código afiliado |
| `POST /api/affiliates/register` | Registro self-service via afiliado |

### Tenant (requer tenantResolver + auth opcional)

| Prefixo | Funcionalidade |
|---------|----------------|
| `/api/session` | Status WA, start (QR), stop |
| `/api/contacts` | CRUD, import CSV/JSON, import do telefone, opt-in/out, consent, export |
| `/api/campaigns` | CRUD templates com upload de imagem |
| `/api/send` | Disparo em massa (enfileira Bull), test-number |
| `/api/queue` | Jobs ativos, pause/resume/cancel, recipients |
| `/api/logs` | Histórico, runs, retry, analyze-replies |
| `/api/chats` | Conversas, mensagens, sync, notas internas, send-template |
| `/api/quick-replies` | CRUD atalhos |
| `/api/backup` | Criar, listar, download, restore, delete |
| `/api/billing` | Summary, history, usage daily |

### Admin (`/api/admin/*` + requireAdmin)

- CRUD tenants (criar, editar, extend, kill-switch, disconnect-wa, delete)
- Config platform (batch_size, delays, storage R2, etc.)
- Plans, financial dashboard
- DLQ (dead letter queue) + redrive
- Incidents + resolve
- Metrics globais
- Storage test/backfill

---

## 9. Serviços Principais (Backend)

### `whatsapp.service.js`

Coração da integração WhatsApp:

- `initWhatsApp(tenantId, io)` — Client com LocalAuth isolado
- Eventos: qr → emite QR via Socket.IO; ready → valida telefone vs `registeredPhone`
- `sendMessage(phone, text, imagePath)` — envio individual
- `autoReconnectSessions(io)` — reconecta sessões ativas no boot (3s delay)
- Sync de chats/mensagens para `conversations`/`messages`
- Handler de mensagens recebidas: opt-out ("SAIR"), classificação de respostas
- Variáveis de ambiente: `WWEBJS_READ_MSG_LIMIT`, `WWEBJS_DEBUG`, etc.
- Bug histórico corrigido: envio usava variantes de telefone sem DDD; agora usa `55+DDD+número` completo

### `queue.service.js`

Processador Bull para disparos:

- Substitui variáveis no template
- Delay anti-ban aleatório (15–60s configurável)
- Pausa a cada N mensagens (batch_size=30, pause 10min)
- Respeita horário comercial (hourStart/hourEnd)
- Pause/resume/cancel via Redis flags
- Quality gate via `whatsapp.guard.js`
- Tracking em `message_usage` e `send_logs`
- Emite progresso via Socket.IO

### `whatsapp.guard.js`

Proteção anti-bloqueio:

- Validação E.164 estrita (libphonenumber-js)
- Pre-flight `isRegisteredUser` com cache LRU 1h
- Classificação de erros (transient/permanent/policy)
- Backoff exponencial com jitter
- Rate limit por destinatário (24h)
- Quality gate: pausa se ACK_ERROR > 2%
- Kill switch por tenant via Redis

### `conversation.service.js`

Chat ao vivo:

- Upsert conversas a partir de chats WA
- Persistência de mensagens com mídia
- Transcodificação Opus→MP3 (Safari/iOS)
- Storage local ou R2
- Suporte a LID (Linked ID do WhatsApp)
- Notas internas (direction='note')

### `backup.service.js`

- Backup JSON (EJSON) de todas as coleções + imagens base64
- Automático diário 3h (TZ São Paulo), retém 7
- Restore destrutivo

### `magic-link.service.js`

- Gera token, envia email via Resend
- URL: `{slug}.gestaozap.digital/auth/magic-link?token=...`
- Cria `tenant_users` no primeiro acesso

### `storage.service.js`

- Provider `local` ou `r2` (Cloudflare)
- Config via `platform_config` (admin altera sem deploy)

### `metrics.service.js` / `incidents.service.js`

- Métricas de envio e incidentes operacionais

### `platform.js`

- Cache em memória de `platform_config`
- Poller a cada 60s

### `cron/contractExpiry.js`

- Verifica contratos expirados, desativa tenants

---

## 10. Autenticação e Autorização

### Tenant

1. **Login simples** (`POST /api/auth/login`) — cria sessão sem senha (dev/legado)
2. **Magic link** (`send-magic-link` → email → `verify-magic-link`) — fluxo principal em produção
3. Token Bearer SHA-256 em `tenant_sessions`, expira 30 dias
4. `AUTH_REQUIRED=false` (dev): rotas funcionam sem token
5. `AUTH_REQUIRED=true` (prod): exige Bearer em rotas de negócio

### Admin

- Email fixo (`ADMIN_EMAIL`) + secret (`ADMIN_SECRET`)
- Token 24h em `admin_sessions`
- Frontend: `localStorage.gestaozap_admin_token`

### Termos de uso

- Versão em `platform_config.terms_current_version`
- Aceite obrigatório antes de usar (`termsAcceptedAt`)

---

## 11. Frontend — Estrutura

### Dois apps no mesmo bundle

1. **TenantApp** — `[slug].gestaozap.digital`
2. **AdminApp** — `admin.gestaozap.digital` ou `?admin=1`

### Páginas tenant (sidebar)

| Rota | Página | Requer WA? |
|------|--------|------------|
| `/` | Session (QR Code) | — |
| `/chat` | Conversas ao vivo | Sim (WaGate) |
| `/contacts` | Contatos | — |
| `/quick-replies` | Mensagens rápidas | — |
| `/campaigns` | Templates | — |
| `/send` | Disparo | Sim |
| `/queue` | Fila de envio | — |
| `/history` | Histórico/métricas | — |
| `/backup` | Backup/restore | — |
| `/billing` | Financeiro | — |
| `/registrar` | Registro via afiliado | Público |

### Páginas admin

- Clientes (tenants), detalhe tenant, afiliados, armazenamento R2, configurações

### Contexto global (`TenantContext`)

- Auth state, waStatus, wrongPhone
- Socket.IO para eventos de sessão
- login/logout/acceptTerms

### `WaGate.jsx`

- Bloqueia UI quando WA desconectado (HTTP 423)
- Redireciona para página Session

### Design

- TailwindCSS, sidebar escura, accent emerald/brand
- Lucide icons
- Responsivo básico

---

## 12. Fluxos de Negócio Principais

### 12.1 Onboarding tenant

1. Admin cria tenant (slug, nome, telefone registrado, plano)
2. Cliente acessa `[slug].gestaozap.digital`
3. Login via magic link (email)
4. Aceita termos
5. Conecta WhatsApp (QR) — validação: número conectado = `registeredPhone`
6. Importa contatos (CSV, JSON, ou do telefone)
7. Cria template de campanha
8. Dispara mensagens

### 12.2 Disparo em massa

1. Seleciona campanha + contatos
2. Filtros: active, não optedOut, consent da categoria (marketing default)
3. `preventDuplicate` evita reenvio na mesma campanha
4. Job Bull enfileirado por tenant
5. Processor envia com delays, pausas, horário comercial
6. Progresso em tempo real via Socket.IO
7. Logs em `send_logs`, uso em `message_usage`

### 12.3 Opt-out (LGPD)

- Resposta "SAIR" → `optedOut=true`, `optedOutAt=now`
- Campanhas podem incluir texto opt-out no rodapé
- Consentimento granular por categoria impede envio indevido

### 12.4 Análise de respostas

- `reply-classifier.util.js` classifica: positive, negative, neutral
- Padrões PT-BR: "sim", "vou", "não vou", emojis 👍/👎
- Negative checado antes de positive ("não vou" ≠ positivo)
- `POST /api/logs/:campaignId/analyze-replies` gera snapshot

### 12.5 Chat ao vivo

1. Sync inicial ou incremental de chats WA
2. Mensagens persistidas em PostgreSQL
3. Envio de texto, imagem, áudio, template
4. Notas internas (visíveis só no sistema)
5. Marcar como lido, tags na conversa

### 12.6 Registro via afiliado

1. Link com código afiliado
2. Valida desconto/comissão
3. Cria tenant + contrato
4. Registra referral

---

## 13. Configurações da Plataforma (platform_config)

| Key | Default | Descrição |
|-----|---------|-----------|
| batch_size | 30 | Msgs por lote antes de pausa |
| batch_pause_ms | 600000 | Pausa entre lotes (10 min) |
| antiban_delay_min_ms | 15000 | Delay mínimo entre msgs |
| antiban_delay_max_ms | 60000 | Delay máximo |
| hour_start_default | 8 | Início horário comercial |
| hour_end_default | 20 | Fim horário comercial |
| max_consecutive_failures | 3 | Falhas antes de pausar |
| failure_pause_ms | 300000 | Pausa após falhas (5 min) |
| backup_retention | 7 | Backups mantidos |
| backup_auto_hour | 3 | Hora backup automático |
| terms_current_version | 2.0 | Versão termos |
| storage_provider | local | local ou r2 |
| r2_* | — | Credenciais Cloudflare R2 |

Admin altera via painel sem redeploy.

---

## 14. Planos e Billing

| Plano | Preço | Mensagens/mês |
|-------|-------|---------------|
| Starter | R$ 97 | 500 |
| Pro | R$ 197 | 2.000 |
| Business | R$ 397 | Ilimitado |

- Contratos com `expires_at` ou vitalício (null)
- Cron desativa tenants com contrato expirado
- Asaas: webhook atualiza `payment_records` e status contrato
- Tenant vê: plano, uso mensal, dias até vencimento, histórico

---

## 15. Deploy e Infraestrutura

### Docker Compose (dev/prod)

- **backend:3001** — Express + WA + Bull processor
- **frontend:3002** — Vite dev server (proxy para backend)
- **postgres:5432** — exposto 127.0.0.1:5433 em dev
- **redis** — filas Bull
- **Volume wwebjs_auth** — sessões Chrome/WA persistentes

### Nginx (produção)

- Wildcard SSL `*.gestaozap.digital`
- Injeta `X-Tenant-Slug` do subdomínio
- Proxy WebSocket para Socket.IO
- `/uploads/` proxied para backend

### Blue-green deploy (`infra/deploy.sh`)

- Stacks blue/green em portas alternadas (3001/3002 vs 4001/4002)
- Healthcheck antes de switch
- Nginx reload atômico
- Drain 30s, derruba stack antigo

### VPS Hostinger

- `/opt/gestaozap/blue` e `/opt/gestaozap/green`
- Arquivo `.active` indica stack corrente

---

## 16. Variáveis de Ambiente

```env
DATABASE_URL=postgresql://wa_invites:wa_invites@postgres:5432/wa_invites
REDIS_HOST=redis
REDIS_PORT=6379
PORT=3001
ADMIN_EMAIL=admin@gestaozap.digital
ADMIN_SECRET=...
AUTH_REQUIRED=false|true
RESEND_API_KEY=...
VITE_API_URL=...
NODE_ENV=development|production
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001
PUPPETEER_EXECUTABLE_PATH=...  # Chrome no container
WWEBJS_AUTH_PATH=.wwebjs_auth
```

---

## 17. Operação e Dev Notes

### Sem hot-reload no backend Docker

- `CMD ["node", "src/app.js"]` — mudanças exigem `docker compose restart backend`
- Volume monta `src/` mas processo carrega código antigo em memória

### WhatsApp

- `autoReconnectSessions` tenta reconectar após 3s no boot
- QR via Socket.IO evento `qr`
- Login persiste em volume — reconecta sem QR se sessão válida
- Node/npm não instalados no WSL host — rodar testes via `docker exec gestaozap-backend-1 npm test`

### Migrations

- `npm run db:migrate` → `node src/db/migrate.js`
- Seeds de config e planos em `db/seeds/index.js`

### Testes existentes

- `app.test.js`, `contacts.routes.test.js`, `campaigns.routes.test.js`
- `send.routes.test.js`, `queue.routes.test.js`, `queue.service.test.js`
- `whatsapp.service.test.js`, `reply-classifier.util.test.js`, `phone.util.test.js`
- `logs.routes.test.js`, `models.test.js`

---

## 18. Segurança e Compliance

- Tokens hasheados (SHA-256), nunca armazenados em plain text
- Magic links: 15 min, uso único
- Isolamento multi-tenant em DB, filas, sockets e sessões WA
- LGPD: opt-out, consentimento granular, termos versionados
- Kill switch admin desativa tenant instantaneamente
- Validação de telefone registrado vs conectado (anti-fraude)
- AUTH_REQUIRED para produção
- Admin secret separado do tenant auth

---

## 19. Limitações e Riscos Conhecidos

1. **whatsapp-web.js** — não é API oficial; risco de banimento (mitigado por anti-ban)
2. **Puppeteer/Chrome** — pesado, 1 instância por tenant conectado
3. **Single-node WA** — multi-instance WA é Fase 3 futura
4. **Sem hot-reload** — dev workflow mais lento
5. **Restore de backup destrutivo** — cuidado em produção
6. **Dependência de Chrome locks** — cleanup de SingletonLock no boot

---

## 20. Features em Desenvolvimento Recente

- **Magic link login** — `magic-link.service.js`, rotas auth, Resend
- **Login.jsx** — UI magic link no frontend
- **Migrations** — `tenant_users`, `magic_link_tokens`
- **`.env.example`** — RESEND_API_KEY

---

## 21. Glossário

| Termo | Significado |
|-------|-------------|
| Tenant | Cliente/organização na plataforma |
| Slug | Identificador URL (ex: `acme` → acme.gestaozap.digital) |
| Campanha/Template | Modelo de mensagem reutilizável |
| Disparo/Send | Envio em massa para lista de contatos |
| WaGate | Guard de UI que exige WA conectado |
| DLQ | Dead Letter Queue — envios falhos permanentes |
| Opt-out | Contato que pediu para não receber mais |
| LID | Linked ID — identificador interno WA para privacidade |
| LocalAuth | Estratégia whatsapp-web.js que persiste sessão em disco |

---

## 22. Prompt Sugerido para Assistentes de IA

Ao colar este documento, adicione:

> "Este é o contexto completo do projeto GestãoZap, um SaaS multi-tenant de gestão WhatsApp. Use estas informações para [SUA TAREFA]. O código está em Node.js/Express + React/Vite + PostgreSQL + whatsapp-web.js. Responda considerando multi-tenancy, anti-ban, LGPD e a stack descrita acima."

---

## 23. Diagrama de Entidades (relacionamentos)

```
tenants ─┬─ tenant_sessions
         ├─ tenant_users
         ├─ magic_link_tokens
         ├─ whatsapp_sessions (1:1)
         ├─ contacts
         ├─ campaigns ── send_logs ── message_usage
         │              └─ feedback_analyses
         ├─ conversations ── messages
         ├─ quick_replies
         ├─ contracts ── plans
         │            └─ payment_records
         └─ affiliate_referrals ── affiliates

platform_config (global)
admin_sessions (global)
```

---

## 24. Resumo Executivo

O **GestãoZap** é um SaaS brasileiro que permite empresas e empreendedores gerenciarem comunicação WhatsApp em escala, usando a própria conta WhatsApp do cliente (via QR Code). Oferece disparo massivo com proteções anti-ban, CRM de contatos com LGPD, chat ao vivo, templates, billing por plano, painel admin multi-tenant e programa de afiliados. Roda em Docker (Express + React + PostgreSQL + Redis + whatsapp-web.js), deploy em VPS com Nginx wildcard, e evoluiu de ferramenta local MongoDB para plataforma PostgreSQL v2.0 com monetização Asaas.
