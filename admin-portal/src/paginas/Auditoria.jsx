import { Fragment, useState } from 'react';
import { fmt } from '../api';
import { Alerta, CabecalhoPagina, LinhaVazia, Operacao, useDados } from '../ui/componentes';

const ENTIDADES = ['pessoa', 'prontuario', 'atendimento', 'medicamento', 'profissional'];
const ORIGENS = { SYNC_PUSH: 'Sincronização', API_DIRETA: 'API', PORTAL: 'Portal' };

/** Mostra o JSON sem campos vazios, para facilitar a comparação antes × depois. */
const semVazios = (o) => (o && typeof o === 'object' && !Array.isArray(o)
  ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== '').map(([k, v]) => [k, semVazios(v)]))
  : o);

export default function Auditoria() {
  const { dados, erro, carregar, carregando, quando } = useDados(['/auditoria?limite=300']);
  const [aberto, setAberto] = useState(null);
  const [entidade, setEntidade] = useState('');
  const lista = (dados?.[0] ?? []).filter((l) => !entidade || l.entidade === entidade);

  return (
    <>
      <CabecalhoPagina titulo="Auditoria" descricao="Cada criação, alteração e conflito, com quem fez, de onde veio e os dados antes e depois."
                       carregar={carregar} carregando={carregando} quando={quando}>
        <select value={entidade} onChange={(e) => setEntidade(e.target.value)} aria-label="Entidade">
          <option value="">Todas as entidades</option>
          {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </CabecalhoPagina>
      <Alerta tipo="erro">{erro}</Alerta>
      <section className="painel painel-tabela">
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Data/hora</th><th>Entidade</th><th>Operação</th><th>Origem</th><th>Estratégia</th><th>Profissional</th><th>Dispositivo</th></tr></thead>
            <tbody>
              {lista.map((l) => (
                <Fragment key={l.id}>
                  <tr className={`clicavel ${aberto === l.id ? 'expandida' : ''}`} onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                    <td className="nowrap">{fmt(l.dataHora)}</td>
                    <td>{l.entidade}<small className="bloco suave mono">{l.entidadeId.slice(0, 8)}</small></td>
                    <td><Operacao valor={l.operacao} /></td>
                    <td>{ORIGENS[l.origem] ?? l.origem}</td>
                    <td>{l.estrategia ?? '—'}</td>
                    <td>{l.profissionalNome ?? '—'}</td>
                    <td className="mono">{l.dispositivoId ?? '—'}</td>
                  </tr>
                  {aberto === l.id && (
                    <tr className="detalhe-linha"><td colSpan="7">
                      <div className="json-duplo">
                        <div><strong>Antes</strong><pre>{l.dadosAntes ? JSON.stringify(semVazios(l.dadosAntes), null, 2) : '—'}</pre></div>
                        <div><strong>Depois</strong><pre>{l.dadosDepois ? JSON.stringify(semVazios(l.dadosDepois), null, 2) : '—'}</pre></div>
                      </div>
                      {l.opId && <small className="suave mono">opId {l.opId}</small>}
                    </td></tr>
                  )}
                </Fragment>
              ))}
              {!lista.length && <LinhaVazia colunas={7} carregando={carregando}>Nenhum registro de auditoria.</LinhaVazia>}
            </tbody>
          </table>
        </div>
        <p className="rodape-tabela">{lista.length} registro(s) · clique em uma linha para comparar antes e depois</p>
      </section>
    </>
  );
}
