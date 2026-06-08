# GestãoZap — Design System

A brand & UI system for **GestãoZap**, a Brazilian SaaS that lets companies and
entrepreneurs run **WhatsApp communication at scale** from their own WhatsApp
account (paired via QR code). It bundles anti‑ban protected mass sending, an
LGPD‑aware contact CRM, live chat, message templates, per‑plan billing, a
multi‑tenant admin panel, and an affiliate program.

> Stack of record: Docker (Express + React + PostgreSQL + Redis +
> `whatsapp-web.js`), deployed to a VPS behind an Nginx wildcard. It grew from a
> local MongoDB tool into the PostgreSQL **v2.0** platform with Asaas monetisation.

This folder is the single source of truth for designing **on‑brand** GestãoZap
surfaces — colors, type, spacing, components and full‑screen UI kits — so any
agent or designer can produce work that looks native to the product.

---

## Sources

Everything here was reverse‑engineered from the real product. If you have access,
explore these to go deeper:

- **GitHub:** `renanmoraes/gestaozap` — https://github.com/renanmoraes/gestaozap
  (monorepo: `frontend/` React app, `backend/` Express API, `docs/`, `infra/`).
  The frontend Tailwind theme (`frontend/tailwind.config.js`) and component layer
  (`frontend/src/index.css`) are the canonical token source.
- **Codebase:** the attached `frontend/` React + Vite + Tailwind app — the tenant
  app, admin panel, live chat and billing screens were all read from here.

Browse the repo further to recreate screens with higher fidelity than this kit
captures.

---

## Products / surfaces

GestãoZap is one web app that serves three distinct audiences:

1. **Tenant app** (`app.{tenant}.gestaozap.digital`) — the customer workspace.
   WhatsApp session/QR, live Conversas (chat inbox), Contatos (CRM), Mensagens
   rápidas, Templates, Disparo (bulk send), Fila, Histórico, Backup, Financeiro.
   Dark slate sidebar + emerald logo; indigo primary actions.
2. **Admin panel** (`admin.gestaozap.digital`) — internal multi‑tenant control.
   Clientes (tenants), Afiliados, Armazenamento, Configurações. Same shell with a
   `ShieldCheck` indigo mark instead of the emerald bolt.
3. **Public register** (`/registrar`) — affiliate‑link signup + magic‑link login.
   Centered card on a slate‑50 page.

---

## CONTENT FUNDAMENTALS

**Language: Brazilian Portuguese (pt‑BR), always.** Every label, button, toast and
empty state is in Portuguese. Currency is `R$` with `,` decimals
(`R$ 1.299,00`); dates are `dd/mm/aaaa`; phones carry the country/DDD prefix
(`5511999999999`).

**Voice — direct, second person, professional but warm.** The product addresses
the user as **você** implicitly through imperative verbs rather than spelling out
the pronoun: *"Selecione template e contatos para disparar"*, *"Escaneie com o
WhatsApp no celular"*, *"Inicie a sessão"*. Copy is action‑first and concise.

**Casing.** Sentence case everywhere — page titles, buttons, labels. No Title Case,
no ALL‑CAPS except tiny tracked eyebrows/section labels (`PLANO`, `ESTE MÊS`) which
are uppercased via CSS, not typed in caps.

**Tone characteristics**
- *Reassuring about safety.* The anti‑ban story is ever‑present: warnings about
  send hours (*"Fora da janela de horário (8h–20h)"*), batch pauses
  (*"Pausa entre lotes após N envios (10 min)"*), opt‑out notices.
- *Compliance‑aware (LGPD).* Opt‑out is first‑class: *"optaram por não receber
  (pulados)"*, an `opt-out` badge, internal notes marked *"Nota interna · só você
  vê"*.
- *Plain, not playful.* Microcopy is functional. Loading states say *"Enviando…",
  "Verificando link…", "Iniciando…"* (note the ellipsis character `…`).
- *Honest empty states.* *"Nenhum template.", "Sem mensagens ainda.", "Nenhum
  registro de pagamento encontrado."* — then a clear next action link.

