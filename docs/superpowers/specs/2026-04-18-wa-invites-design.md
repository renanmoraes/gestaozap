# WA Invites — Design Spec
**Data:** 2026-04-18
**Status:** Aprovado

---

## Visão Geral

Ferramenta local para envio de convites personalizados via WhatsApp pessoal para encontros presenciais de empresários e empreendedores. Interface web local com disparo em batch, políticas anti-ban validadas pelo mercado e persistência em MongoDB.

---

## Contexto e Motivação

- Envios ocasionais (algumas vezes por mês) para 30–100 contatos
- Mensagens devem sair da conta pessoal do usuário (maior credibilidade)
- Projeto local — sem infraestrutura em nuvem por enquanto
- Arquitetura pensada para evoluir em produto no futuro

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React + Vite + TailwindCSS |
| Backend | Node.js + Express |
| WhatsApp | whatsapp-web.js |
| Banco de dados | MongoDB (Docker) |
| Fila de envio | Bull + Redis (Docker) |
| Containerização | Docker Compose (tudo) |

---

## Arquitetura

```
┌─────────────────────────────────────────────────┐
│                Interface Web (React)            │
│  - Upload de imagem                             │
│  - Editor de texto com placeholder {nome}      │
│  - Seleção/importação de contatos               │
│  - Preview da mensagem                          │
│  - Painel de disparo com progresso em tempo real│
│  - Histórico de campanhas                       │
└───────────────────┬─────────────────────────────┘
                    │ HTTP REST
┌───────────────────▼─────────────────────────────┐
│              Backend (Express + Node)           │
│  - /api/session  → QR code + status da sessão  │
│  - /api/contacts → CRUD de contatos             │
│  - /api/campaigns → CRUD de campanhas           │
│  - /api/send     → disparo com batch/delay      │
│  - /api/logs     → histórico de envios          │
└──────────┬────────────────────┬─────────────────┘
           │                    │
┌──────────▼──────────┐  ┌──────▼──────────────────┐
│  whatsapp-web.js    │  │  Bull Queue + Redis      │
│  (sessão QR Code)   │  │  (fila de envio robusta) │
└─────────────────────┘  └──────────────────────────┘
           │                    │
┌──────────▼────────────────────▼─────────────────┐
│               MongoDB                           │
│  - contacts, campaigns, logs, session           │
└─────────────────────────────────────────────────┘
```

---

## Estrutura de Pastas

```
wa-invites/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── src/
│   │   ├── routes/
│   │   │   ├── session.routes.js
│   │   │   ├── contacts.routes.js
│   │   │   ├── campaigns.routes.js
│   │   │   ├── send.routes.js
│   │   │   └── logs.routes.js
│   │   ├── services/
│   │   │   ├── whatsapp.service.js
│   │   │   └── queue.service.js
│   │   ├── models/
│   │   │   ├── contact.model.js
│   │   │   ├── campaign.model.js
│   │   │   └── log.model.js
│   │   └── app.js
│   └── package.json
└── frontend/
    ├── Dockerfile
    └── src/
        ├── pages/
        │   ├── Session.jsx
        │   ├── Contacts.jsx
        │   ├── Campaigns.jsx
        │   ├── Send.jsx
        │   └── History.jsx
        └── App.jsx
```

---

## Modelos de Dados (MongoDB)

### Contatos (`contacts`)
```json
{
  "id": "uuid",
  "name": "João Silva",
  "phone": "5511999998888",
  "tags": ["empresario", "vip"],
  "active": true,
  "createdAt": "2026-04-18T10:00:00Z"
}
```

- `phone`: formato internacional sem `+` (padrão whatsapp-web.js)
- `tags`: permitem filtrar grupos para envios segmentados
- `active: false`: pausa contato sem deletar

### Campanhas (`campaigns`)
```json
{
  "id": "uuid",
  "name": "Encontro Abril 2026",
  "text": "Olá, {nome}! Você está convidado...",
  "imagePath": "uploads/convite-abril.jpg",
  "createdAt": "2026-04-18T10:00:00Z"
}
```

### Logs de Envio (`logs`)
```json
{
  "campaignId": "uuid",
  "phone": "5511999998888",
  "name": "João Silva",
  "status": "sent | failed | pending",
  "sentAt": "2026-04-18T14:32:00Z",
  "error": null
}
```

---

## Interface Web — 5 Telas

1. **Sessão** — QR Code para conectar WhatsApp, status da conexão, sessão persistida
2. **Contatos** — Importar JSON, adicionar manualmente, filtrar por tag, checkbox por contato
3. **Campanha** — Nome, texto com `{nome}`, upload de imagem, preview
4. **Disparo** — Configurar batch/delay, iniciar envio, progresso em tempo real (enviados/falhos/fila)
5. **Histórico** — Lista de campanhas com métricas, botão "Reenviar falhos"

---

## Políticas Anti-Ban (validadas pelo mercado)

| Parâmetro | Valor |
|-----------|-------|
| Delay entre mensagens | 15–60s aleatório |
| Tamanho do batch | 30 mensagens |
| Pausa entre batches | 10 minutos |
| Limite diário | 256 contatos (limite WhatsApp pessoal) |
| Horário permitido | Configurável (padrão: 8h–20h) |

**Proteções automáticas:**
- Delay sempre aleatório (nunca fixo — padrão fixo é detectado como bot)
- Pausa automática de 10min a cada 30 mensagens
- Bloqueia envio fora do horário configurado
- 3 falhas consecutivas → pausa e alerta visual na UI
- Nunca reenvia para quem já recebeu na mesma campanha
- Campo `{nome}` obrigatório no texto (personalização reduz risco de spam detection)

---

## Docker Compose — Operação

```bash
docker compose up -d      # sobe tudo (backend + frontend + MongoDB + Redis)
docker compose down       # pausa tudo (dados preservados nos volumes)
docker compose down -v    # pausa e apaga todos os dados (reset total)
```

Serviços:
- `frontend` → http://localhost:3000
- `backend` → http://localhost:3001
- `mongodb` → porta 27017 (interna)
- `redis` → porta 6379 (interna)

Dados persistidos em volumes Docker nomeados (`mongo_data`, `redis_data`).

---

## Fluxo de Uso Típico

1. `docker compose up -d`
2. Abrir http://localhost:3000
3. Escanear QR Code (apenas na primeira vez ou após logout)
4. Importar/selecionar contatos por tag
5. Criar campanha com texto e imagem
6. Configurar batch e disparar
7. Acompanhar progresso em tempo real
8. Ver histórico e reenviar falhos se necessário
9. `docker compose down` quando terminar

---

## Decisões de Design

- **whatsapp-web.js sobre Baileys**: mais estável, melhor documentação, menor risco de quebrar com atualizações do WhatsApp
- **Bull + Redis sobre fila em memória**: sobrevive a restarts, permite pausar/retomar, retry automático
- **MongoDB sobre arquivos JSON**: visibilidade, queries, retry nativo, base para evolução em produto
- **Tudo em Docker Compose**: operação simples, sem dependências globais no sistema do usuário
- **React + Vite sobre HTML vanilla**: componente de progresso em tempo real e evolução futura em produto justificam a escolha

---

## Evolução Futura (fora do escopo atual)

- Migrar para Evolution API (multi-instância, webhooks)
- Agendamento de campanhas
- Templates de mensagem salvos
- Dashboard de métricas agregadas
- Autenticação de usuário (para transformar em SaaS)
