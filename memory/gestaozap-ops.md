---
name: gestaozap-ops
description: gestaozap — backend sem hot-reload; mudanças exigem restart e a sessão do WhatsApp precisa ser reiniciada manualmente
metadata:
  type: project
---

No projeto `RenanHouse/gestaozap` (Express + Bull/Redis + whatsapp-web.js, rodando via docker-compose), o backend sobe com `CMD ["node", "src/app.js"]` — **não há hot-reload (nodemon)**.

- Toda alteração em `backend/src` exige reiniciar o processo: `docker compose restart backend` (rodar dentro do WSL: `wsl -d Ubuntu -- bash -lc "cd /mnt/linux-home/renanmoraes/projects/RenanHouse/gestaozap && docker compose restart backend"`). O `src` é montado por volume, então o arquivo já está atualizado em disco, mas o processo carrega o código antigo em memória.
- A sessão do WhatsApp **não inicia automaticamente** no boot — só conecta via `POST /api/session/start` (ou pela tela de Sessão no frontend). O login persiste no volume `wwebjs_auth`, então reconecta sem QR.
- Node/npm **não estão instalados no WSL** — rodar testes/scripts só dentro do container (`docker exec gestaozap-backend-1 ...`) ou via Docker.
- Banco: PostgreSQL (`wa_invites`) no container `gestaozap-postgres-1`, volume `gestaozap_postgres_data`.
- Bug histórico corrigido: o resolvedor de envio gerava variantes do telefone **sem DDD** (sufixos), e `getNumberId` resolvia para outro DDD (ex.: 31→19, outra pessoa). Envio agora usa só o número completo `55+DDD+número` (`getSendCandidates` em `whatsapp.service.js`).
- Backup: `backend/src/services/backup.service.js` gera 1 arquivo `.json` (EJSON, preserva ObjectId/Date) com todas as coleções + imagens (base64). Diário às 3h (TZ Sao_Paulo), mantém últimos 7, em `backend/backups/` (bind mount no docker-compose). UI em `frontend/src/pages/Backup.jsx` (criar/baixar/restaurar). Restaurar é destrutivo (deleteMany+insertMany). O bind mount `./backend/backups` exige `docker compose up -d backend` (recriar) na 1ª vez — só `restart` não monta volume novo.
