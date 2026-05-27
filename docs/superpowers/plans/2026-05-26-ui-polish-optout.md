# UI Polish + Opt-out Automático — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Queue.jsx e History.jsx com o design system existente, adicionar métricas por disparo no Histórico, e implementar opt-out automático via mensagem WhatsApp com toast no frontend.

**Architecture:** Backend recebe eventos de mensagem do whatsapp-web.js, detecta frases de opt-out e atualiza o Contact via MongoDB. Socket.IO emite `contact:opted-out` ao frontend, que reage com toast e reload. As páginas Queue e History são puramente visuais — zero mudança de lógica ou endpoints.

**Tech Stack:** Node.js + whatsapp-web.js + MongoDB/Mongoose + Socket.IO (backend); React + Tailwind + design system local (`card`, `badge-*`, `btn-*`, `page-header`, `page-content`) + Lucide icons (frontend); Jest (testes)

---

## Mapa de arquivos

| Arquivo | Operação | O que muda |
|---------|----------|------------|
| `backend/src/services/whatsapp.service.js` | Modificar | Adicionar `isOptOutText` (exportado) + handler `client.on('message')` |
| `backend/src/__tests__/whatsapp.service.test.js` | Modificar | Testes unitários para `isOptOutText` |
| `frontend/src/pages/Contacts.jsx` | Modificar | Listener `contact:opted-out` + toast state |
| `frontend/src/pages/Queue.jsx` | Modificar | Redesign visual dos job cards |
| `frontend/src/pages/History.jsx` | Modificar | Redesign completo + 4 metric cards |

---

## Task 1: `isOptOutText` — helper com testes

**Files:**
- Modify: `backend/src/services/whatsapp.service.js`
- Modify: `backend/src/__tests__/whatsapp.service.test.js`

- [ ] **Step 1.1: Adicionar testes para `isOptOutText` (falharão até implementar)**

Abrir `backend/src/__tests__/whatsapp.service.test.js` e adicionar ao final (antes de fechar o arquivo):

```js
describe('isOptOutText', () => {
  const { isOptOutText } = require('../services/whatsapp.service');

  it('detecta "sair do evento" em qualquer posição', () => {
    expect(isOptOutText('sair do evento')).toBe(true);
    expect(isOptOutText('por favor sair do evento obrigado')).toBe(true);
    expect(isOptOutText('SAIR DO EVENTO')).toBe(true);
  });

  it('detecta "sair" exato', () => {
    expect(isOptOutText('sair')).toBe(true);
    expect(isOptOutText('SAIR')).toBe(true);
  });

  it('detecta "stop" exato', () => {
    expect(isOptOutText('stop')).toBe(true);
    expect(isOptOutText('STOP')).toBe(true);
  });

  it('detecta "remover" exato', () => {
    expect(isOptOutText('remover')).toBe(true);
    expect(isOptOutText('REMOVER')).toBe(true);
  });

  it('não detecta "sair" embutido em outras palavras', () => {
    expect(isOptOutText('sairei amanhã')).toBe(false);
    expect(isOptOutText('não quero sair agora')).toBe(false);
  });

  it('não detecta mensagens normais', () => {
    expect(isOptOutText('tudo bem, obrigado!')).toBe(false);
    expect(isOptOutText('confirmo presença')).toBe(false);
    expect(isOptOutText('')).toBe(false);
  });
});
```

- [ ] **Step 1.2: Rodar testes para confirmar falha**

```bash
cd backend && npm test -- --testPathPattern=whatsapp.service --no-coverage 2>&1 | grep -E "PASS|FAIL|isOptOut"
```

Esperado: `isOptOutText` não encontrado / testes falhando.

- [ ] **Step 1.3: Implementar `isOptOutText` em `whatsapp.service.js`**

Localizar a seção `/* EXPORTS */` no final do arquivo. Antes dela, adicionar:

