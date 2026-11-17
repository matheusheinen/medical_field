import { useEffect, useState } from 'react';
import { api, fmt, fmtData, fmtNum } from '../api';
import Icone from '../ui/Icone';
import { Alerta, Modal, Triagem } from '../ui/componentes';

const CLASSIFICACAO_GLASGOW = (t) => (t == null ? '' : t >= 13 ? 'TCE leve' : t >= 9 ? 'TCE moderado' : 'TCE grave');

/** Ficha completa de um atendimento, com geração do PDF e envio por e-mail (document-service). */
export default function FichaAtendimento({ id, aoFechar }) {
  const [ficha, setFicha] = useState(null);
  const [destinatario, setDestinatario] = useState('');
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api(`/atendimento/detalhe/${id}`).then((f) => {
      setFicha(f);
      setDestinatario(f.pessoa?.email || f.pessoa?.contatoEmergenciaEmail || '');
    }).catch((e) => setMsg({ tipo: 'erro', texto: e.message }));
  }, [id]);

  async function abrirPdf() {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await api(`/documento/atendimento/${id}/pdf`, { raw: true });
      const url = URL.createObjectURL(await r.blob());
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { setMsg({ tipo: 'erro', texto: e.message }); } finally { setOcupado(false); }
  }

  async function enviarEmail(e) {
    e.preventDefault();
    setOcupado(true);
    setMsg(null);
    try {
      const r = await api(`/documento/atendimento/${id}/email`, { method: 'POST', body: { destinatario } });
      setMsg({ tipo: 'sucesso', texto: `Ficha enviada para ${r.destinatario} (${r.anexo}).` });
    } catch (e2) { setMsg({ tipo: 'erro', texto: e2.message }); } finally { setOcupado(false); }
  }

  const a = ficha?.atendimento ?? {};
  const p = ficha?.pessoa ?? {};
  const pr = ficha?.prontuario ?? {};
  const prof = ficha?.profissional;
  const pa = a.paSistolica && a.paDiastolica ? `${a.paSistolica}/${a.paDiastolica}` : '—';

  return (
    <Modal titulo="Ficha de atendimento" largura="grande" aoFechar={aoFechar}
           subtitulo={ficha ? `${p.nome} · ${fmt(a.dataHora)}` : 'Carregando…'}
           rodape={ficha && (
             <form className="rodape-email" onSubmit={enviarEmail}>
               <button type="button" className="btn btn-secundario" onClick={abrirPdf} disabled={ocupado}>
                 <Icone nome="documento" /> Abrir PDF
               </button>
               <input type="email" required value={destinatario} onChange={(e) => setDestinatario(e.target.value)}
                      placeholder="E-mail do paciente ou familiar" aria-label="Destinatário" />
               <button className="btn btn-primario" disabled={ocupado}><Icone nome="email" /> Enviar por e-mail</button>
             </form>
           )}>
      <Alerta tipo={msg?.tipo}>{msg?.texto}</Alerta>
      {ficha && (
        <div className="ficha">
          <section>
            <h3>Paciente</h3>
            <dl className="detalhes">
              <dt>Nome</dt><dd><strong>{p.nome}</strong></dd>
              <dt>CPF</dt><dd>{p.cpf ?? '—'}</dd>
              <dt>Nascimento</dt><dd>{fmtData(p.dataNascimento)}</dd>
              <dt>Tipo sanguíneo</dt><dd>{pr.tipoSanguineo ?? '—'}</dd>
              <dt>Alergias</dt><dd className={pr.alergias ? 'alergia' : ''}>{pr.alergias ?? 'Nega alergias'}</dd>
              <dt>Comorbidades</dt><dd>{pr.comorbidades ?? '—'}</dd>
            </dl>
          </section>
          <section>
            <h3>Ocorrência</h3>
            <dl className="detalhes">
              <dt>Local</dt><dd>{a.localOcorrencia ?? '—'}</dd>
              <dt>Queixa</dt><dd>{a.queixaPrincipal ?? '—'}</dd>
              <dt>Triagem</dt><dd>Manchester <Triagem cor={a.triagemManchester} /> · START <Triagem cor={a.triagemStart} /></dd>
              <dt>Glasgow</dt>
              <dd>{a.glasgowOcular ?? '—'} / {a.glasgowVerbal ?? '—'} / {a.glasgowMotora ?? '—'} = <strong>{a.glasgowTotal ?? '—'}</strong> <span className="suave">{CLASSIFICACAO_GLASGOW(a.glasgowTotal)}</span></dd>
              <dt>Destino</dt><dd>{a.destino ?? '—'}</dd>
            </dl>
          </section>
          <section className="ficha-larga">
            <h3>Sinais vitais</h3>
            <div className="sinais">
              <div><span>PA</span><strong>{pa}</strong><small>mmHg</small></div>
              <div><span>FC</span><strong>{a.freqCardiaca ?? '—'}</strong><small>bpm</small></div>
              <div><span>FR</span><strong>{a.freqRespiratoria ?? '—'}</strong><small>irpm</small></div>
              <div><span>SpO₂</span><strong>{a.saturacaoO2 ?? '—'}</strong><small>%</small></div>
              <div><span>Temp.</span><strong>{fmtNum(a.temperatura)}</strong><small>°C</small></div>
              <div><span>Glicemia</span><strong>{a.glicemia ?? '—'}</strong><small>mg/dL</small></div>
            </div>
          </section>
          <section className="ficha-larga">
            <h3>Medicamentos administrados</h3>
            {ficha.medicamentos.length ? (
              <table>
                <thead><tr><th>Medicamento</th><th>Dose</th><th>Via</th><th>Horário</th></tr></thead>
                <tbody>{ficha.medicamentos.map((m) => (
                  <tr key={m.id}><td><strong>{m.nome}</strong> <small className="suave">{m.apresentacao}</small></td>
                    <td>{fmtNum(m.dose)} {m.unidade}</td><td>{m.via ?? '—'}</td><td>{fmt(m.horario)}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="suave">Nenhum medicamento administrado.</p>}
          </section>
          <section className="ficha-larga">
            <h3>Procedimentos e observações</h3>
            <p>{a.procedimentos ?? '—'}</p>
            {a.observacoes && <p className="suave">{a.observacoes}</p>}
          </section>
          <footer className="ficha-larga ficha-rodape">
            <span>Responsável: <strong>{prof?.nome ?? '—'}</strong> {prof && `(${prof.tipoRegistro} ${prof.registro}${prof.uf ? `/${prof.uf}` : ''})`}</span>
            <span>Recebido em {fmt(a.sincronizadoEm)}</span>
          </footer>
        </div>
      )}
    </Modal>
  );
}
