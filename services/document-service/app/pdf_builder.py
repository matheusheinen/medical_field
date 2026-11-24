"""
Padrão Builder: monta a Ficha de Atendimento em PDF seção por seção.

    pdf = (FichaPdfBuilder(ficha)
           .cabecalho().paciente().prontuario().atendimento()
           .sinais_vitais().glasgow_e_triagem().medicamentos()
           .conduta().assinatura()
           .construir())
"""
from datetime import datetime
from io import BytesIO
from typing import Any, Optional
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from . import config

FUSO = ZoneInfo(config.TIMEZONE)
AZUL = colors.HexColor("#0B4F6C")
CINZA = colors.HexColor("#F1F4F6")
BORDA = colors.HexColor("#C9D3DA")

CORES_TRIAGEM = {
    "VERMELHO": "#D32F2F", "LARANJA": "#F57C00", "AMARELO": "#FBC02D",
    "VERDE": "#388E3C", "AZUL": "#1976D2", "PRETO": "#212121",
}
DESC_MANCHESTER = {
    "VERMELHO": "Emergência (atendimento imediato)", "LARANJA": "Muito urgente (até 10 min)",
    "AMARELO": "Urgente (até 60 min)", "VERDE": "Pouco urgente (até 120 min)", "AZUL": "Não urgente (até 240 min)",
}
DESC_START = {
    "VERMELHO": "Imediato", "AMARELO": "Tardio", "VERDE": "Leve / deambula", "PRETO": "Óbito / expectante",
}