```js
/* =========================================================
 * OPT-OUT DETECTION
 * ======================================================= */

function isOptOutText(raw) {
  const text = (raw || '').trim().toLowerCase();
  if (text === 'sair' || text === 'stop' || text === 'remover') return true;
  if (text.includes('sair do evento')) return true;
  return false;
}
```

E adicionar `isOptOutText` no `module.exports`:

```js
module.exports = {
  // ... existentes ...
  isOptOutText,
};
```

- [ ] **Step 1.4: Rodar testes para confirmar aprovação**

```bash
cd backend && npm test -- --testPathPattern=whatsapp.service --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"
```

Esperado: `PASS src/__tests__/whatsapp.service.test.js`

- [ ] **Step 1.5: Commit**

```bash
git add backend/src/services/whatsapp.service.js backend/src/__tests__/whatsapp.service.test.js
git commit -m "feat: add isOptOutText helper with unit tests"
```

---

## Task 2: Handler de opt-out no WhatsApp service

**Files:**
- Modify: `backend/src/services/whatsapp.service.js`

- [ ] **Step 2.1: Adicionar handler `client.on('message')` em `initClient(io)`**

Localizar no arquivo a linha com `client.on('disconnected', ...)` e seu bloco de fechamento `});`. Após esse bloco, adicionar:

```js
  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const text = (msg.body || '').trim().toLowerCase();
    if (!isOptOutText(text)) return;

    // Remove qualquer sufixo @c.us / @s.whatsapp.net / @lid / etc.
    const phone = msg.from.replace(/@\S+$/, '');
    const Contact = require('../models/contact.model');
    // collectPhoneKeys gera variantes normalizadas. Se o contato foi importado
    // com formato não coberto, findOneAndUpdate retorna null (ignorado silenciosamente).
    const contact = await Contact.findOneAndUpdate(
      { phone: { $in: collectPhoneKeys(phone) }, optedOut: { $ne: true } },
      { optedOut: true, optOutAt: new Date() },
      { new: true },
    ).catch((e) => { console.error('[opt-out] db error:', e.message); return null; });

    if (!contact) return;

    io.emit('contact:opted-out', { phone: contact.phone, name: contact.name });
    console.log(`[opt-out] ${contact.name} (${contact.phone}) saiu via mensagem`);
  });
```

**Atenção:** este bloco deve estar **dentro** de `initClient(io)`, após os handlers `qr`/`ready`/`disconnected` e antes de `client.initialize()`.

- [ ] **Step 2.2: Verificar que `collectPhoneKeys` já está importado no topo do arquivo**

```bash
grep "collectPhoneKeys" backend/src/services/whatsapp.service.js | head -3
```

Esperado: linha de `require('../utils/phone.util')` com `collectPhoneKeys` já desestruturado. Se não estiver, adicionar ao import existente.

- [ ] **Step 2.3: Rodar todos os testes do backend**

```bash
cd backend && npm test -- --no-coverage 2>&1 | tail -6
```

Esperado: `Tests: N passed` sem novos falhos.

- [ ] **Step 2.4: Commit**

```bash
git add backend/src/services/whatsapp.service.js
git commit -m "feat: auto opt-out on WhatsApp message (SAIR DO EVENTO and variants)"
```

---

## Task 3: Toast de opt-out em Contacts.jsx

**Files:**
- Modify: `frontend/src/pages/Contacts.jsx`

- [ ] **Step 3.1: Adicionar import do `useSocket` e estado do toast**

No topo de `Contacts.jsx`, adicionar:

```js
import { useSocket } from '../hooks/useSocket';
```

Dentro do componente `Contacts`, após os `useState` existentes, adicionar:

```js
const [optOutToast, setOptOutToast] = useState(null);
```

- [ ] **Step 3.2: Adicionar listener do socket**

Após o bloco de `useEffect` existente, adicionar:

```js
useSocket({
  'contact:opted-out': ({ name, phone }) => {
    setOptOutToast({ name, phone });
    load();
    setTimeout(() => setOptOutToast(null), 4000);
  },
});
```

