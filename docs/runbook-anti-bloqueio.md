# Runbook operacional — Anti-bloqueio GestãoZap

Guia prático para o time de operações lidar com riscos de bloqueio de número WhatsApp
em clientes (tenants) que usam a plataforma.

Última atualização: 2026-06.

---

## 0. Princípios

1. **A plataforma usa `whatsapp-web.js` — não-oficial.** O risco de banimento existe e
   é estrutural. O objetivo do time não é "zerar risco", e sim **minimizar sinais de
   abuso** e **reagir rápido** quando algo dá errado.
2. **A decisão correta na dúvida é pausar.** Custa muito menos pausar 1h um cliente e
   reabrir do que perder o número dele.
3. **A causa raiz importa mais do que a recuperação.** Migrar o problema para outro
   número não resolve nada se a causa continuar.

---

## 1. Sinais que você deve monitorar

### No painel admin

- **Anti-bloqueio** (aba WhatsApp do cliente): taxa de erro vs limite (2%)
- **DLQ**: contagem por motivo (`not_on_whatsapp`, `policy_violation`, `max_retries`, etc.)
- **Incidentes**: severidade `warning` ou `critical`
- **Sessão WhatsApp**: status, dispositivo conectado, último visto

### Via Socket.IO em tempo real

- `incident` (no tenant) e `admin:incident` (broadcast admin)
- `session:disconnected`, `session:auth_failure`, `session:wrong_phone`
- `send:alert` (mensagens de alerta do processor)

### Via métricas Prometheus

Configure scrape em `GET /api/admin/metrics` (basic auth com admin token).

Métricas mais importantes:

| Métrica | Tipo | Quando ela ajuda |
|---|---|---|
| `gestaozap_send_attempts_total{outcome}` | counter | Distribuição entre sent/dlq/retry/skipped |
| `gestaozap_send_ack_total{ack}` | counter | ACK_ERROR alto → problema |
| `gestaozap_dlq_messages_total{reason}` | counter | Por que está falhando |
| `gestaozap_dedupe_hits_total{kind}` | counter | Cresceu de repente → bug upstream |
| `gestaozap_client_disconnected_total` | counter | Sessão caindo muito |
| `gestaozap_client_auth_failure_total` | counter | Crítico — sempre alerta |
| `gestaozap_incidents_total{kind,severity}` | counter | Volume e categoria de eventos |
| `gestaozap_send_logs_last_24h{status}` | gauge | Foto agregada de saúde |

### Regras de alerta sugeridas (PromQL)

```promql
# ACK_ERROR > 2% em 10min
sum(rate(gestaozap_send_ack_total{ack="ACK_ERROR"}[10m]))
/ clamp_min(sum(rate(gestaozap_send_attempts_total[10m])), 1) > 0.02

# Auth failure: sempre crítico
increase(gestaozap_client_auth_failure_total[5m]) >= 1

# Dedupe spike (provável bug ou clique duplo upstream)
increase(gestaozap_dedupe_hits_total[15m]) > 100

# DLQ crescendo demais em 1h
increase(gestaozap_dlq_messages_total[1h]) > 50

# Sessão caindo
increase(gestaozap_client_disconnected_total[10m]) >= 3
```

---

## 2. Kill switch — quando e como usar

### Quando acionar

- Cliente reportou cobrança/marketing duplicado (provável bug upstream)
- Quality gate disparou e ainda não foi diagnosticado
- Suspeita de lista comprada / sem opt-in
- Conteúdo de campanha enganoso, surpresa ou regulado
- Cliente reportou recebimento de notificação de violação de política WhatsApp
- Pico abrupto de respostas negativas / reports

### Como acionar

**Admin UI:** Cliente → aba WhatsApp → botão vermelho **"Travar envios"** com motivo (livre).

**Via API:**
```bash
curl -X POST https://admin.gestaozap.digital/api/admin/tenants/$TENANT_ID/kill-switch \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"action":"on","reason":"investigando_pico_de_dlq","ttlSec":86400}'
```

### Efeito

- Bull processor aborta job na hora seguinte com `killed: true`
- Flag fica em Redis com TTL — expira sozinha se não for liberada manualmente
- Cliente vê banner / mensagens param

### Como liberar

UI: mesmo botão (agora verde "Liberar envios"). API: `action: 'off'`.

---

## 3. Playbook: cliente reportou conta restrita/banida

1. **Pause imediatamente** (kill switch, reason = `account_restricted`).
2. **Não migre lote para outro número** sem entender a causa.
3. Anote no painel **Incidentes** com severidade `critical`:
   ```bash
   # Ou registrar manualmente via SQL se preciso de auditoria mais rápida
   INSERT INTO system_events (tenant_id, kind, severity, payload)
   VALUES ('TENANT_ID', 'account_restricted', 'critical', '{"source":"cliente"}');
   ```
4. Faça o RCA, conferindo nas últimas 48h:
   - **DLQ por motivo**: `policy_violation` ou `recipient_not_on_whatsapp` em alta?
   - **Razão de destinatários novos vs recorrentes**: subiu de repente?
   - **Conteúdo das últimas mensagens** enviadas (reports do WhatsApp expõem as últimas 5).
   - **Origem da base de contatos**: foi importação recente sem opt-in?
   - **Templates de campanha**: contexto claro? CTA enganoso? categoria proibida?
5. Se a causa for **uso abusivo** do cliente: documente, comunique e mantenha trava.
   Esses casos não devolvem valor do período em curso (cláusula nos Termos v2.0).
6. Se for **erro do sistema** ou **falso positivo**: corrija a causa, libere kill switch,
   reduza throughput inicial pra 20% do anterior e monitore por 24h.

---

