"""Configuração lida de variáveis de ambiente (ver .env.example na raiz)."""
import os
import sys


def env(chave: str, padrao: str = "") -> str:
    v = os.getenv(chave)
    return padrao if v is None or v.strip() == "" else v


PORT = int(env("DOCUMENT_PORT", "8000"))
# Segredo antigo que já foi publicado no repositório: nunca pode ser usado.
_SEGREDO_PUBLICO = "medicalfield-dev-secret-troque-em-producao"


def _segredo_jwt() -> str:
    """Sem um JWT_SECRET forte, qualquer pessoa poderia assinar um token ADMIN.
    Por isso o serviço se recusa a subir (fail-fast) em vez de usar um valor padrão."""
    s = env("JWT_SECRET").strip()
    if len(s) < 32 or s == _SEGREDO_PUBLICO:
        sys.exit("[document-service] JWT_SECRET ausente ou fraco (mínimo 32 caracteres). "
                 "Gere um com: openssl rand -hex 32")
    return s


JWT_SECRET = _segredo_jwt()
CLINICAL_URL = env("CLINICAL_URL", "http://localhost:8080")

DB_DSN = (
    f"host={env('DB_HOST', 'localhost')} port={env('DB_PORT', '5432')} "
    f"dbname={env('DB_NAME', 'medicalfield')} user={env('DB_USER', 'medicalfield')} "
    f"password={env('DB_PASSWORD', 'medicalfield')}"
)

# E-mail: se SMTP_HOST estiver vazio, os e-mails são gravados como arquivos .eml
# na pasta EMAIL_OUTBOX_DIR (útil para testes sem servidor SMTP).
SMTP_HOST = env("SMTP_HOST")
SMTP_PORT = int(env("SMTP_PORT", "587"))
SMTP_USER = env("SMTP_USER")
SMTP_PASSWORD = env("SMTP_PASSWORD")
SMTP_STARTTLS = env("SMTP_STARTTLS", "true").lower() == "true"
EMAIL_FROM = env("EMAIL_FROM", "MedicalField <nao-responda@medicalfield.local>")
EMAIL_OUTBOX_DIR = env("EMAIL_OUTBOX_DIR", os.path.join(os.path.dirname(__file__), "..", "emails_enviados"))

TIMEZONE = env("TIMEZONE", "America/Sao_Paulo")