- [ ] **Step 3.3: Adicionar o toast no JSX**

No return do componente, antes do `<div>` raiz principal (ou como último filho dentro dele), adicionar:

```jsx
{optOutToast && (
  <div className="fixed bottom-4 right-4 z-50 card px-4 py-3 flex items-center gap-3 shadow-lg border-l-4 border-l-amber-500">
    <span className="text-lg">📵</span>
    <div>
      <p className="text-sm font-medium text-slate-900">{optOutToast.name} saiu do evento</p>
      <p className="text-xs text-slate-500">{optOutToast.phone}</p>
    </div>
  </div>
)}
```

- [ ] **Step 3.4: Commit**

```bash
git add frontend/src/pages/Contacts.jsx
git commit -m "feat: show toast when contact opts out via WhatsApp message"
```

---

## Task 4: Queue.jsx — redesign visual

**Files:**
- Modify: `frontend/src/pages/Queue.jsx`

- [ ] **Step 4.1: Corrigir `resultSummary` para usar `job.result`**

Localizar a linha onde `resultSummary` é chamado no render (atualmente `resultSummary(job.returnvalue)`).
Alterar para:

```jsx
const res = resultSummary(job.result);
```

- [ ] **Step 4.2: Substituir o card de cada job pelo novo layout**

Localizar o bloco `{jobs.map((job) => { ... })}` dentro de `<div className="card overflow-hidden">`.

Substituir o conteúdo interno de cada item (`<div key={job.id} className="px-5 py-4 ...">`) por:

