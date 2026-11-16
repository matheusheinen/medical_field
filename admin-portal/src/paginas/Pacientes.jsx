import { useState } from 'react';
import { fmtData, normalizarBusca } from '../api';
import Icone from '../ui/Icone';
import { Alerta, CabecalhoPagina, CampoBusca, LinhaVazia, useDados } from '../ui/componentes';
import PacienteModal from './PacienteModal';

const soDigitos = (s) => (s ?? '').replace(/\D/g, '');

export default function Pacientes() {
  const { dados, erro, carregar, carregando, quando } = useDados(['/pessoa']);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null);   // { id } existente ou { id: null } novo

  const lista = (dados?.[0] ?? []).filter((p) => {
    if (!busca) return true;
    const q = normalizarBusca(busca);
    return normalizarBusca(p.nome).includes(q) || (soDigitos(busca) && soDigitos(p.cpf).includes(soDigitos(busca)));
  });

  return (
    <>
      <CabecalhoPagina titulo="Pacientes" descricao="Cadastro de pacientes. Alterações chegam aos dispositivos na próxima sincronização."
                       carregar={carregar} carregando={carregando} quando={quando}>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome ou CPF…" />
        <button className="btn btn-primario" onClick={() => setAberto({ id: null })}><Icone nome="mais" /> Novo paciente</button>
      </CabecalhoPagina>
      <Alerta tipo="erro">{erro}</Alerta>
      <section className="painel painel-tabela">
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Contato de emergência</th><th className="num">Atendimentos</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => setAberto({ id: p.id })}>
                  <td><strong>{p.nome}</strong>{p.email && <small className="bloco suave">{p.email}</small>}</td>
                  <td className="nowrap">{p.cpf ?? '—'}</td>
                  <td>{fmtData(p.dataNascimento)}</td>
                  <td>{p.contatoEmergenciaNome ?? '—'}{p.contatoEmergenciaEmail && <small className="bloco suave">{p.contatoEmergenciaEmail}</small>}</td>
                  <td className="num">{p.totalAtendimentos}</td>
                  <td className="acao-linha"><Icone nome="editar" /></td>
                </tr>
              ))}
              {!lista.length && <LinhaVazia colunas={6} carregando={carregando}>Nenhum paciente encontrado.</LinhaVazia>}
            </tbody>
          </table>
        </div>
        <p className="rodape-tabela">{lista.length} paciente(s)</p>
      </section>
      {aberto && <PacienteModal pessoaId={aberto.id} aoFechar={() => setAberto(null)} aoSalvar={carregar} />}
    </>
  );
}
