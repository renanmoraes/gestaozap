#!/usr/bin/env bash
# Script de primeiro deploy no VPS
# Uso: ./infra/initial-deploy.sh
# Requer: docker, docker compose v2

set -euo pipefail

DEPLOY_ROOT="/opt/gestaozap"
BLUE_PORT_BACK=3001
BLUE_PORT_FRONT=3002

echo "🚀 GestaZap — Primeiro Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Cria diretório de deploy
echo "→ Criando estrutura de deploy em $DEPLOY_ROOT..."
sudo mkdir -p "$DEPLOY_ROOT"
sudo chown -R "$(whoami):$(whoami)" "$DEPLOY_ROOT"

# 2. Clone do repositório
echo "→ Clonando repositório..."
if [ ! -d "$DEPLOY_ROOT/.git" ]; then
  git clone https://github.com/rmoraes/gestaozap.git "$DEPLOY_ROOT"
  cd "$DEPLOY_ROOT"
else
  cd "$DEPLOY_ROOT"
  git pull origin main
fi

# 3. Cria arquivo .env para produção
echo "→ Criando arquivo .env..."
cat > "$DEPLOY_ROOT/.env" <<'EOF'
# ===== Database =====
DATABASE_URL=postgresql://wa_invites:wa_invites@postgres:5432/wa_invites
POSTGRES_PASSWORD=wa_invites

# ===== Redis =====
REDIS_HOST=redis
REDIS_PORT=6379

# ===== Ports =====
PORT=3001
VITE_PORT=3002

# ===== Admin Account =====
ADMIN_EMAIL=admin@gestaozap.digital
ADMIN_SECRET=change-this-secret-in-production-immediately

# ===== Authentication =====
AUTH_REQUIRED=false

# ===== Timezone =====
TZ=America/Sao_Paulo

# ===== Storage (Local) =====
STORAGE_PROVIDER=local

# ===== API URL (Configure com seu domínio) =====
VITE_API_URL=
VITE_BACKEND_PROXY_TARGET=http://backend:3001
EOF

echo "⚠️  IMPORTANTE: Edite o arquivo .env e atualize:"
echo "  - ADMIN_SECRET (altere a senha padrão)"
echo "  - VITE_API_URL (adicione o domínio de produção, se houver)"

# 4. Build das imagens
echo "→ Building Docker images..."
docker compose build --no-cache

# 5. Sobe os serviços
echo "→ Iniciando serviços..."
docker compose up -d --remove-orphans

# 6. Aguarda healthcheck
echo "→ Aguardando healthcheck do backend..."
for i in {1..30}; do
    if docker compose exec -T backend curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
        echo "✓ Backend está saudável"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "✗ Healthcheck falhou"
        docker compose logs backend
        exit 1
    fi
    sleep 2
done

# 7. Executa migrations
echo "→ Executando migrations e seeds..."
docker compose exec -T backend npm run db:migrate

# 8. Mostra informações
echo ""
echo "✓ Deploy concluído!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Backend: http://127.0.0.1:$BLUE_PORT_BACK"
echo "🔗 Frontend: http://127.0.0.1:$BLUE_PORT_FRONT"
echo ""
echo "📝 Admin Panel:"
echo "   Email: admin@gestaozap.digital"
echo "   Secret: (verifique em .env)"
echo ""
echo "⚠️  Próximos passos:"
echo "   1. Configure o Nginx (veja infra/nginx.conf como referência)"
echo "   2. Configure um domínio/DNS"
echo "   3. Configure SSL com Let's Encrypt"
echo "   4. Altere o ADMIN_SECRET em .env"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
