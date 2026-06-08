# GestãoZap — Handoff

## O que é
Ferramenta local para envio de convites WhatsApp em batch. Frontend React em http://localhost:3002, backend Express em http://localhost:3001.

## Status
Implementação completa (18 tasks). Docker Compose funcionando.

```bash
docker compose up -d   # sobe tudo
docker compose down    # para tudo
```

## Problema atual
Ao clicar "Conectar WhatsApp" na página Sessão, o Chromium (usado pelo whatsapp-web.js) falha com erro de lock de perfil. A UI agora mostra o erro em vermelho (fix commitado em 85a47a2).

### Erro exato
```
Error: Failed to launch the browser process: Code: 21
The profile appears to be in use by another Chromium process on another computer
```

### Causa
O volume Docker `gestaozap_wwebjs_auth` tem lock file de sessão anterior.

### Possíveis fixes a tentar
1. Apagar volume e recriar: `docker compose down -v && docker compose up -d`
2. Adicionar `--disable-background-networking` e `--single-process` aos args do Chromium em `backend/src/services/whatsapp.service.js` linha 15
3. Usar `userDataDir` temporário no puppeteer config em vez de LocalAuth

## Arquitetura
- Frontend: React + Vite + TailwindCSS → porta 3002
- Backend: Node.js + Express + Socket.io → porta 3001
- WhatsApp: whatsapp-web.js (LocalAuth, Chromium dentro do Docker)
- Fila: Bull + Redis
- DB: MongoDB

## Arquivos chave
- `backend/src/services/whatsapp.service.js` — WA client, QR, send
- `backend/src/services/queue.service.js` — anti-ban processor
- `frontend/src/pages/Session.jsx` — página de conexão WA
- `frontend/src/pages/Send.jsx` — disparo com progresso em tempo real
- `docker-compose.yml` — toda a infra

## Testes backend
```bash
cd backend && npm test   # 24/24 passando
```

## Contatos recebidos do usuário (para importar na aba Contatos)
```json
[
  {"name":"Napoliane","phone":"5531997790510"},
  {"name":"Philipe","phone":"5531986022598"},
  {"name":"Lucas","phone":"5531993373214"},
  {"name":"Hadailton","phone":"5531988696771"},
  {"name":"Kesley","phone":"5531989684709"},
  {"name":"Lucas","phone":"5531988925672"},
  {"name":"Gustavo","phone":"5531994009081"},
  {"name":"Pamella","phone":"5531992109471"},
  {"name":"Eduarda","phone":"5531996649239"},
  {"name":"Vitor","phone":"5531989345844"},
  {"name":"Kenner","phone":"5531989513797"},
  {"name":"Micheli","phone":"5531988004784"},
  {"name":"Cleidiane","phone":"5531999923154"},
  {"name":"Kevin","phone":"5531999091222"},
  {"name":"Antonio Luiz","phone":"5531987021896"},
  {"name":"Everson","phone":"5531985329099"},
  {"name":"Douglas","phone":"5531999021032"},
  {"name":"Monnick","phone":"5531996021112"},
  {"name":"Thais","phone":"5532988351764"},
  {"name":"Larissa","phone":"5531989257938"}
]
```
Cole esse JSON na aba "Contatos > Importar JSON".

## Git log recente
- 85a47a2 fix: handle chromium init error in whatsapp service + show error in UI
- d1b3627 fix: remove auto-init whatsapp on startup
- 62537bc fix: change frontend port from 3000 to 3002
- f215be3 feat: all 5 React pages
- 495e368 fix: guard server.listen with require.main