```jsx
<div key={job.id} className="p-5 flex flex-col gap-3">
  {/* Topo: nome da campanha + status badge */}
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-900 truncate">
        {job.campaignName || `Job #${job.id}`}
      </p>
      <p className="text-xs text-slate-400 mt-0.5">
        Job #{job.id} · {fmtTs(job.timestamp)}
      </p>
    </div>
    <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
      <StatusBadge state={job.state} />
      {res && <span className={`badge-${res.color}`}>{res.text}</span>}
    </div>
  </div>

  {/* Progresso — só quando active */}
  {job.state === 'active' && job.progress != null && (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-100 rounded-full h-2">
          <div
            className="bg-brand-600 h-2 rounded-full transition-all"
            style={{ width: `${job.progress}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-brand-700 w-9 text-right shrink-0">
          {job.progress}%
        </span>
      </div>
      {job.contactsTotal > 0 && (
        <p className="text-xs text-slate-400">
          {Math.round((job.progress / 100) * job.contactsTotal)} de {job.contactsTotal} contatos enviados
        </p>
      )}
    </div>
  )}

  {/* Rodapé: ações */}
  {(job.state === 'active' || job.state === 'waiting' || job.state === 'failed') && (
    <div className="flex gap-2 justify-end">
      {(job.state === 'active' || job.state === 'waiting') && (
        <button
          onClick={() => cancel(job.id)}
          disabled={acting === job.id}
          className="btn-danger py-1.5 px-3 text-xs"
        >
          {acting === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
          Cancelar
        </button>
      )}
      {job.state === 'failed' && (
        <button
          onClick={() => retry(job.id)}
          disabled={acting === job.id}
          className="btn-secondary py-1.5 px-3 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />Retentar
        </button>
      )}
    </div>
  )}
</div>
```

Remover o wrapper externo `<div className="divide-y ...">` se necessário e usar `divide-y divide-slate-100` no container pai.

- [ ] **Step 4.3: Commit**

```bash
git add frontend/src/pages/Queue.jsx
git commit -m "feat: redesign Queue page with campaign name and larger progress bar"
```

---

## Task 5: History.jsx — redesign + 4 metric cards

**Files:**
- Modify: `frontend/src/pages/History.jsx`

Esta task mantém **toda a lógica** intacta. Apenas estilização e adição dos metric cards.

- [ ] **Step 5.1: Substituir o wrapper raiz e o page header**

Localizar o `return (` e o div `className="space-y-4"`. Substituir por:

```jsx
return (
  <>
    <div className="page-header">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Histórico</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Selecione um disparo para ver contatos e feedback.
        </p>
      </div>
      <button type="button" onClick={() => loadHistoryIndex()} className="btn-secondary">
        <RefreshCw className="w-4 h-4" />Atualizar
      </button>
    </div>

    <div className="page-content">
      {/* conteúdo existente virá aqui */}
    </div>
  </>
);
```

Adicionar `RefreshCw` ao import do lucide-react no topo (já pode existir — verificar).

- [ ] **Step 5.2: Estilizar a sidebar esquerda**

Localizar o bloco `<aside className="border rounded-lg ...">` e substituir por:

```jsx
<aside className="card overflow-hidden">
  <div className="px-4 py-3 border-b border-slate-100">
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Disparos</p>
  </div>
  <div className="max-h-[76vh] overflow-y-auto divide-y divide-slate-100">
    {loading && (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando...
      </div>
    )}
    {!loading && sidebarItems.length === 0 && (
      <p className="p-4 text-sm text-slate-400">Nenhum envio registrado.</p>
    )}
    {sidebarItems.map((item) => {
      const j = item.job;
      const campaignId = normalizeCampaignId(j.campaignId);
      const runId = String(j.id);
      const active = selectedRun && matchesSelection(selectedRun, campaignId, runId);
      const stateMap = {
        completed: 'badge-green', active: 'badge-blue',
        waiting: 'badge-yellow', failed: 'badge-red', delayed: 'badge-gray',
      };
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => setSelectedRun({ campaignId, runId })}
          className={`w-full text-left px-4 py-3 transition-colors ${
            active ? 'bg-brand-50 border-r-2 border-r-brand-600' : 'hover:bg-slate-50'
          }`}
        >
          <p className="text-sm font-medium text-slate-900 truncate">
            {j.campaignName || '—'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{fmtDateTime(j.createdAt)}</p>
          <div className="mt-1">
            <span className={stateMap[j.state] || 'badge-gray'}>
              {j.stateLabel || j.state}
            </span>
          </div>
        </button>
      );
    })}
  </div>
</aside>
```

Adicionar `Loader2` ao import do lucide-react se não existir.

- [ ] **Step 5.3: Adicionar os 4 metric cards no painel direito**

Localizar o bloco `{selectedRun && ( <> ... )}` no painel direito. Como **primeiro filho** desse fragmento, antes do card de destinatários, adicionar:

```jsx
{/* 4 metric cards */}
{(() => {
  const sentCount = selectedLogs.filter((l) => l.status === 'sent').length;
  const failCount = selectedLogs.filter((l) => l.status === 'failed').length;
  const respRate = analysis?.totals?.sentContacts > 0
    ? Math.round((analysis.totals.respondedContacts / analysis.totals.sentContacts) * 100)
    : null;
  const total = analysis ? (analysis.totals.positive + analysis.totals.negative + analysis.totals.neutral) : 0;
  const posRate = total > 0
    ? Math.round((analysis.totals.positive / total) * 100)
    : null;

  const metrics = [
    { label: 'Enviados', value: sentCount, color: 'text-brand-700', bg: 'bg-brand-50 border-brand-200' },
    { label: 'Falhas', value: failCount, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
    { label: 'Taxa de resposta', value: respRate != null ? `${respRate}%` : '—', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', hint: respRate == null ? 'Buscar feedback' : null },
    { label: 'Sentimento +', value: posRate != null ? `${posRate}%` : '—', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', hint: posRate == null ? 'Buscar feedback' : null },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div key={m.label} className={`card border ${m.bg} px-4 py-3`}>
          <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
          {m.hint && <p className="text-xs text-slate-400 mt-1 italic">{m.hint}</p>}
        </div>
      ))}
    </div>
  );
})()}
```

- [ ] **Step 5.4: Estilizar o card de destinatários**

Localizar o bloco `<div className="border rounded-lg bg-white shadow-sm overflow-hidden">` (o card de destinatários). Substituir o wrapper e o header por:

```jsx
<div className="card overflow-hidden">
  <div className="page-header py-3">
    <div>
      <p className="text-sm font-semibold text-slate-900">
        {detailTitle} · Job {detailJobLabel}
      </p>
      <p className="text-xs text-slate-400 mt-0.5">
        {fmtDateTime(detailWhen)} · {detailContactsCount} contato(s)
      </p>
    </div>
  </div>
  {/* lista de contatos — mesma lógica de antes */}
```

Substituir as classes inline de status dos contatos por badges do design system:

- `text-green-700` → usar `<span className="badge-green">Enviado</span>`
- `text-red-600` → `<span className="badge-red">Falhou</span>`
- `text-amber-700` → `<span className="badge-yellow">Sem registro</span>`
- `text-gray-400` → `<span className="badge-gray">Pendente</span>`

Substituir o botão "Reenviar todas as falhas":

```jsx
<button type="button" onClick={...} className="btn-secondary py-1.5 px-3 text-xs">
  Reenviar todas as falhas ({failedLogs.length})
</button>
```

- [ ] **Step 5.5: Estilizar a seção de feedback**

Localizar `<div className="border rounded-lg bg-white shadow-sm ...">` da seção de feedback. Substituir wrapper e header por:

```jsx
<div className="card overflow-hidden">
  <div className="page-header py-3">
    <div>
      <p className="text-sm font-semibold text-slate-900">Feedback dos destinatários</p>
      {analysis?.snapshotAt && (
        <p className="text-xs text-slate-400 mt-0.5">
          Snapshot em {fmtDateTime(analysis.snapshotAt)}
        </p>
      )}
    </div>
    <button
      type="button"
      onClick={() => getFeedback(selectedRun.campaignId, selectedRun.runId)}
      disabled={analyzingKey === selectedKey}
      className="btn-primary"
    >
      {analyzingKey === selectedKey ? 'Analisando...' : analysis ? 'Atualizar' : 'Pegar feedback'}
    </button>
  </div>
  {/* conteúdo existente da análise — sem mudanças */}
```

- [ ] **Step 5.6: Estilizar o modal de erro**

Localizar `<div ... className="fixed inset-0 z-50 ...">`. Substituir o container interno por:

```jsx
<div
  className="card shadow-xl max-w-lg w-full p-4"
  onClick={(e) => e.stopPropagation()}
>
```

- [ ] **Step 5.7: Commit**

```bash
git add frontend/src/pages/History.jsx
git commit -m "feat: redesign History page with metric cards and design system"
```

---

## Task 6: Rebuild do container frontend

- [ ] **Step 6.1: Rebuild e restart**

```bash
docker compose build frontend && docker compose up -d
```

Aguardar build finalizar (~1-2 min). Abrir `http://localhost:3002` (ou a porta configurada).

- [ ] **Step 6.2: Smoke test manual**

Verificar em cada página:
- **Queue** (`/queue`): cards com nome de campanha visível, barra de progresso larga
- **History** (`/history`): 4 metric cards no topo, sidebar com badges coloridos, botão "Pegar feedback" indigo
- **Contacts** (`/contacts`): não há quebra visual; toast aparece quando socket emite `contact:opted-out`

- [ ] **Step 6.3: Commit final**

```bash
git add .
git commit -m "chore: rebuild frontend container with UI polish and opt-out changes"
```

---

## Referência rápida de testes

```bash
# Todos os testes do backend
cd backend && npm test -- --no-coverage

# Só os testes de whatsapp.service
cd backend && npm test -- --testPathPattern=whatsapp.service --no-coverage
```
