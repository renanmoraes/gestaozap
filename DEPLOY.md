# GestaZap — Deploy Guide

## 🚀 Primeiro Deploy (Setup Inicial)

### Pré-requisitos
- SSH acesso ao VPS Hostinger
- Docker e Docker Compose instalados
- Git instalado

### Passo 1: Conectar ao VPS

```bash
ssh root@2.25.186.75
```

### Passo 2: Preparar o ambiente

```bash
# Atualizar sistema
apt update && apt upgrade -y

# Instalar Docker (se não estiver instalado)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Instalar Docker Compose v2 (se necessário)
apt install docker-compose -y

# Clonar o repositório
git clone https://github.com/rmoraes/gestaozap.git /opt/gestaozap
cd /opt/gestaozap
```

### Passo 3: Executar o script de primeiro deploy

```bash
chmod +x infra/initial-deploy.sh
./infra/initial-deploy.sh
```

Este script irá:
- ✅ Criar estrutura de diretórios
- ✅ Build das imagens Docker
- ✅ Subir os serviços (Backend + Frontend + PostgreSQL + Redis)
- ✅ Executar migrations e seeds
- ✅ Configurar conta admin padrão

### Passo 4: Configurar variáveis de produção

Edite o arquivo `.env`:

```bash
nano /opt/gestaozap/.env
```

**Altere obrigatoriamente:**

```env
# Altere a senha do admin
ADMIN_SECRET=sua-senha-super-secreta-aqui

# Se usar um domínio, configure:
VITE_API_URL=https://seu-dominio.com

# Opcional: Configurar storage em Cloudflare R2
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=seu-id
R2_ACCESS_KEY=sua-key
R2_SECRET_KEY=sua-secret
R2_BUCKET=seu-bucket
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

Depois de alterar o `.env`:

```bash
docker compose restart backend frontend
```

## 🔄 Deployments Posteriores (Blue-Green)

Para fazer deploy de novas versões com zero-downtime:

```bash
cd /opt/gestaozap
chmod +x infra/deploy.sh
./infra/deploy.sh
```

Este script irá:
- ✅ Git pull da nova versão
- ✅ Build em paralelo (blue ou green)
- ✅ Executar migrations se necessário
- ✅ Aguardar healthcheck
- ✅ Trocar o tráfego atomicamente via Nginx
- ✅ Derrubar a versão antiga

## 🌐 Configurar Nginx (Opcional)

Se quiser usar um domínio customizado com Nginx:

```bash
# Copiar arquivo de configuração
cp /opt/gestaozap/infra/nginx.conf /etc/nginx/sites-available/gestaozap
ln -s /etc/nginx/sites-available/gestaozap /etc/nginx/sites-enabled/

# Editar e configurar domínio
nano /etc/nginx/sites-available/gestaozap

# Testar e recarregar
nginx -t
systemctl restart nginx
```

## 🔒 Configurar SSL com Let's Encrypt

```bash
apt install certbot python3-certbot-nginx -y
certbot certonly --nginx -d seu-dominio.com
```

Depois, configure no Nginx para usar os certificados.

## 📊 Monitorar Logs

```bash
# Logs do backend
docker compose logs -f backend

# Logs do frontend
docker compose logs -f frontend

# Logs do PostgreSQL
docker compose logs -f postgres

# Logs de tudo
docker compose logs -f
```

## 🔌 Acessar o Admin

**URL:** `http://seu-vps:3002/admin`

**Credenciais:**
- Email: `admin@gestaozap.digital`
- Secret: (confira em `.env` → `ADMIN_SECRET`)

## 📊 Status da Aplicação

```bash
# Verificar saúde dos serviços
docker compose ps

# Healthcheck do backend
curl http://localhost:3001/api/health

# Verificar banco de dados
docker compose exec postgres psql -U wa_invites -d wa_invites
```

## 🛠️ Troubleshooting

### Backend não sobe
```bash
docker compose logs backend
docker compose restart backend
```

### Migrations falharam
```bash
docker compose exec backend npm run db:migrate
```

### Resetar tudo (⚠️ Deleta dados)
```bash
docker compose down -v
docker compose up -d
docker compose exec backend npm run db:migrate
```

## 📝 Dados Iniciais

Após o primeiro deploy:

- ✅ **Admin Account:** Criado automaticamente
- ✅ **Platform Config:** Planos, delays, configurações anti-ban, etc.
- ✅ **Database:** Vazio (pronto para seed de contatos)
- ✅ **Backup Default:** Pode ser criado para backup da conta admin

## ⚙️ Configurações Importantes

### Anti-Ban (Anti-bloqueio WhatsApp)

Configuradas em `platform_config`:
- `batch_size`: 30 mensagens por lote
- `batch_pause_ms`: 10 minutos entre lotes
- `antiban_delay_min_ms`: 15 segundos mín entre mensagens
- `antiban_delay_max_ms`: 60 segundos máx entre mensagens

### Horários de Envio

- `hour_start_default`: 08:00
- `hour_end_default`: 20:00
- `TZ`: America/Sao_Paulo

### Backup Automático

- `backup_auto_hour`: 03:00 (horário SP)
- `backup_retention`: 7 dias

## 🚀 Production Checklist

- [ ] ADMIN_SECRET alterado
- [ ] Database URL verificada
- [ ] Domínio configurado (se houver)
- [ ] SSL certificado instalado
- [ ] Nginx configurado
- [ ] Backups automáticos habilitados
- [ ] Logs monitorados
- [ ] Healthcheck funcionando

