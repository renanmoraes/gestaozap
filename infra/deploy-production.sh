#!/usr/bin/env bash
# Deploy com downtime mínimo — build antes de reiniciar, healthcheck antes de concluir.
# Fila de envios persiste no Redis; backend retoma após restart.
# Uso: ./infra/deploy-production.sh

set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/gestaozap}"
cd "$DEPLOY_ROOT"

echo "→ git pull"
git fetch origin main
git reset --hard origin/main

echo "→ build (serviços ainda rodando)"
docker compose build backend frontend

echo "→ migrate (com backend atual ainda ativo)"
docker compose exec -T backend npm run db:migrate || true

echo "→ restart frontend (estático — rápido)"
docker compose up -d --no-deps --wait frontend

echo "→ restart backend (aguarda healthcheck)"
docker compose up -d --no-deps --wait backend

echo "→ verificação"
for i in {1..15}; do
  if curl -sf http://127.0.0.1:3001/api/health > /dev/null; then
    echo "✓ API healthy"
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "✗ Healthcheck falhou após deploy"
exit 1