## 4. Playbook: duplicação em massa

Sintoma: cliente reporta que recebeu (ou mandou) a mesma mensagem 2-5x para a mesma
pessoa.

1. **Kill switch ON** (reason = `duplicacao_em_massa`).
2. Pause Bull worker do tenant (se necessário, escale para parar todos):
   ```bash
   docker exec gestaozap-backend-1 redis-cli -h redis SET "gestaozap:$TENANT_ID:kill-switch" investigando_dup EX 3600
   ```
3. Aumente TTL de dedupe (recipient lock) preventivamente:
   - Admin → Configurações → procure a chave `recipient_dedupe_ttl_sec` (se existir;
     senão use SQL direto pra subir o `tryReserveRecipient` para 48h).
4. Reconcilie por `(tenant_id, campaign_id, phone)`:
   ```sql
   SELECT phone, COUNT(*) AS n
   FROM send_logs
   WHERE tenant_id = 'TENANT_ID' AND status = 'sent'
     AND created_at > now() - interval '24 hours'
   GROUP BY phone HAVING COUNT(*) > 1
   ORDER BY n DESC LIMIT 50;
   ```
5. Causas comuns:
   - **Worker concorrente**: 2 instâncias do backend rodando + queue compartilhada
   - **Upstream retry mal classificado**: erro 500 do backend → frontend tenta de novo
   - **Webhook duplicado**: ASAAS ou similar mandando o mesmo evento 2x
   - **Reconnect do wwebjs disparando reenvio** (não deveria, mas confirme)
6. **Suprimir follow-up** para destinatários impactados por 72h:
   - Atualize `consent_marketing = false` temporariamente para esses números, OU
   - Adicione um lock manual no Redis: `SET gestaozap:$TENANT:recipient-lock:$DIGITS 1 EX 259200`
7. Corrija a causa raiz.
8. Liberte o kill switch e redrive com volume reduzido.

---

## 5. Playbook: pico de DLQ por `not_on_whatsapp`

Sintoma: muitos contatos sendo descartados como "não está no WhatsApp" — indica base
de qualidade ruim ou scraping.

1. Não é urgente travar; o sistema já não envia para esses números (foi pre-flight).
2. Mas é **sinal de risco de compliance**: base provavelmente não tem opt-in.
3. Veja a razão da base:
   ```sql
   -- Quanto da base aparece como inválida?
   SELECT
     COUNT(*) FILTER (WHERE status='dlq' AND error='not_on_whatsapp')
     * 100.0 / NULLIF(COUNT(*), 0) AS pct_invalid
   FROM send_logs
   WHERE tenant_id='TENANT_ID' AND created_at > now() - interval '24h';
   ```
4. Se passar de **15%**, é alerta amarelo (avise o cliente sobre qualidade da base).
5. Se passar de **30%**, é alerta vermelho: pause e converse antes de continuar.

---

## 6. Checklist diário (operações)

- [ ] **Incidentes** sem resolução em todos os tenants (filtro `unresolved=1`)
- [ ] Sessões WhatsApp em `qr_ready` por mais de 1h (cliente abandonou?)
- [ ] DLQ por tenant — algum cresceu >50% vs ontem?
- [ ] Quality gate breached em algum tenant nas últimas 24h?
- [ ] Linked devices: cliente recebeu novo dispositivo "estranho"? (peça pra revisar)
- [ ] Métricas Prometheus: scrape funcionando? Alertas chegaram?
- [ ] Versão dos termos (`terms_current_version`) bate com a versão visual atual?

---

## 7. Endpoints úteis (admin)

```bash
# Kill switch
POST /api/admin/tenants/:id/kill-switch  { action: 'on'|'off', reason?, ttlSec? }
GET  /api/admin/tenants/:id/anti-block

# DLQ
GET  /api/admin/tenants/:id/dlq
POST /api/admin/tenants/:id/dlq/redrive  { ids? }

# Incidentes
GET  /api/admin/incidents?unresolved=1&severity=critical
GET  /api/admin/tenants/:id/incidents
POST /api/admin/incidents/:id/resolve

# Métricas
GET  /api/admin/metrics
```

---

## 8. Comandos úteis no servidor

```bash
# Listar todos os kill switches ativos
docker exec gestaozap-backend-1 redis-cli -h redis --scan --pattern 'gestaozap:*:kill-switch'

# Limpar todos os kill switches (emergência)
docker exec gestaozap-backend-1 redis-cli -h redis --scan --pattern 'gestaozap:*:kill-switch' \
  | xargs -I{} docker exec gestaozap-backend-1 redis-cli -h redis DEL {}

# Quantos recipient-locks ativos por tenant
docker exec gestaozap-backend-1 redis-cli -h redis --scan --pattern 'gestaozap:$TENANT:recipient-lock:*' | wc -l

# Filas Bull — backlog atual
docker exec gestaozap-backend-1 redis-cli -h redis LLEN bull:send-queue:$TENANT_ID:wait

# Logs do backend filtrando por incidentes
docker compose logs backend | grep -i "\[incident\]\|\[wa-autoreconnect\]"
```

---

## 9. Política de comunicação ao cliente

**Quando pausar sem aviso:** suspeita clara de abuso, conteúdo proibido, lista
comprada, padrão típico de spam. Comunique depois, com evidência.

**Quando avisar antes:** quality gate disparou por causa de erro do próprio cliente
(p.ex. campanha mal segmentada), sessão caindo recorrentemente, problema na base que
não é abuso.

**O que sempre comunicar:** quando pausar, motivo. Quando reabrir, condições. Termos
v2.0 já cobrem que não devolvemos valor em abuso — não precisa reabrir essa discussão
caso a caso.
