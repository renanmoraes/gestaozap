# Design: UI Polish + Opt-out Automático

**Data:** 2026-05-26  
**Projeto:** gestaozap  
**Escopo:** Queue.jsx redesign, History.jsx redesign + métricas, opt-out automático via WhatsApp

---

## 1. Queue.jsx — Redesign visual

### Contexto
A página já é funcional e usa as classes do design system (`page-header`, `page-content`, `card`, `badge-*`, `btn-*`). O problema é apresentação: o nome da campanha não aparece em destaque, a barra de progresso é pequena e a contagem de contatos não fica visível.

### Design
Cada job vira um card individual com:
- **Nome da campanha** (`job.campaignName`) como título principal (font-semibold, text-slate-900)
- **Job #ID** e timestamp de criação como subtítulo (text-xs, text-slate-400)
- **Status badge** do design system — posição: canto superior direito do card
- **Barra de progresso** (h-2, brand-600) visível apenas quando `state === 'active'`, com texto `X de Y contatos enviados` abaixo
- **Resultado** (badge de resumo com sentCount/failedCount) quando concluído/cancelado — usar `job.result` (a API serializa como `result`, não `returnvalue`; a função `resultSummary` já existe em Queue.jsx e deve receber `job.result`)
- **Botões** Cancelar (btn-danger) e Retentar (btn-secondary) no rodapé do card, alinhados à direita
- **Estado vazio** e **loading** — mantidos como estão

Sem mudança funcional. Sem novos endpoints.

---

## 2. History.jsx — Redesign + Métricas por disparo

### Contexto
A página usa Tailwind raw sem as classes do design system. A estrutura sidebar/painel está correta funcionalmente; precisa de:
1. Resestilização completa com `card`, `badge-*`, `page-header`, `page-content`
2. Painel de métricas no topo do lado direito

### Design

**Sidebar esquerda** — lista de runs estilizada com `card` e hover indigo, igual às outras páginas. Cada item mostra:
- Nome da campanha (font-medium)
- Data/hora formatada
- Badge de estado do job (badge-green/red/blue/yellow/gray)

**Painel direito — 4 metric cards no topo** (grid 4 colunas, ou 2×2 em mobile):
| Card | Valor | Cor |
|------|-------|-----|
| Enviados | `logs.filter(sent).length` | indigo |
| Falhas | `logs.filter(failed).length` | red |
| Taxa de resposta | `analysis.totals.respondedContacts / analysis.totals.sentContacts * 100`% | green |
| Sentimento positivo | `analysis.totals.positive / (positive+negative+neutral) * 100`% | amber |

- Métricas de envio (Enviados/Falhas) calculadas sempre a partir dos logs carregados (`selectedLogs`).
- **Taxa de resposta e Sentimento positivo** dependem de `analysis.totals` — exibem "—" quando `analysis` é null, igual ao sentimento. O card mostra "Buscar feedback" como dica nesse estado.
- Cards usam a classe `card` com padding interno, número grande (text-2xl font-bold) e label pequena (text-xs text-slate-500).

**Painel direito — lista de contatos** — mantida funcionalmente; resestilizada com `card`, badges de status (`badge-green` para enviado, `badge-red` para falhou, `badge-yellow` para unknown), botões Reenviar como `btn-secondary xs`.

**Painel direito — seção de feedback** — mantida funcionalmente; resestilizada com `card`, header `page-header`-like, botão "Pegar feedback" como `btn-primary`.

**Modal de erro** — mantido; apenas borda e shadow atualizados para seguir o design system.

Sem novos endpoints. Sem mudança de lógica de carregamento.

---

## 3. Opt-out automático via mensagem WhatsApp

### Contexto
Atualmente o opt-out é manual (botão na UI). Queremos detectar mensagens de saída em tempo real e marcar o contato automaticamente.

### Frases detectadas
Match case-insensitive, texto normalizado (trim + lowercase):

| Frase | Modo |
|-------|------|
| `sair do evento` | contém na mensagem |
| `sair` | mensagem exata |
| `stop` | mensagem exata |
| `remover` | mensagem exata |

"SAIR DO EVENTO" é a frase divulgada no template de campanha. As demais são fallback.

### Backend — `whatsapp.service.js`

Adicionar dentro de `initClient(io)`, após os handlers existentes (`qr`, `ready`, `disconnected`):

```js
client.on('message', async (msg) => {
  if (msg.fromMe) return;
  const text = (msg.body || '').trim().toLowerCase();
  if (!isOptOutText(text)) return;

  // Remove qualquer sufixo @c.us / @s.whatsapp.net / @lid / etc.
  const phone = msg.from.replace(/@\S+$/, '');
  const Contact = require('../models/contact.model');
  // collectPhoneKeys gera variantes normalizadas (com/sem DDI, DDD curto/longo).
  // Se o contato foi importado com um formato não coberto, o findOneAndUpdate retorna null
  // e o opt-out é silenciosamente ignorado (comportamento aceitável: não há como mapear).
  const contact = await Contact.findOneAndUpdate(
    { phone: { $in: collectPhoneKeys(phone) }, optedOut: { $ne: true } },
    { optedOut: true, optOutAt: new Date() },
    { new: true }
  );
  if (!contact) return;

  io.emit('contact:opted-out', { phone: contact.phone, name: contact.name });
  console.log(`[opt-out] ${contact.name} (${contact.phone}) saiu via mensagem`);
});
```

Função auxiliar `isOptOutText(text)` no mesmo arquivo:
```js
function isOptOutText(text) {
  if (text === 'sair' || text === 'stop' || text === 'remover') return true;
  if (text.includes('sair do evento')) return true;
  return false;
}
```

`collectPhoneKeys` já existe em `phone.util.js` — reutilizar para normalização de DDD.

### Frontend — `Contacts.jsx`

Adicionar listener do socket para `contact:opted-out`. Quando recebido:
- Exibir toast (div temporária por 4s) com a mensagem: `"📵 {nome} ({telefone}) saiu do evento"`
- Recarregar lista de contatos (`loadContacts()`) para refletir `optedOut: true`

O hook `useSocket` já existe em `hooks/useSocket.js` — usar como nas outras páginas.

---

## 4. Rebuild do container

Após todas as mudanças de frontend:
```bash
docker compose build frontend && docker compose up -d
```

---

## Ordem de implementação

1. `whatsapp.service.js` — handler de opt-out (sem rebuild necessário, só reiniciar backend)
2. `Queue.jsx` — redesign (visual only)
3. `History.jsx` — redesign + métricas
4. Rebuild do container frontend

---

## O que NÃO muda

- Lógica de carregamento do History (loadRecipients, loadCachedAnalysis, retryFailed, retryOne)
- Endpoints de API
- Modelos de dados (Contact já tem `optedOut` e `optOutAt` do sprint anterior)
- Estrutura de navegação (App.jsx)
