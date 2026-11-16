"""Validação do JWT emitido pelo auth-service (segredo compartilhado HS256)."""
from typing import Optional

import jwt
from fastapi import Header, HTTPException, Request

from . import config


def decodificar(token: str) -> dict:
    return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])


def usuario_do_header(authorization: Optional[str]) -> Optional[dict]:
    """Usado pelo middleware de log: nunca lança exceção."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return decodificar(authorization[7:])
    except jwt.PyJWTError:
        return None


def exigir_usuario(request: Request, authorization: Optional[str] = Header(default=None)) -> dict:
    """Dependência FastAPI: todas as rotas deste serviço exigem token válido."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token ausente")
    try:
        usuario = decodificar(authorization[7:])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    request.state.usuario = usuario
    request.state.token = authorization[7:]
    return usuario
