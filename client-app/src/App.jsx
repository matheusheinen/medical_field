import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSessao } from './hooks';
import Login from './components/Login';
import Cabecalho from './components/Cabecalho';
import NovaOcorrencia from './components/NovaOcorrencia';
import ListaAtendimentos from './components/ListaAtendimentos';
import ListaPacientes from './components/ListaPacientes';
import ListaMedicamentos from './components/ListaMedicamentos';
import PainelSync from './components/PainelSync';
import Icone from './components/Icone';
import { LocalRepository as local } from './repositories/LocalRepository';

const ABAS = [
  { id: 'nova', rotulo: 'Nova ocorrência', icone: 'mais' },
  { id: 'atendimentos', rotulo: 'Atendimentos', icone: 'atividade' },
  { id: 'pacientes', rotulo: 'Pacientes', icone: 'pessoas' },
  { id: 'medicamentos', rotulo: 'Medicamentos', icone: 'pilula' },
  { id: 'sync', rotulo: 'Sincronização', icone: 'sincronizar' },
];

export default function App() {
  const s = useSessao();
  const [aba, setAba] = useState('nova');
  const [reautenticar, setReautenticar] = useState(false);
  const pendentes = useLiveQuery(() => local.contarPendentes(), [], 0);

  if (!s) return <Login />;
  // token vencido: só a senha é pedida de novo; o app continua usável sem isso (offline)
  if (reautenticar) return <Login reautenticar={s.profissional} aoCancelar={() => setReautenticar(false)} />;

  return (
    <div className="app">
      <Cabecalho s={s} pendentes={pendentes} aoReautenticar={() => setReautenticar(true)} aoVerSincronizacao={() => setAba('sync')} />
      <nav className="abas" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id}
                  className={aba === a.id ? 'aba ativa' : 'aba'} onClick={() => setAba(a.id)}>
            <Icone nome={a.icone} /> {a.rotulo}
            {a.id === 'sync' && pendentes > 0 && <span className="contador">{pendentes}</span>}
          </button>
        ))}
      </nav>
      <main className="conteudo">
        {aba === 'nova' && <NovaOcorrencia profissional={s.profissional} aoConcluir={() => setAba('atendimentos')} />}
        {aba === 'atendimentos' && <ListaAtendimentos />}
        {aba === 'pacientes' && <ListaPacientes />}
        {aba === 'medicamentos' && <ListaMedicamentos />}
        {aba === 'sync' && <PainelSync />}
      </main>
    </div>
  );
}
