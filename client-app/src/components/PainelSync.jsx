import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';
import { LocalRepository as local } from '../repositories/LocalRepository';
import { dispositivoId } from '../services/sessao';
import { formatarDataHora } from '../util/uuid';

export default function PainelSync() {
  const outbox = useLiveQuery(() => local.listarOutbox(), [], []);
  const logs = useLiveQuery(() => db.logs.orderBy('dataHora').reverse().limit(30).toArray(), [], []);
  const historico = useLiveQuery(() => local.listarHistorico(), [], []);
  const ultimoPull = useLiveQuery(() => local.meta('ultimoPull'), [], null);

  return (
    <>
      <section className="painel">
        <h2>Fila de envio (Outbox) <small>({outbox.length})</small></h2>
        <p className="dica">Dispositivo <code>{dispositivoId()}</code> · último recebimento do portal: {formatarDataHora(ultimoPull)}</p>
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>#</th><th>Entidade</th><th>opId (idempotência)</th><th>Versão-base</th><th>Criado em</th><th>Status</th></tr></thead>
            <tbody>
              {outbox.map((o) => (
                <tr key={o.seq}>
                  <td>{o.seq}</td><td>{o.entidade}</td><td><code>{o.opId}</code></td><td>{o.dados.versao}</td>
                  <td>{formatarDataHora(o.criadoEm)}</td>
                  <td><span className={`selo ${o.status.toLowerCase()}`}>{o.status}</span>{o.mensagem && <div className="erro-txt">{o.mensagem}</div>}</td>
                </tr>
              ))}
              {!outbox.length && <tr><td colSpan="6" className="vazio">Nada pendente: o dispositivo está em dia com o servidor.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="painel">
        <h2>Histórico de sincronizações</h2>
        <ul className="historico">
          {historico.map((h) => (
            <li key={h.id}>
              <b>{formatarDataHora(h.dataHora)}</b> · {h.tipo} · {h.motivo}
              {h.enviados !== undefined && <> — enviados: {h.enviados} {Object.entries(h.porStatus ?? {}).map(([k, v]) => <span key={k} className={`selo ${k.toLowerCase()}`}>{k}: {v}</span>)}</>}
              {h.recebidos && <> — recebidos: {h.recebidos.medicamentos} med., {h.recebidos.pessoas} pess., {h.recebidos.prontuarios} pront., {h.recebidos.atendimentos} atend.</>}
              {h.logs > 0 && <> — {h.logs} log(s) offline</>}
              {h.conflitos?.map((c) => <div key={c.id} className="conflito">Conflito em {c.entidade} {c.id.slice(0, 8)} resolvido por <b>{c.estrategia}</b></div>)}
              {h.vinculados?.map((v) => <div key={v.de} className="conflito">{v.entidade === 'pessoa' ? `Paciente ${v.nome ?? ''} já estava cadastrado no servidor (mesmo CPF)` : 'Prontuário já existia no servidor'}: <b>vinculado</b> ao cadastro existente e dados mesclados</div>)}
              {h.erros?.map((e) => <div key={e.id} className="erro-txt">Erro em {e.entidade}: {e.mensagem}</div>)}
            </li>
          ))}
          {!historico.length && <li className="vazio">Nenhuma sincronização ainda.</li>}
        </ul>
      </section>

      <section className="painel">
        <h2>Registro de operações sem conexão</h2>
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Data/hora</th><th>Método</th><th>Rota</th><th>Status</th><th>Tempo</th><th>Enviado (POST /log)</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}><td>{formatarDataHora(l.dataHora)}</td><td>{l.metodo}</td><td>{l.rota}</td><td>{l.statusCode}</td><td>{l.tempoMs} ms</td><td>{l.enviado ? 'sim' : 'não'}</td></tr>
              ))}
              {!logs.length && <tr><td colSpan="6" className="vazio">Sem logs offline.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
