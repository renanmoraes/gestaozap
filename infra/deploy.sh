#!/usr/bin/env bash
# Script de deploy zero-downtime (blue-green) para VPS Hostinger
# Uso: ./infra/deploy.sh [blue|green]
# Requer: docker, docker compose v2, nginx

set -euo pipefail

DEPLOY_ROOT="/opt/gestaozap"
BLUE_PORT_BACK=3001
BLUE_PORT_FRONT=3002
GREEN_PORT_BACK=4001
GREEN_PORT_FRONT=4002

ACTIVE=$(cat "$DEPLOY_ROOT/.active" 2>/dev/null || echo "blue")
NEXT=$([ "$ACTIVE" = "blue" ] && echo "green" || echo "blue")

NEXT_BACK_PORT=$([ "$NEXT" = "green" ] && echo $GREEN_PORT_BACK || echo $BLUE_PORT_BACK)
NEXT_FRONT_PORT=$([ "$NEXT" = "green" ] && echo $GREEN_PORT_FRONT || echo $BLUE_PORT_FRONT)
ACTIVE_BACK_PORT=$([ "$ACTIVE" = "blue" ] && echo $BLUE_PORT_BACK || echo $GREEN_PORT_BACK)

echo "→ Deploy: $ACTIVE → $NEXT (backend :$NEXT_BACK_PORT, frontend :$NEXT_FRONT_PORT)"

# 1. Pull e build
cd "$DEPLOY_ROOT/$NEXT"
git pull origin main
PORT="$NEXT_BACK_PORT" VITE_PORT="$NEXT_FRONT_PORT" docker compose build

# 2. Start novo stack (portas internas diferentes)
PORT="$NEXT_BACK_PORT" VITE_PORT="$NEXT_FRONT_PORT" docker compose up -d --remove-orphans

# 3. Aguarda healthcheck
echo "→ Aguardando healthcheck em :$NEXT_BACK_PORT..."
for i in {1..30}; do
    if curl -sf "http://127.0.0.1:$NEXT_BACK_PORT/api/health" > /dev/null 2>&1; then
        echo "✓ Healthcheck OK"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "✗ Healthcheck falhou — abortando"
        PORT="$NEXT_BACK_PORT" docker compose down
        exit 1
    fi
    sleep 2
done

# 4. Atualiza Nginx (troca upstream atomicamente)
sed -i "s/127.0.0.1:$ACTIVE_BACK_PORT/127.0.0.1:$NEXT_BACK_PORT/g" /etc/nginx/sites-enabled/gestaozap.conf
nginx -t && nginx -s reload
echo "→ Nginx recarregado — tráfego direcionado para $NEXT"

# 5. Drain e derruba stack antigo
sleep 30
cd "$DEPLOY_ROOT/$ACTIVE"
docker compose down
echo "→ Stack $ACTIVE encerrado"

# 6. Registra estado ativo
echo "$NEXT" > "$DEPLOY_ROOT/.active"
echo "✓ Deploy concluído: $ACTIVE → $NEXT"
