# Agendamentos 1:1

Addon gratuito do GestãoZap para reservas de horário com página pública, operação integrada ao WhatsApp e vitrine de produtos.

## Problema

Pequenos negócios perdem tempo combinando horário no WhatsApp, esquecem compromissos e não têm link fixo para o cliente escolher data/hora sozinho.

## Para quem é

- Salões, clínicas, consultorias, serviços locais
- Qualquer tenant que já usa Conversas WhatsApp no GestãoZap

## URLs públicas

| Recurso | URL |
|---|---|
| Agendamento | `https://{slug}.gestaozap.digital/agendar` |
| Com data sugerida | `.../agendar?date=2026-06-12` |
| Com mês | `.../agendar?month=2026-06` |
| Promoção / produto | `https://{slug}.gestaozap.digital/promocao-do-dia#Promocao01` |

## Escopo gratuito (automático na criação do tenant)

- Feature `agendamentos` com `is_free: true` — ativa para todo tenant aprovado
- 1 página pública de agendamento
- Até 3 tipos de evento 1:1
- Disponibilidade recorrente, bloqueios, buffers, limite por dia
- Confirmação por e-mail (fase M3)
- Branding GestãoZap na página pública
- **Operação WhatsApp:**
  - Notificação no portal quando booking se aproxima (15/30/60 min configurável)
  - Atalho `/agendar` no chat → modal para enviar link genérico, com data ou mês
  - Atalho `#Promocao01` no chat → link da promoção/produto na vitrine

## Upgrade pago (futuro)

- Remover branding / domínio customizado
- Sync calendário externo além do Google (ex.: Outlook)
- Lembretes SMS/WhatsApp ao cliente
- Round-robin / equipe
- Pagamentos e no-show fee
- Analytics avançado

## Calendário da empresa (Google)

- **Por enquanto, apenas Google Calendar** — conexão OAuth feita pelo tenant no painel Agendamentos → Configurações
- Horários ocupados no Google são consultados via API FreeBusy e **bloqueiam slots** automaticamente
- Outlook / Microsoft 365 ficam fora do escopo inicial (roadmap futuro)
- Variáveis de servidor: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI` (callback fixo em `gestaozap.digital`)

## Regras de domínio

- Slots são **projeção runtime** — não persistidos em massa
- Horários persistidos em UTC; timezone do host em `America/Sao_Paulo` por padrão
- `ends_at` é **exclusive end** (semântica FullCalendar)
- Confirmação de booking em transação + exclusion constraint PostgreSQL anti-overlap
- FullCalendar apenas no admin (M1); página pública usa fluxo linear data → hora → form

## Operação WhatsApp (M7 — incluído no escopo inicial)

### Notificações no portal

- Cron a cada 1 min verifica bookings confirmados dentro da janela `operator_notify_before_min` (padrão 15 min)
- Emite Socket.IO `booking:upcoming` para a sala do tenant
- Componente `BookingAlerts` exibe toast + cards fixos no canto superior direito

### Comando `/agendar` no chat

1. Operador digita `/agendar` e pressiona Enter (ou clica enviar)
2. Abre modal com três modos: link geral, data sugerida (`?date=`), mês (`?month=`)
3. Mensagem editável é enviada ao cliente no WhatsApp

API: `GET /api/bookings/share-link`

### Hashtag `#Promocao01`

- Cada promoção publicada recebe `share_code` automático (ex: `Promocao01`)
- No chat, `#` abre picker de promoções ativas
- Link gerado: `promocao-do-dia#Promocao01`

API: `GET /api/promotions/share-links`

## Roadmap

| Fase | Entrega |
|---|---|
| M0 | Schema, motor slots, API pública, share-link |
| M1 | Admin FullCalendar |
| M2 | Página pública linear |
| M3 | E-mails convidado + lembretes |
| M4 | Cancel/remarcar self-service |
| M5 | Google Calendar (empresa) — Outlook futuro |
| M6 | KPIs e limites free tier |
| M7 | Operação WhatsApp completa (notificações, `/agendar`, `#`) |

Plano executável: [`docs/superpowers/plans/2026-06-08-agendamentos.md`](../superpowers/plans/2026-06-08-agendamentos.md)
