"""
Padrão Adapter: a rota de e-mail depende só da interface EmailSender.
 - SmtpEmailSender ....... adapta o smtplib (Gmail, Outlook, Mailtrap, servidor da Univates...)
 - ArquivoEmailSender .... grava o e-mail como .eml (sem servidor SMTP; útil em testes)
"""
import os
import smtplib
import ssl
from abc import ABC, abstractmethod
from datetime import datetime
from email.message import EmailMessage
from email.utils import make_msgid

from . import config


class EmailSender(ABC):
    via = "?"

    @abstractmethod
    def enviar(self, msg: EmailMessage) -> dict: ...

    def montar(self, destinatario: str, assunto: str, corpo: str, anexo: bytes, nome_anexo: str) -> EmailMessage:
        msg = EmailMessage()
        msg["From"] = config.EMAIL_FROM
        msg["To"] = destinatario
        msg["Subject"] = assunto
        msg["Message-ID"] = make_msgid(domain="medicalfield.local")
        msg.set_content(corpo)
        msg.add_attachment(anexo, maintype="application", subtype="pdf", filename=nome_anexo)
        return msg


class SmtpEmailSender(EmailSender):
    via = "SMTP"

    def enviar(self, msg: EmailMessage) -> dict:
        contexto = ssl.create_default_context()
        if config.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, context=contexto, timeout=20) as s:
                if config.SMTP_USER:
                    s.login(config.SMTP_USER, config.SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as s:
                if config.SMTP_STARTTLS:
                    s.starttls(context=contexto)
                if config.SMTP_USER:
                    s.login(config.SMTP_USER, config.SMTP_PASSWORD)
                s.send_message(msg)
        return {"via": self.via, "servidor": f"{config.SMTP_HOST}:{config.SMTP_PORT}"}


class ArquivoEmailSender(EmailSender):
    via = "ARQUIVO"

    def enviar(self, msg: EmailMessage) -> dict:
        os.makedirs(config.EMAIL_OUTBOX_DIR, exist_ok=True)
        nome = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + msg["To"].replace("@", "_at_") + ".eml"
        caminho = os.path.abspath(os.path.join(config.EMAIL_OUTBOX_DIR, nome))
        with open(caminho, "wb") as f:
            f.write(bytes(msg))
        return {"via": self.via, "arquivo": caminho}


def criar_email_sender() -> EmailSender:
    return SmtpEmailSender() if config.SMTP_HOST else ArquivoEmailSender()