**Numbers & units.** Counts are localised (`toLocaleString('pt-BR')`),
plans are `Starter / Pro / Business`, usage reads *"1.250 enviadas · 5.000
incluídas"*. Lifetime plans show *"Vitalício"*.

**Emoji.** Essentially none in the UI. One playful exception appears in billing for
a lifetime plan (`♾️ Vitalício`). Treat emoji as *not* part of the system — prefer
Lucide icons. Don't introduce decorative emoji.

**Example strings to match register**
- Button: `Disparar para 42 contato(s)`
- Toast: `12 já receberam este template (pulados) · 3 optaram por não receber`
- Header subtitle: `Plano, consumo e histórico de cobrança`
- Status: `Conectado` / `Desconectado` / `Aguardando QR`

---

## VISUAL FOUNDATIONS

**Overall vibe.** A clean, dense, modern SaaS admin. Light slate canvas, white
cards, a **dark slate navigation rail**, **indigo** for primary actions and an
**emerald/WhatsApp** accent that ties the product to its channel. Calm and
trustworthy — nothing flashy.

**Color**
- **Primary — indigo (`--brand-600 #4f46e5`).** Primary buttons, active nav pill,
  links, progress bars, selected chips, chart bars. Hover deepens to
  `--brand-700`.
- **Accent — emerald (`--emerald-500 #10b981`).** The logo mark, "connected"
  status, outgoing chat bubbles, success. This is the WhatsApp signal color.
- **Neutrals — slate ramp.** Page `slate-50`, cards white, borders `slate-200`,
  dividers `slate-100`, body `slate-700`, muted `slate-500`, subtle `slate-400`,
  headings/sidebar `slate-900`.
- **Semantic.** Red (danger/failed), amber (warning, send‑hour alerts, internal
  notes), blue (info), green/emerald (success). Always used as a *50 fill + 200
  border + 600/700 text* trio for soft status surfaces.
- **WhatsApp canvas.** The send preview reproduces WhatsApp's `#e5ddd5` backdrop
  and `#dcf8c6` sent bubble — reserved strictly for message previews.

**Type.** **Inter** only (300–700). Compact scale: page titles are just **18px /
semibold**, body **14px**, metadata **12px**, micro‑labels **10px**. Stat figures
go 20–24px. Headings are `slate-900` semibold, never huge. Eyebrows are 12px
medium, uppercased, `tracking‑wide`, in `slate-500`.

**Spacing & layout.** 4px base grid. Page content is padded `24px` (`page-content`
= `p-6 space-y-6`). The page header is a 65px white bar with bottom border holding
an 18px title + 14px subtitle on the left and actions/status on the right. Forms
and billing cap at `max-w-4xl` (896px). Sidebar is 224px expanded / 64px collapsed,
animating width over 200ms.

**Cards.** White, **`12px` radius (rounded‑xl)**, `1px slate-200` border, **soft
`shadow-sm`**. Inner padding 20–24px. No heavy elevation; depth is communicated by
border + faint shadow, not big drop shadows.

**Buttons.** `8px` radius, `14px` medium text, icon + label with `8px` gap.
*Primary* = solid indigo, white text, darken on hover. *Secondary* = white, slate
border, `slate-700` text, `slate-50` hover. *Danger* = `red-50` fill / `red-200`
border / `red-600` text. Disabled drops to 50% opacity. No press‑shrink; state is
purely color.

**Inputs.** Full‑width, `8px` radius, `slate-300` border, 14px text,
`slate-400` placeholder. Focus shows a **2px brand ring** (`focus:ring-2
ring-brand-500`) with transparent border. Labels are 12px medium `slate-700`.

**Badges / pills.** Fully rounded, 12px medium, `gap-1.5`, optional leading dot.
Five status flavors (green/red/yellow/blue/gray) each a 50/200/700 trio. Filter
chips toggle between outlined (idle) and solid indigo (active).

**Avatars.** Circular. When no photo: initials on a **deterministic two‑stop
gradient** chosen from the name (brand/emerald/amber/rose/sky/violet/teal 400→600).
This is the *only* place gradients appear — do not add gradient backgrounds
elsewhere.

