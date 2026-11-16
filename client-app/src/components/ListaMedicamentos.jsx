import { useLiveQuery } from 'dexie-react-hooks';
import { LocalRepository as local } from '../repositories/LocalRepository';
import { formatarDataHora } from '../util/uuid';

export default function ListaMedicamentos() {
  const meds = useLiveQuery(() => local.listarMedicamentos(), [], []);
  return (
    <section className="painel">
      <h2>Medicamentos disponíveis no aparelho <small>({meds.length})</small></h2>
      <div className="tabela-rolagem">
        <table>
          <thead><tr><th>Nome</th><th>Princípio ativo</th><th>Apresentação</th><th>Via</th><th>Dose máx.</th><th>Atualizado no servidor</th></tr></thead>
          <tbody>
            {meds.map((m) => (
              <tr key={m.id}>
                <td>{m.nome}</td><td>{m.principioAtivo ?? '—'}</td><td>{m.apresentacao ?? '—'}</td>
                <td>{m.viaPadrao ?? '—'}</td><td>{m.doseMaxima ?? '—'} {m.unidade}</td><td>{formatarDataHora(m.atualizadoEm)}</td>
              </tr>
            ))}
            {!meds.length && <tr><td colSpan="6" className="vazio">Nenhum medicamento no aparelho. Use “Receber dados” com conexão.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
