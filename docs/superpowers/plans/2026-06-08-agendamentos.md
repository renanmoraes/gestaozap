# Agendamentos — Plano de implementação

**Goal:** Reservas 1:1 gratuitas para todos os tenants, com operação WhatsApp integrada.

**Architecture:** Express + Drizzle/Postgres; slots server-side; Socket.IO para alertas; comandos `/` e `#` no chat.

---

## M0 — Backend core

- [ ] Migration: `booking_pages`, `event_types`, `availability_rules`, `availability_exceptions`, `manual_blocks`, `bookings`
- [ ] `btree_gist` exclusion constraint anti-overlap
- [ ] `promotions.share_code` + índice único por tenant
- [ ] Seed feature `agendamentos` (`is_free: true`)
- [ ] `booking-bootstrap.service.js` — hook signup + backfill
- [ ] `booking-time.util.js` + testes
- [ ] `booking-availability.service.js` + testes
- [ ] `public-bookings.routes.js` — page, availability, POST booking
- [ ] `bookings.routes.js` — list, event-types, share-link
- [ ] Registrar rotas em `app.js`

## M1 — Admin FullCalendar

- [ ] Instalar `@fullcalendar/react` + plugins
- [ ] Página `/bookings` com timeGridWeek / dayGridMonth / listWeek
- [ ] CRUD tipos, bloqueios, disponibilidade

## M2 — Página pública

- [ ] Rota `/agendar` — fluxo data → hora → formulário → confirmação
- [ ] Query params `date`, `month`, `tipo`

## M3 — E-mails

- [ ] Confirmação, cancelamento, 2 lembretes (Bull/cron)

## M4 — Self-service

- [ ] Token público cancel/remarcar

## M5 — Google Calendar

- [ ] OAuth + busy windows

## M6 — Métricas

- [ ] KPIs básicos + guardrails (3 tipos, 1 página)

## M7 — Operação WhatsApp (paralelo a M2+)

- [ ] `booking_pages.operator_notify_before_min` (default 15)
- [ ] `bookings.operator_notified_at`
- [ ] Cron `bookingUpcoming.js` + emit `booking:upcoming`
- [ ] Frontend: `BookingAlerts` no layout + listener socket
- [ ] `BookingLinkModal` — `/agendar` no chat
- [ ] `ProductHashtagPicker` — `#` no chat
- [ ] `GET /api/promotions/share-links`
- [ ] Auto `share_code` ao criar promoção
- [ ] Vitrine pública: scroll/highlight via hash `#Codigo`

---

## Verificação M0

```bash
cd backend && npm run db:migrate && npm test
curl /api/public/bookings/page
curl /api/bookings/share-link?date=2026-06-12
curl /api/promotions/share-links
```
