#!/usr/bin/env bash
# Para os serviços iniciados por dev-start.sh (pelo PID salvo e, por garantia, pela porta).
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$RAIZ/.env" ] && set -a && . "$RAIZ/.env" && set +a
for s in auth clinical document; do
  [ -f "$RAIZ/.pids/$s" ] && kill "$(cat "$RAIZ/.pids/$s")" 2>/dev/null; rm -f "$RAIZ/.pids/$s"
done
for porta in "${AUTH_PORT:-3001}" "${CLINICAL_PORT:-8080}" "${DOCUMENT_PORT:-8000}"; do
  if command -v lsof >/dev/null; then
    pids=$(lsof -t -i:"$porta" -sTCP:LISTEN 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null
  else   # Windows (Git Bash): encerra o processo que escuta na porta
    for pid in $(netstat -ano | awk -v p=":$porta" '$2 ~ p"$" && $4=="LISTENING" {print $5}' | sort -u); do taskkill //F //PID "$pid" >/dev/null 2>&1; done
  fi
done
sleep 1
echo "serviços parados"
