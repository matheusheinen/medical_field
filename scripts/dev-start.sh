#!/usr/bin/env bash
# Sobe os 3 serviços em segundo plano para desenvolvimento local.
# Logs em ./logs/*.log   |   Parar: ./scripts/dev-stop.sh
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$RAIZ/logs" "$RAIZ/.pids"
[ -f "$RAIZ/.env" ] || cp "$RAIZ/.env.example" "$RAIZ/.env"
# Os serviços não sobem sem um JWT_SECRET forte: gera um na primeira execução
if grep -qE '^JWT_SECRET=(medicalfield-dev-secret-troque-em-producao)?$' "$RAIZ/.env"; then
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" "$RAIZ/.env"
  echo "JWT_SECRET gerado em .env"
fi
set -a && . "$RAIZ/.env" && set +a

# auth-service (Node/TS)
( cd "$RAIZ/services/auth-service" && nohup node dist/index.js > "$RAIZ/logs/auth.log" 2>&1 & echo $! > "$RAIZ/.pids/auth" )

# clinical-service (Java): jar gerado pelo "mvn package"
( nohup java -jar "$RAIZ/services/clinical-service/target/clinical-service.jar" > "$RAIZ/logs/clinical.log" 2>&1 & echo $! > "$RAIZ/.pids/clinical" )

# document-service (Python)
PY=.venv/bin/python; [ -x "$RAIZ/services/document-service/.venv/Scripts/python.exe" ] && PY=.venv/Scripts/python.exe   # Windows
( cd "$RAIZ/services/document-service" && nohup "$PY" -m app.main > "$RAIZ/logs/document.log" 2>&1 & echo $! > "$RAIZ/.pids/document" )

sleep 3
echo "auth-service      http://localhost:${AUTH_PORT:-3001}"
echo "clinical-service  http://localhost:${CLINICAL_PORT:-8080}"
echo "document-service  http://localhost:${DOCUMENT_PORT:-8000}"
