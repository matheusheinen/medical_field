import { useState } from 'react';
import { fmt, normalizarBusca } from '../api';
import { Alerta, CabecalhoPagina, CampoBusca, LinhaVazia, useDados } from '../ui/componentes';
import PacienteModal from './PacienteModal';

export default function Prontuarios() {
  const { dados, erro, carregar, carregando, quando } = useDados(['/prontuario']);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null);

  const lista = (dados?.[0] ?? []).filter((p) => !busca || normalizarBusca(`${p.pessoaNome} ${p.alergias} ${p.comorbidades}`).includes(normalizarBusca(busca)));

  return (
    <>
      <CabecalhoPagina titulo="Prontuários" descricao="Histórico clínico de cada paciente. Clique para editar ou ver os atendimentos."
                       carregar={carregar} carregando={carregando} quando={quando}>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Paciente, alergia, comorbidade…" />
      </CabecalhoPagina>
      <Alerta tipo="erro">{erro}</Alerta>
      <section className="painel painel-tabela">
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Paciente</th><th>Tipo sang.</th><th>Alergias</th><th>Comorbidades</th><th>Atualizado</th></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => setAberto(p.pessoaId)}>
                  <td><strong>{p.pessoaNome}</strong><small className="bloco suave">{p.pessoaCpf ?? 'sem CPF'}</small></td>
                  <td>{p.tipoSanguineo ?? '—'}</td>
                  <td className={p.alergias ? 'alergia' : 'suave'}>{p.alergias ?? 'Nega'}</td>
                  <td>{p.comorbidades ?? '—'}</td>
                  <td className="nowrap">{fmt(p.atualizadoEm)}</td>
                </tr>
              ))}
              {!lista.length && <LinhaVazia colunas={5} carregando={carregando}>Nenhum prontuário encontrado.</LinhaVazia>}
            </tbody>
          </table>
        </div>
        <p className="rodape-tabela">{lista.length} prontuário(s)</p>
      </section>
      {aberto && <PacienteModal pessoaId={aberto} abaInicial="prontuario" aoFechar={() => setAberto(null)} aoSalvar={carregar} />}
    </>
  );
}
