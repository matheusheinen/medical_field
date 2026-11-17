#!/usr/bin/env bash
# =====================================================================
# MedicalField - instalação completa na VM da Univates (Ubuntu 22.04/24.04)
#
#   sudo ./scripts/install_vm.sh              # instala/atualiza tudo
#   sudo ./scripts/install_vm.sh --reset-db   # também recria o banco com os dados iniciais
#
# Pode ser executado de novo a qualquer momento (ex.: depois de um git pull).
# =====================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Execute com sudo"; exit 1; }

ORIGEM="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO=/opt/medicalfield
RESET_DB=false
[ "${1:-}" = "--reset-db" ] && RESET_DB=true
passo() { echo -e "\n\033[1;34m==> $*\033[0m"; }

passo "1/8 Pacotes do sistema"
apt-get update -q
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
apt-get install -y -q postgresql postgresql-contrib nginx maven \
  python3 python3-venv python3-pip python3-dev build-essential curl rsync lsof unzip ca-certificates openssl
# Java: qualquer JDK >= 21 serve (o código é compilado com --release 21).
# Ubuntu 22.04/24.04 têm openjdk-21; versões mais novas (ex.: 26.04) trazem um JDK padrão mais recente.
if ! command -v javac >/dev/null || [ "$(javac -version 2>&1 | awk '{print $2}' | cut -d. -f1)" -lt 21 ]; then
  apt-get install -y -q openjdk-21-jdk-headless || apt-get install -y -q default-jdk-headless
fi
# Node.js >= 20: tenta o pacote da própria distribuição; se for antigo ou inexistente, usa o NodeSource.
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  apt-get install -y -q nodejs npm || true
fi
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ] || ! command -v npm >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
echo "node $(node -v) | $(java -version 2>&1 | head -1) | $(python3 --version) | $(psql --version)"

passo "2/8 Usuário de serviço e cópia do projeto para $DESTINO"
id medicalfield >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin medicalfield
if [ "$ORIGEM" != "$DESTINO" ]; then
  mkdir -p "$DESTINO"
  rsync -a --delete --exclude node_modules --exclude .venv --exclude target --exclude dist --exclude build \
        --exclude .env --exclude logs --exclude .pids --exclude emails_enviados "$ORIGEM/" "$DESTINO/"
fi
if [ ! -f "$DESTINO/.env" ]; then
  cp "$DESTINO/.env.example" "$DESTINO/.env"
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" "$DESTINO/.env"
  echo "Criado $DESTINO/.env (JWT_SECRET aleatório). Configure o SMTP nele para enviar e-mails reais."
fi
# .env antigo com segredo vazio ou com o valor de exemplo publicado: gera um novo (os serviços não sobem sem ele)
if grep -qE '^JWT_SECRET=(medicalfield-dev-secret-troque-em-producao)?$' "$DESTINO/.env"; then
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" "$DESTINO/.env"
  echo "JWT_SECRET regenerado em $DESTINO/.env"
fi
set -a; . "$DESTINO/.env"; set +a

passo "3/8 Banco de dados PostgreSQL"
systemctl enable --now postgresql
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
TEM_TABELAS=$(PGPASSWORD=$DB_PASSWORD psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT to_regclass('public.atendimento') IS NOT NULL")
if [ "$RESET_DB" = true ] || [ "$TEM_TABELAS" != "t" ]; then
  PGPASSWORD=$DB_PASSWORD psql -q -h localhost -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$DESTINO/database/01_schema.sql"
  PGPASSWORD=$DB_PASSWORD psql -q -h localhost -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$DESTINO/database/02_seed.sql"
  echo "Banco criado com os dados iniciais."
else
  echo "Banco já existe (use --reset-db para recriar)."
fi

passo "4/8 auth-service (Node.js/TypeScript)"
cd "$DESTINO/services/auth-service" && npm ci --no-audit --no-fund && npx tsc

passo "5/8 clinical-service (Java 21)"
cd "$DESTINO/services/clinical-service" && mvn -q -DskipTests package && ls -lh target/clinical-service.jar

passo "6/8 document-service (Python)"
cd "$DESTINO/services/document-service"
# .venv criado com outro Python (ex.: o Ubuntu atualizou o python3) não serve mais: recria
versao_py() { "$1" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null; }
if [ -d .venv ] && [ "$(versao_py .venv/bin/python)" != "$(versao_py python3)" ]; then
  echo "Python mudou ($(versao_py .venv/bin/python || echo '?') -> $(versao_py python3)): recriando .venv"
  rm -rf .venv
fi
[ -d .venv ] || python3 -m venv .venv
# --upgrade: sem ele, um pacote antigo já instalado "satisfaz" o >= do requirements e nunca é atualizado
# (foi o que quebrou o psycopg-binary 3.2.3, sem versão para o Python novo)
.venv/bin/pip install -q --upgrade pip && .venv/bin/pip install -q --upgrade -r requirements.txt
mkdir -p emails_enviados

passo "7/8 Interfaces gráficas (build) e Nginx"
for app in client-app admin-portal; do (cd "$DESTINO/$app" && npm ci --no-audit --no-fund && npm run build); done
mkdir -p /var/www/medicalfield
rsync -a --delete "$DESTINO/client-app/dist/" /var/www/medicalfield/app/
rsync -a --delete "$DESTINO/admin-portal/dist/" /var/www/medicalfield/admin/
cp "$DESTINO/deploy/nginx/medicalfield.conf" /etc/nginx/sites-available/medicalfield
ln -sf /etc/nginx/sites-available/medicalfield /etc/nginx/sites-enabled/medicalfield
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx

passo "8/8 Serviços systemd"
chown -R medicalfield:medicalfield "$DESTINO"
chmod 600 "$DESTINO/.env"
cp "$DESTINO"/deploy/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
for s in auth clinical document; do systemctl enable "medicalfield-$s" >/dev/null 2>&1; systemctl restart "medicalfield-$s"; done
sleep 5
systemctl --no-pager --lines=0 status medicalfield-auth medicalfield-clinical medicalfield-document | grep -E "●|Active:"

IP=$(hostname -I | awk '{print $1}')
echo -e "\n\033[1;32mPronto!\033[0m"
echo "  Portal administrativo: http://$IP/admin/   (credenciais iniciais: ver README)"
echo "  Aplicação cliente:     http://$IP/app/     (credenciais iniciais: ver README)"
echo "  API (Postman):         http://$IP/api/..."
echo "  Logs: journalctl -u medicalfield-clinical -f"
