"""Middleware de log de acesso (LGPD) do document-service: grava cada requisição em log_acesso."""
import asyncio
import time
from datetime import datetime, timezone

import psycopg
from starlette.middleware.base import BaseHTTPMiddleware

from . import config
from .security import usuario_do_header

SERVICO = "document-service"


def _gravar(registro: tuple) -> None:
    try:
        with psycopg.connect(config.DB_DSN, autocommit=True) as conn:
            conn.execute(
                """INSERT INTO log_acesso (servico, data_hora, ip_cliente, profissional_id, registro,
                                           metodo, rota, status_code, tempo_ms, dispositivo_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                registro,
            )
    except Exception as e:  # o log nunca derruba a requisição
        print(f"Falha ao gravar log_acesso: {e}")


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        inicio = time.perf_counter()
        data_hora = datetime.now(timezone.utc)
        status = 500
        try:
            resposta = await call_next(request)
            status = resposta.status_code
            return resposta
        finally:
            ms = (time.perf_counter() - inicio) * 1000
            usuario = usuario_do_header(request.headers.get("authorization"))
            # X-Real-IP é definido pelo Nginx; X-Forwarded-For como alternativa
            fwd = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for")
            ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")
            registro = f"{usuario['tipo']} {usuario['registro']}" if usuario else None
            rota = request.url.path + (f"?{request.url.query}" if request.url.query else "")
            print(f"[{data_hora.isoformat()}] {SERVICO} ip={ip} prof={registro or '-'} "
                  f"{request.method} {rota} {status} {ms:.1f}ms", flush=True)
            asyncio.get_running_loop().run_in_executor(None, _gravar, (
                SERVICO, data_hora, ip, usuario["sub"] if usuario else None, registro,
                request.method, rota, status, round(ms, 2), request.headers.get("x-device-id"),
            ))
