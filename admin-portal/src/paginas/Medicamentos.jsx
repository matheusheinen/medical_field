import { useState } from 'react';
import { api, fmt, fmtNum, normalizarBusca } from '../api';
import Icone from '../ui/Icone';
import { Alerta, Ativo, CabecalhoPagina, Campo, CampoBusca, LinhaVazia, Modal, useDados } from '../ui/componentes';

const VIAS = ['IV', 'IM', 'SC', 'VO', 'SL', 'IN', 'Inalatória', 'Tópica'];
const VAZIO = { nome: '', principioAtivo: '', apresentacao: '', viaPadrao: '', doseMaxima: '', unidade: '' };

/** Formulário de medicamento: cria (POST) ou altera/inativa (PUT). */
function MedicamentoModal({ medicamento, aoFechar, aoSalvar }) {
  const novo = !medicamento;
  const [form, setForm] = useState(novo ? VAZIO : Object.fromEntries(Object.keys(VAZIO).map((k) => [k, medicamento[k] ?? ''])));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const alterar = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function salvar(ativo = medicamento?.ativo ?? true) {
    setSalvando(true); setErro(null);
    try {
      const corpo = { ...form, ativo };
      if (novo) await api('/medicamento', { method: 'POST', body: corpo });
      else await api(`/medicamento/${medicamento.id}`, { method: 'PUT', body: corpo });
      aoSalvar();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <Modal titulo={novo ? 'Novo medicamento' : medicamento.nome} aoFechar={aoFechar}
           subtitulo={!novo && <>Atualizado em {fmt(medicamento.atualizadoEm)} · <Ativo ativo={medicamento.ativo} /></>}
           rodape={<>
             {!novo && (medicamento.ativo
               ? <button type="button" className="btn btn-perigo-suave" disabled={salvando} onClick={() => salvar(false)}>Inativar</button>
               : <button type="button" className="btn btn-secundario" disabled={salvando} onClick={() => salvar(true)}>Reativar</button>)}
             <span className="espaco" />
             <button type="button" className="btn btn-secundario" onClick={aoFechar}>Cancelar</button>
             <button form="form-medicamento" className="btn btn-primario" disabled={salvando}><Icone nome="check" /> {salvando ? 'Salvando…' : 'Salvar'}</button>
           </>}>
      <Alerta tipo="erro">{erro}</Alerta>
      <form id="form-medicamento" className="formulario" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <Campo rotulo="Nome comercial" obrigatorio largo><input name="nome" value={form.nome} onChange={alterar} required maxLength={120} autoFocus /></Campo>
        <Campo rotulo="Princípio ativo"><input name="principioAtivo" value={form.principioAtivo} onChange={alterar} maxLength={120} /></Campo>
        <Campo rotulo="Apresentação" dica="Ex.: Ampola 10 mg/mL"><input name="apresentacao" value={form.apresentacao} onChange={alterar} maxLength={120} /></Campo>
        <Campo rotulo="Via padrão">
          <input name="viaPadrao" value={form.viaPadrao} onChange={alterar} list="vias" maxLength={30} />
          <datalist id="vias">{VIAS.map((v) => <option key={v} value={v} />)}</datalist>
        </Campo>
        <div className="campo-grupo">
          <Campo rotulo="Dose máxima" dica="Acima dela o app alerta o socorrista.">
            <input name="doseMaxima" value={form.doseMaxima} onChange={alterar} inputMode="decimal" placeholder="Ex.: 10" />
          </Campo>
          <Campo rotulo="Unidade"><input name="unidade" value={form.unidade} onChange={alterar} placeholder="mg" maxLength={10} /></Campo>
        </div>
      </form>
      {!novo && medicamento.ativo && <p className="suave">Inativar retira o medicamento das listas dos dispositivos, mas mantém o histórico dos atendimentos em que foi usado.</p>}
    </Modal>
  );
}

export default function Medicamentos() {
  const { dados, erro, carregar, carregando, quando } = useDados(['/medicamento?todos=true']);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [aberto, setAberto] = useState(null);   // { medicamento } ou { medicamento: null } para novo
  const [aviso, setAviso] = useState(null);

  const todos = dados?.[0] ?? [];
  const lista = todos
    .filter((m) => mostrarInativos || m.ativo)
    .filter((m) => !busca || normalizarBusca(`${m.nome} ${m.principioAtivo}`).includes(normalizarBusca(busca)));
  const inativos = todos.filter((m) => !m.ativo).length;

  function salvo() {
    setAberto(null);
    setAviso('Medicamento salvo. Os dispositivos recebem a alteração na próxima sincronização.');
    carregar();
  }

  return (
    <>
      <CabecalhoPagina titulo="Medicamentos" descricao="Lista usada pelas equipes para registrar medicamentos e alertar doses acima da máxima."
                       carregar={carregar} carregando={carregando} quando={quando}>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome ou princípio ativo…" />
        <button className="btn btn-primario" onClick={() => setAberto({ medicamento: null })}><Icone nome="mais" /> Novo medicamento</button>
      </CabecalhoPagina>
      <Alerta tipo="erro">{erro}</Alerta>
      <Alerta tipo="sucesso" aoFechar={() => setAviso(null)}>{aviso}</Alerta>
      <section className="painel painel-tabela">
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Nome</th><th>Apresentação</th><th>Via</th><th className="num">Dose máx.</th><th>Situação</th><th>Atualizado</th><th /></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id} className={`clicavel ${m.ativo ? '' : 'inativo'}`} onClick={() => setAberto({ medicamento: m })}>
                  <td><strong>{m.nome}</strong><small className="bloco suave">{m.principioAtivo}</small></td>
                  <td>{m.apresentacao ?? '—'}</td>
                  <td>{m.viaPadrao ?? '—'}</td>
                  <td className="num nowrap">{m.doseMaxima != null ? `${fmtNum(m.doseMaxima)} ${m.unidade ?? ''}` : '—'}</td>
                  <td><Ativo ativo={m.ativo} /></td>
                  <td className="nowrap">{fmt(m.atualizadoEm)}</td>
                  <td className="acao-linha"><Icone nome="editar" /></td>
                </tr>
              ))}
              {!lista.length && <LinhaVazia colunas={7} carregando={carregando}>Nenhum medicamento encontrado.</LinhaVazia>}
            </tbody>
          </table>
        </div>
        <div className="rodape-tabela">
          <span>{lista.length} medicamento(s)</span>
          {inativos > 0 && (
            <label className="alternar"><input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos ({inativos})</label>
          )}
        </div>
      </section>
      {aberto && <MedicamentoModal medicamento={aberto.medicamento} aoFechar={() => setAberto(null)} aoSalvar={salvo} />}
    </>
  );
}
