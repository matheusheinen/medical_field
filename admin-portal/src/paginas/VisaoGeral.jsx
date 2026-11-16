import { useState } from 'react';
import Icone from '../ui/Icone';
import { Alerta, CabecalhoPagina, useDados } from '../ui/componentes';
import TabelaAtendimentos from '../ui/TabelaAtendimentos';
import FichaAtendimento from './FichaAtendimento';

const CORES = ['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'];
const UM_DIA = 24 * 60 * 60 * 1000;

function Indicador({ icone, rotulo, valor, detalhe }) {
  return (
    <div className="indicador">
      <span className="indicador-icone"><Icone nome={icone} /></span>
      <div><span className="indicador-rotulo">{rotulo}</span><strong>{valor}</strong>{detalhe && <small>{detalhe}</small>}</div>
    </div>
  );
}

export default function VisaoGeral() {
  const { dados, erro, carregar, carregando, quando } = useDados(['/pessoa', '/atendimento', '/medicamento']);
  const [aberto, setAberto] = useState(null);
  const [pessoas, ats, meds] = dados ?? [[], [], []];

  const agora = Date.now();
  const ultimas24h = ats.filter((a) => agora - new Date(a.dataHora).getTime() < UM_DIA).length;
  const offline = ats.filter((a) => a.criadoOffline).length;
  const porCor = Object.fromEntries(CORES.map((c) => [c, ats.filter((a) => a.triagemManchester === c).length]));
  const comTriagem = Object.values(porCor).reduce((s, n) => s + n, 0);
  const recentes = [...ats].sort((a, b) => (b.sincronizadoEm ?? '').localeCompare(a.sincronizadoEm ?? '')).slice(0, 6);

  return (
    <>
      <CabecalhoPagina titulo="Visão geral" descricao="Resumo dos atendimentos consolidados no servidor central."
                       carregar={carregar} carregando={carregando} quando={quando} />
      <Alerta tipo="erro">{erro}</Alerta>

      <div className="indicadores">
        <Indicador icone="atividade" rotulo="Atendimentos" valor={ats.length} detalhe={`${ultimas24h} nas últimas 24 h`} />
        <Indicador icone="semSinal" rotulo="Registrados sem sinal" valor={offline} detalhe="recebidos por sincronização" />
        <Indicador icone="pessoas" rotulo="Pacientes" valor={pessoas.length} />
        <Indicador icone="pilula" rotulo="Medicamentos ativos" valor={meds.length} />
      </div>

      <section className="painel">
        <div className="painel-titulo"><h2>Classificação de risco (Manchester)</h2><span className="suave">{comTriagem} atendimento(s) classificados</span></div>
        <div className="barra-risco" role="img" aria-label="Distribuição por cor de risco">
          {CORES.filter((c) => porCor[c]).map((c) => (
            <span key={c} className={`triagem-${c.toLowerCase()}`} style={{ flexGrow: porCor[c] }} title={`${c}: ${porCor[c]}`} />
          ))}
          {!comTriagem && <span className="barra-vazia" />}
        </div>
        <ul className="legenda-risco">
          {CORES.map((c) => <li key={c}><i className={`triagem-${c.toLowerCase()}`} /> {c.charAt(0) + c.slice(1).toLowerCase()} <strong>{porCor[c]}</strong></li>)}
        </ul>
      </section>

      <section className="painel">
        <div className="painel-titulo"><h2>Recebidos recentemente</h2></div>
        <TabelaAtendimentos lista={recentes} aoAbrir={(a) => setAberto(a.id)} carregando={carregando} />
      </section>
      {aberto && <FichaAtendimento id={aberto} aoFechar={() => setAberto(null)} />}
    </>
  );
}