**Borders, radius, shadow systems.** Radius ladder: 4 (dots/tiles) → 8
(buttons/inputs/alerts) → 12 (cards) → 16 (bubbles) → full (pills/avatars).
Shadows are subtle and slate‑tinted (`shadow-sm` on cards, `shadow-bubble` on chat
bubbles). Borders do the heavy lifting.

**Motion.** Restrained. `transition-colors` on interactive elements, the 200ms
sidebar width collapse, and spinners (`border-t-transparent rounded-full
animate-spin`) for loading. Progress bars animate width. No bounces, parallax, or
decorative looping animation. A single `animate-pulse` on the "starting" status
dot.

**Active / hover / press states**
- *Nav (dark rail):* idle `slate-400` text → hover `white` + `slate-800` bg →
  active solid `brand-600` pill, white text.
- *Conversation list:* active = `brand-50` bg + `2px brand-600` left rail; hover =
  `slate-50`.
- *Rows/list items:* hover `slate-50`.
- *Press:* no transform — color only.

**Backgrounds.** Flat slate‑50. No hero imagery, no textures, no full‑bleed
photography, no patterns. The only "imagery" is user avatars/media and the
WhatsApp preview canvas. Keep surfaces clean and content‑forward.

**Transparency / blur.** Used sparingly — translucent overlays for modals
(slate scrim), `/60` tints inside chat media tiles. No glassmorphism.

---

## ICONOGRAPHY

- **System: [Lucide](https://lucide.dev) (`lucide-react`).** This is *the* icon
  set — outline, `1.5px` stroke, rounded joins, drawn on a 24px grid and rendered
  at **16px (`w-4 h-4`)** in dense UI, 20px for emphasis. Color follows context:
  `slate-400` for decorative/inline, `slate-600` for actionable, `brand-600` or
  status hues when meaningful.
- **In this kit:** load Lucide from CDN — `<script src="https://unpkg.com/lucide@latest"></script>`
  then `lucide.createIcons()`, or copy individual SVGs. Match stroke width 1.5 and
  16px size. **Do not** hand‑roll icons or swap in a different family.
- **Representative glyphs by area:** `Smartphone/Zap` (WhatsApp session),
  `MessageCircle` (Conversas), `Users` (Contatos), `FileText` (Templates), `Send`
  (Disparo), `Clock` (Fila), `BarChart2` (Histórico), `Database` (Backup),
  `CreditCard` (Financeiro), `ShieldCheck` (admin), `Building2` (Clientes),
  `UserCheck` (Afiliados), `Cloud` (Armazenamento), `Settings`, `LogOut`,
  `QrCode`, `Wifi/WifiOff`, `Check/CheckCheck` (message receipts).
- **Logo mark:** a **lightning bolt** in a rounded emerald square (the brand
  "Zap"). The admin surface swaps it for a `ShieldCheck` in an indigo square.
  Files in `assets/`: `mark.svg`, `mark-admin.svg`, `logo-light.svg`,
  `logo-dark.svg`, plus the shipped `favicon.svg` / `favicon-dark.svg` /
  `app-icon.svg`.
- **Emoji / unicode as icons:** avoid. The one in‑product exception is `♾️` next to
  "Vitalício" in billing. Otherwise everything is Lucide.

---

## Index / manifest

Root files:
- `styles.css` — global entry (import‑only). Link this.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css`.
- `assets/` — `mark.svg`, `mark-admin.svg`, `logo-light.svg`, `logo-dark.svg`,
  `favicon.svg`, `favicon-dark.svg`, `app-icon.svg`.
- `components/` — reusable React primitives (see below).
- `ui_kits/tenant-app/` — full‑screen recreations of the customer workspace.
- `guidelines/` — foundation specimen cards (Design System tab).
- `SKILL.md` — Agent Skill entry point.

Components (under `components/`): Button, IconButton, Input, Select, Badge,
StatusDot, Card, StatCard, Avatar, NavItem, Toast, ProgressBar, FilterChip,
MessageBubble, PageHeader.

UI kits: `tenant-app` (WhatsApp session/QR, Conversas live chat, Disparo, Financeiro).

See each component's `*.prompt.md` for usage and the Design System tab for live
specimen cards.
