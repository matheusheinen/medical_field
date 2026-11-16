import { useState } from 'react';
import { normalizarBusca } from '../api';
import { Alerta, CabecalhoPagina, CampoBusca, useDados } from '../ui/componentes';
import TabelaAtendimentos from '../ui/TabelaAtendimentos';
import FichaAtendimento from './FichaAtendimento';

export default function Atendimentos() {
  const { dados, erro, carregar, carregando, quando } = useDados(['/atendimento']);
  const [aberto, setAberto] = useState(null);
  const [busca, setBusca] = useState('');

  const lista = (dados?.[0] ?? [])
    .filter((a) => !busca || normalizarBusca(`${a.pessoaNome} ${a.queixaPrincipal} ${a.localOcorrencia}`).includes(normalizarBusca(busca)));

  return (
    <>
      <CabecalhoPagina titulo="Atendimentos" descricao="Fichas recebidas das equipes. Clique em uma linha para ver a ficha, gerar o PDF ou enviar por e-mail."
                       carregar={carregar} carregando={carregando} quando={quando}>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Paciente, queixa ou local…" />
      </CabecalhoPagina>
      <Alerta tipo="erro">{erro}</Alerta>
      <section className="painel painel-tabela">
        <TabelaAtendimentos lista={lista} aoAbrir={(a) => setAberto(a.id)} carregando={carregando} />
        <p className="rodape-tabela">{lista.length} atendimento(s)</p>
      </section>
      {aberto && <FichaAtendimento id={aberto} aoFechar={() => setAberto(null)} />}
    </>
  );
}