def data_hora(valor: Optional[str], so_data: bool = False) -> str:
    if not valor:
        return "—"
    try:
        if so_data or len(valor) == 10:
            return datetime.strptime(valor[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
        dt = datetime.fromisoformat(valor.replace("Z", "+00:00")).astimezone(FUSO)
        return dt.strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return valor


def txt(v: Any, sufixo: str = "") -> str:
    if v is None or v == "":
        return "—"
    return f"{v}{sufixo}"


def num(v: Any) -> Any:
    """500.0 -> '500' ; 0.5 -> '0,5' (formato brasileiro)."""
    if v is None or v == "":
        return v
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    return (f"{f:.3f}".rstrip("0").rstrip(".")).replace(".", ",")


def classificar_glasgow(total: Optional[int]) -> str:
    if total is None:
        return "—"
    if total >= 13:
        return "TCE leve (13–15)"
    if total >= 9:
        return "TCE moderado (9–12)"
    return "TCE grave (3–8) — avaliar via aérea"


class FichaPdfBuilder:
    def __init__(self, ficha: dict):
        self.ficha = ficha
        self.a = ficha.get("atendimento") or {}
        self.p = ficha.get("pessoa") or {}
        self.pr = ficha.get("prontuario") or {}
        self.prof = ficha.get("profissional") or {}
        self.meds = ficha.get("medicamentos") or []
        self._elementos: list = []
        base = getSampleStyleSheet()
        self.s_titulo = ParagraphStyle("t", parent=base["Title"], fontSize=15, textColor=AZUL, spaceAfter=2)
        self.s_sub = ParagraphStyle("s", parent=base["Normal"], fontSize=8.5, textColor=colors.grey, alignment=TA_CENTER)
        self.s_secao = ParagraphStyle("sec", parent=base["Heading3"], fontSize=10.5, textColor=colors.white,
                                      backColor=AZUL, leftIndent=0, borderPadding=(3, 4, 3, 4), spaceBefore=8, spaceAfter=5)
        self.s_normal = ParagraphStyle("n", parent=base["Normal"], fontSize=9, leading=12)
        self.s_rotulo = ParagraphStyle("r", parent=self.s_normal, fontSize=7.5, textColor=colors.HexColor("#5A6B76"))
        self.s_alerta = ParagraphStyle("al", parent=self.s_normal, textColor=colors.HexColor("#B71C1C"))

    # ---------------------------------------------------------------- helpers
    def _secao(self, titulo: str):
        self._elementos.append(Paragraph(titulo, self.s_secao))

    def _grade(self, pares: list, colunas: int = 3):
        """Grade de campos 'rótulo / valor'."""
        celulas = [[Paragraph(r, self.s_rotulo), Paragraph(v, self.s_normal)] for r, v in pares]
        linhas = []
        for i in range(0, len(celulas), colunas):
            linha = celulas[i:i + colunas]
            while len(linha) < colunas:
                linha.append("")
            linhas.append(linha)
        largura = (A4[0] - 30 * mm) / colunas
        t = Table(linhas, colWidths=[largura] * colunas)
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDA),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDA),
            ("BACKGROUND", (0, 0), (-1, -1), CINZA),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        self._elementos.append(t)

    # ---------------------------------------------------------------- etapas do Builder
    def cabecalho(self):
        self._elementos.append(Paragraph("MedicalField — Ficha de Atendimento Pré-Hospitalar", self.s_titulo))
        self._elementos.append(Paragraph(
            f"Atendimento nº {self.a.get('id', '')} &nbsp;•&nbsp; Gerado em "
            f"{datetime.now(FUSO).strftime('%d/%m/%Y %H:%M')}"
            + (" &nbsp;•&nbsp; registrado OFFLINE e sincronizado" if self.a.get("criadoOffline") else ""),
            self.s_sub))
        self._elementos.append(Spacer(1, 4))
        return self

    def paciente(self):
        p = self.p
        self._secao("1. Identificação do paciente")
        self._grade([
            ("Nome", f"<b>{txt(p.get('nome'))}</b>"),
            ("CPF", txt(p.get("cpf"))),
            ("Data de nascimento", data_hora(p.get("dataNascimento"), True)),
            ("Sexo", {"M": "Masculino", "F": "Feminino", "O": "Outro"}.get(p.get("sexo"), "—")),
            ("Telefone", txt(p.get("telefone"))),
            ("E-mail", txt(p.get("email"))),
            ("Contato de emergência", txt(p.get("contatoEmergenciaNome"))),
            ("E-mail do contato", txt(p.get("contatoEmergenciaEmail"))),
        ])
        return self

    def prontuario(self):
        pr = self.pr
        self._secao("2. Prontuário")
        alergias = pr.get("alergias")
        self._grade([
            ("Tipo sanguíneo", txt(pr.get("tipoSanguineo"))),
            ("Alergias", f"<font color='#B71C1C'><b>{alergias}</b></font>" if alergias else "Nega alergias"),
            ("Comorbidades", txt(pr.get("comorbidades"))),
            ("Medicamentos de uso contínuo", txt(pr.get("medicamentosContinuos"))),
            ("Observações", txt(pr.get("observacoes"))),
        ], colunas=2)
        return self

    def atendimento(self):
        a = self.a
        self._secao("3. Ocorrência")
        self._grade([
            ("Data/hora", data_hora(a.get("dataHora"))),
            ("Local", txt(a.get("localOcorrencia"))),
            ("Queixa principal", txt(a.get("queixaPrincipal"))),
        ])
        return self

    def sinais_vitais(self):
        a = self.a
        pa = (f"{a['paSistolica']}/{a['paDiastolica']} mmHg"
              if a.get("paSistolica") and a.get("paDiastolica") else "—")
        self._secao("4. Sinais vitais")
        self._grade([
            ("Pressão arterial", pa),
            ("Freq. cardíaca", txt(a.get("freqCardiaca"), " bpm")),
            ("Freq. respiratória", txt(a.get("freqRespiratoria"), " irpm")),
            ("Saturação SpO<sub>2</sub>", txt(a.get("saturacaoO2"), " %")),
            ("Temperatura", txt(num(a.get("temperatura")), " °C")),
            ("Glicemia capilar", txt(a.get("glicemia"), " mg/dL")),
        ])
        return self

    def glasgow_e_triagem(self):
        a = self.a
        total = a.get("glasgowTotal")

        def selo(cor: Optional[str], desc: dict) -> str:
            if not cor:
                return "—"
            hexcor = CORES_TRIAGEM.get(cor, "#000000")
            texto = "#000000" if cor == "AMARELO" else "#FFFFFF"
            return (f"<font backColor='{hexcor}' color='{texto}'><b>&nbsp;{cor}&nbsp;</b></font>"
                    f" — {desc.get(cor, '')}")

        self._secao("5. Nível de consciência e triagem")
        self._grade([
            ("Glasgow (O / V / M)",
             f"{txt(a.get('glasgowOcular'))} / {txt(a.get('glasgowVerbal'))} / {txt(a.get('glasgowMotora'))}"),
            ("Glasgow total", f"<b>{txt(total)}</b> — {classificar_glasgow(total)}"),
            ("Protocolo de Manchester", selo(a.get("triagemManchester"), DESC_MANCHESTER)),
            ("Protocolo START", selo(a.get("triagemStart"), DESC_START)),
        ], colunas=2)
        return self

    def medicamentos(self):
        self._secao("6. Medicamentos administrados")
        if not self.meds:
            self._elementos.append(Paragraph("Nenhum medicamento administrado.", self.s_normal))
            return self
        dados = [["Medicamento", "Apresentação", "Dose", "Via", "Horário"]]
        for m in self.meds:
            dados.append([
                Paragraph(f"<b>{m.get('nome')}</b><br/><font size=7>{txt(m.get('principioAtivo'))}</font>", self.s_normal),
                Paragraph(txt(m.get("apresentacao")), self.s_normal),
                f"{num(m.get('dose'))} {m.get('unidade') or ''}",
                txt(m.get("via")),
                data_hora(m.get("horario")),
            ])
        t = Table(dados, colWidths=[55 * mm, 45 * mm, 25 * mm, 18 * mm, 37 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), CINZA), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDA), ("INNERGRID", (0, 0), (-1, -1), 0.25, BORDA),
        ]))
        self._elementos.append(t)
        return self

    def conduta(self):
        a = self.a
        self._secao("7. Procedimentos, observações e destino")
        self._grade([
            ("Procedimentos realizados", txt(a.get("procedimentos"))),
            ("Observações", txt(a.get("observacoes"))),
            ("Destino / unidade de referência", txt(a.get("destino"))),
        ], colunas=1)
        return self

    def assinatura(self):
        prof = self.prof
        self._elementos.append(Spacer(1, 16))
        registro = f"{prof.get('tipoRegistro', '')} {prof.get('registro', '')}"
        if prof.get("uf"):
            registro += f"/{prof['uf']}"
        self._elementos.append(Paragraph(
            "_______________________________________________<br/>"
            f"<b>{txt(prof.get('nome'))}</b> — {registro}<br/>"
            "<font size=7 color='grey'>Documento gerado eletronicamente pelo MedicalField. "
            "Contém dados pessoais sensíveis de saúde (LGPD, art. 11).</font>",
            ParagraphStyle("ass", parent=self.s_normal, alignment=TA_CENTER)))
        return self

    def construir(self) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                                topMargin=12 * mm, bottomMargin=12 * mm,
                                title=f"Ficha de Atendimento {self.a.get('id', '')}", author="MedicalField")
        doc.build(self._elementos)
        return buffer.getvalue()


def gerar_ficha_pdf(ficha: dict) -> bytes:
    """Diretor do Builder: define a ordem das seções da ficha."""
    return (FichaPdfBuilder(ficha)
            .cabecalho().paciente().prontuario().atendimento()
            .sinais_vitais().glasgow_e_triagem().medicamentos()
            .conduta().assinatura()
            .construir())
