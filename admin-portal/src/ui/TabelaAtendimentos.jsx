import { fmt } from '../api';
import { LinhaVazia, Triagem } from './componentes';

/** Tabela de atendimentos usada na visão geral, na lista de atendimentos e no prontuário do paciente. */
export default function TabelaAtendimentos({ lista, aoAbrir, carregando, compacta = false }) {
  const colunas = compacta ? 4 : 7;
  return (
    <div className="tabela-rolagem">
      <table>
        <thead>
          <tr>
            <th>Data/hora</th>
            {!compacta && <th>Paciente</th>}
            <th>Queixa principal</th>
            <th>Manchester</th>
            {!compacta && <th>START</th>}
            <th className="num">Glasgow</th>
            {!compacta && <th>Profissional</th>}
          </tr>
        </thead>
        <tbody>
          {lista.map((a) => (
            <tr key={a.id} className={aoAbrir ? 'clicavel' : ''} onClick={() => aoAbrir?.(a)}>
              <td className="nowrap">{fmt(a.dataHora)}</td>
              {!compacta && <td><strong>{a.pessoaNome}</strong></td>}
              <td>{a.queixaPrincipal ?? <span className="suave">—</span>}</td>
              <td><Triagem cor={a.triagemManchester} /></td>
              {!compacta && <td><Triagem cor={a.triagemStart} /></td>}
              <td className="num">{a.glasgowTotal ?? '—'}</td>
              {!compacta && <td>{a.profissionalNome ?? '—'}<small className="bloco suave">{a.profissionalRegistro}</small></td>}
            </tr>
          ))}
          {!lista.length && <LinhaVazia colunas={colunas} carregando={carregando}>Nenhum atendimento encontrado.</LinhaVazia>}
        </tbody>
      </table>
    </div>
  );
}
