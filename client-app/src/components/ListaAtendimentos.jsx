import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { LocalRepository as local } from '../repositories/LocalRepository';
import { abrirFichaPdf, enviarFichaPorEmail } from '../services/AtendimentoService';
import { useConectividade } from '../hooks';
import { formatarDataHora } from '../util/uuid';

export default function ListaAtendimentos() {
  const { online } = useConectividade();
  const dados = useLiveQuery(() => local.listarAtendimentosComPessoa(), [], []);
  const [email, setEmail] = useState(null);       // { atendimento, destinatario, mensagem }
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  async function pdf(a) {
    setAviso(null); setOcupado(a.id);
    try { await abrirFichaPdf(a.id); }
    catch (e) { setAviso({ tipo: 'erro', texto: e.message }); }
    finally { setOcupado(null); }
  }

  async function enviar(e) {
    e.preventDefault();
    setOcupado(email.atendimento.id);
    try {
      const r = await enviarFichaPorEmail(email.atendimento.id, email.destinatario, email.mensagem);
      setAviso({ tipo: 'sucesso', texto: `Ficha enviada para ${r.destinatario} (${r.via === 'SMTP' ? 'via SMTP' : 'gravada em ' + r.arquivo}).` });
      setEmail(null);
    } catch (e2) {
      setAviso({ tipo: 'erro', texto: e2.message });
    } finally { setOcupado(null); }
  }

  const podeDocumento = (a) => online && a.syncStatus !== 'PENDENTE' && a.syncStatus !== 'ERRO';

  return (
    <section className="painel">
      <h2>Atendimentos no dispositivo <small>({dados.length})</small></h2>
      {aviso && <div className={`alerta ${aviso.tipo}`}>{aviso.texto}</div>}
      <div className="tabela-rolagem">
        <table className="tabela-cartoes">
          <thead>
            <tr><th>Data/hora</th><th>Paciente</th><th>Queixa</th><th>Manchester</th><th>Glasgow</th><th>Ficha</th></tr>
          </thead>
          <tbody>
            {dados.map((a) => (
              <tr key={a.id}>
                <td data-label="Data/hora">{formatarDataHora(a.dataHora)}</td>
                <td className="destaque">{a.pessoa?.nome ?? '—'}</td>
                <td data-label="Queixa">{a.queixaPrincipal ?? '—'}</td>
                <td data-label="Manchester">{a.triagemManchester ? <span className={`tri ${a.triagemManchester.toLowerCase()}`}>{a.triagemManchester}</span> : '—'}</td>
                <td data-label="Glasgow">{a.glasgowTotal ?? '—'}</td>
                <td className="acoes">
                  <button disabled={!podeDocumento(a) || ocupado === a.id} onClick={() => pdf(a)}
                          title={podeDocumento(a) ? 'Gerar PDF' : 'Disponível após sincronizar e com conexão'}>PDF</button>
                  <button disabled={!podeDocumento(a) || ocupado === a.id}
                          onClick={() => setEmail({ atendimento: a, destinatario: a.pessoa?.email || a.pessoa?.contatoEmergenciaEmail || '', mensagem: '' })}>
                    E-mail
                  </button>
                </td>
              </tr>
            ))}
            {!dados.length && <tr><td colSpan="6" className="vazio">Nenhum atendimento ainda. Use “Receber dados” ou registre uma ocorrência.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="dica">A ficha em PDF é gerada pelo servidor central (document-service), por isso exige conexão e atendimento já sincronizado.</p>

      {email && (
        <div className="modal-fundo" onClick={() => setEmail(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
            <h3>Enviar ficha por e-mail</h3>
            <p>Paciente: <b>{email.atendimento.pessoa?.nome}</b></p>
            <label className="campo largo"><span>Destinatário (paciente ou familiar)</span>
              <input type="email" required value={email.destinatario} onChange={(e) => setEmail({ ...email, destinatario: e.target.value })} />
            </label>
            <div className="linha">
              {email.atendimento.pessoa?.email && <button type="button" className="discreto" onClick={() => setEmail({ ...email, destinatario: email.atendimento.pessoa.email })}>Paciente</button>}
              {email.atendimento.pessoa?.contatoEmergenciaEmail && <button type="button" className="discreto" onClick={() => setEmail({ ...email, destinatario: email.atendimento.pessoa.contatoEmergenciaEmail })}>Familiar</button>}
            </div>
            <label className="campo largo"><span>Mensagem (opcional)</span>
              <textarea rows={3} value={email.mensagem} onChange={(e) => setEmail({ ...email, mensagem: e.target.value })} />
            </label>
            <div className="rodape-form">
              <button type="button" onClick={() => setEmail(null)}>Cancelar</button>
              <button className="primario" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar com PDF anexo'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
