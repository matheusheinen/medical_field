import { useEffect, useState } from 'react';
import { sessao } from './api';
import Icone from './ui/Icone';
import Login from './paginas/Login';
import VisaoGeral from './paginas/VisaoGeral';
import Atendimentos from './paginas/Atendimentos';
import Prontuarios from './paginas/Prontuarios';
import Pacientes from './paginas/Pacientes';
import Medicamentos from './paginas/Medicamentos';
import Profissionais from './paginas/Profissionais';
import Auditoria from './paginas/Auditoria';
import Logs from './paginas/Logs';

/** Menu lateral: cada item vira uma rota "#/id". */
const MENU = [
  { grupo: null, itens: [{ id: 'geral', rotulo: 'Visão geral', icone: 'painel', Pagina: VisaoGeral }] },
  { grupo: 'Registros clínicos', itens: [
    { id: 'atendimentos', rotulo: 'Atendimentos', icone: 'atividade', Pagina: Atendimentos },
    { id: 'prontuarios', rotulo: 'Prontuários', icone: 'prancheta', Pagina: Prontuarios },
  ] },
  { grupo: 'Cadastros', itens: [
    { id: 'pacientes', rotulo: 'Pacientes', icone: 'pessoas', Pagina: Pacientes },
    { id: 'medicamentos', rotulo: 'Medicamentos', icone: 'pilula', Pagina: Medicamentos },
    { id: 'profissionais', rotulo: 'Profissionais', icone: 'cracha', Pagina: Profissionais },
  ] },
  { grupo: 'Rastreabilidade', itens: [
    { id: 'auditoria', rotulo: 'Auditoria', icone: 'escudo', Pagina: Auditoria },
    { id: 'logs', rotulo: 'Logs de acesso', icone: 'lista', Pagina: Logs },
  ] },
];
const PAGINAS = MENU.flatMap((g) => g.itens);

/** Página atual guardada no endereço (#/atendimentos): sobrevive ao recarregar. */
function useRota() {
  const ler = () => window.location.hash.replace(/^#\/?/, '') || 'geral';
  const [rota, setRota] = useState(ler);
  useEffect(() => {
    const aoMudar = () => setRota(ler());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return [rota, (id) => { window.location.hash = `/${id}`; }];
}

export default function App() {
  const [usuario, setUsuario] = useState(sessao.obter());
  const [rota, navegar] = useRota();

  if (!usuario) return <Login aoEntrar={setUsuario} />;

  const atual = PAGINAS.find((p) => p.id === rota) ?? PAGINAS[0];
  const { Pagina } = atual;
  const iniciais = usuario.profissional.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  return (
    <div className="layout">
      <aside className="lateral">
        <div className="marca">
          <img src="/admin/icon.svg" width="32" height="32" alt="" />
          <div><strong>MedicalField</strong><small>Portal administrativo</small></div>
        </div>
        <nav aria-label="Menu principal">
          {MENU.map((g, i) => (
            <div key={i} className="menu-grupo">
              {g.grupo && <span className="menu-titulo">{g.grupo}</span>}
              {g.itens.map((item) => (
                <button key={item.id} className={`menu-item ${item.id === atual.id ? 'ativo' : ''}`}
                        aria-current={item.id === atual.id ? 'page' : undefined} onClick={() => navegar(item.id)}>
                  <Icone nome={item.icone} /> {item.rotulo}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="usuario">
          <span className="avatar">{iniciais}</span>
          <div className="usuario-info"><strong>{usuario.profissional.nome}</strong><small>Administrador</small></div>
          <button className="btn-icone" title="Sair" aria-label="Sair" onClick={() => { sessao.sair(); setUsuario(null); }}>
            <Icone nome="sair" />
          </button>
        </div>
      </aside>
      <main className="principal">
        <Pagina key={atual.id} />
      </main>
    </div>
  );
}
