"""
MedicalField - Document Service (Python + FastAPI)
Gera a Ficha de Atendimento em PDF e a envia por e-mail como anexo.

Integração entre microsserviços: os dados da ficha são obtidos do clinical-service (Java)
via HTTP, repassando o token do profissional (o serviço não lê as tabelas clínicas).
"""
import re
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from . import config
from .access_log import AccessLogMiddleware
from .email_sender import criar_email_sender
from .pdf_builder import data_hora, gerar_ficha_pdf
from .security import exigir_usuario

app = FastAPI(title="MedicalField - Document Service", version="1.0.0",
              # Swagger desativado: todas as rotas, exceto o login, exigem autenticação
              docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(AccessLogMiddleware)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.exception_handler(HTTPException)
async def erro_http(_request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"erro": exc.detail})


async def buscar_ficha(atendimento_id: str, request: Request) -> dict:
    url = f"{config.CLINICAL_URL}/atendimento/detalhe/{atendimento_id}"
    headers = {"Authorization": f"Bearer {request.state.token}"}
    if request.headers.get("x-device-id"):
        headers["X-Device-Id"] = request.headers["x-device-id"]
    try:
        async with httpx.AsyncClient(timeout=15) as cliente:
            r = await cliente.get(url, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(503, f"clinical-service indisponível: {e}")
    if r.status_code == 404:
        raise HTTPException(404, "Atendimento não encontrado no servidor central (já foi sincronizado?)")
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.json().get("erro", "Erro ao consultar clinical-service"))
    return r.json()


def nome_arquivo(ficha: dict) -> str:
    return f"ficha-atendimento-{ficha['atendimento']['id'][:8]}.pdf"


@app.get("/documento/atendimento/{atendimento_id}/pdf")
async def gerar_pdf(atendimento_id: str, request: Request, _usuario: dict = Depends(exigir_usuario)):
    """Gera e devolve a Ficha de Atendimento em PDF (download)."""
    ficha = await buscar_ficha(atendimento_id, request)
    pdf = gerar_ficha_pdf(ficha)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{nome_arquivo(ficha)}"'})


class EmailRequest(BaseModel):
    destinatario: Optional[str] = None      # se vazio: e-mail do paciente ou do contato de emergência
    mensagem: Optional[str] = None


@app.post("/documento/atendimento/{atendimento_id}/email")
async def enviar_email(atendimento_id: str, corpo: EmailRequest, request: Request,
                       usuario: dict = Depends(exigir_usuario)):
    """Gera a ficha e envia por e-mail como anexo para o paciente ou familiar."""
    ficha = await buscar_ficha(atendimento_id, request)
    pessoa = ficha.get("pessoa") or {}
    destinatario = (corpo.destinatario or pessoa.get("email") or pessoa.get("contatoEmergenciaEmail") or "").strip()
    if not EMAIL_RE.match(destinatario):
        raise HTTPException(400, "Informe um e-mail de destinatário válido")

    pdf = gerar_ficha_pdf(ficha)
    texto = (
        f"Olá,\n\nSegue em anexo a Ficha de Atendimento pré-hospitalar de {pessoa.get('nome', 'paciente')}, "
        f"realizada em {data_hora(ficha['atendimento'].get('dataHora'))}.\n\n"
        + (f"{corpo.mensagem}\n\n" if corpo.mensagem else "")
        + f"Profissional responsável: {usuario.get('nome')} ({usuario.get('tipo')} {usuario.get('registro')}).\n\n"
        "Este e-mail contém dados pessoais de saúde. Se você não é o destinatário, descarte-o.\n"
        "— MedicalField"
    )
    sender = criar_email_sender()
    msg = sender.montar(destinatario, "MedicalField - Ficha de Atendimento", texto, pdf, nome_arquivo(ficha))
    try:
        info = sender.enviar(msg)
    except Exception as e:
        raise HTTPException(502, f"Falha ao enviar e-mail: {e}")
    return {"enviado": True, "destinatario": destinatario, "anexo": nome_arquivo(ficha),
            "tamanhoBytes": len(pdf), **info}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=config.PORT, proxy_headers=True)
