import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/localDb';

export default function ListaPacientes() {
  const dados = useLiveQuery(async () => {
    const pessoas = await db.pessoas.orderBy('nome').toArray();
    const pronts = new Map((await db.prontuarios.toArray()).map((p) => [p.pessoaId, p]));
    return pessoas.map((p) => ({ ...p, prontuario: pronts.get(p.id) }));
  }, [], []);

  return (
    <section className="painel">
      <h2>Pacientes e prontuários no dispositivo <small>({dados.length})</small></h2>
      <div className="tabela-rolagem">
        <table>
          <thead><tr><th>Nome</th><th>CPF</th><th>Tipo sang.</th><th>Alergias</th><th>Comorbidades</th></tr></thead>
          <tbody>
            {dados.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td>{p.cpf ?? '—'}</td>
                <td>{p.prontuario?.tipoSanguineo ?? '—'}</td>
                <td className={p.prontuario?.alergias ? 'alergia' : ''}>{p.prontuario?.alergias ?? '—'}</td>
                <td>{p.prontuario?.comorbidades ?? '—'}</td>
              </tr>
            ))}
            {!dados.length && <tr><td colSpan="5" className="vazio">Nenhum paciente no dispositivo.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
