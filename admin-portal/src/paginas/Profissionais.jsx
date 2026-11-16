import { useState } from 'react';
import { api, fmt, normalizarBusca, sessao } from '../api';
import Icone from '../ui/Icone';
import { Alerta, Ativo, CabecalhoPagina, Campo, CampoBusca, LinhaVazia, Modal, useDados } from '../ui/componentes';

const TIPOS = { CRM: 'CRM (médico)', COREN: 'COREN (enfermagem)', SOC: 'ID de socorrista', ADM: 'Administrador do portal' };
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

/** Formulário de profissional: cadastra (POST) ou altera/inativa/redefine senha (PUT). */
function ProfissionalModal({ profissional, aoFechar, aoSalvar }) {
  const novo = !profissional;
  const souEu = profissional?.id === sessao.obter()?.profissional.id;
  const [form, setForm] = useState({
    tipoRegistro: profissional?.tipoRegistro ?? 'CRM', registro: profissional?.registro ?? '',
    nome: profissional?.nome ?? '', uf: profissional?.uf ?? '', email: profissional?.email ?? '',
    senha: '', confirmacao: '',
  });
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const alterar = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const ehAdmin = form.tipoRegistro === 'ADM';

  async function salvar(ativo = profissional?.ativo ?? true) {
    setErro(null);
    if (form.senha !== form.confirmacao) { setErro('A confirmação não confere com a senha.'); return; }
    setSalvando(true);
    try {
      const { confirmacao, ...corpo } = form;
      if (!corpo.senha) delete corpo.senha;      // na edição, senha em branco = mantém a atual
      if (novo) await api('/auth/profissional', { method: 'POST', body: corpo });
      else await api(`/auth/profissional/${profissional.id}`, { method: 'PUT', body: { ...corpo, ativo } });
      aoSalvar();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <Modal titulo={novo ? 'Novo profissional' : profissional.nome} aoFechar={aoFechar}
           subtitulo={!novo && <>{profissional.tipoRegistro} {profissional.registro} · cadastrado em {fmt(profissional.criadoEm)} · <Ativo ativo={profissional.ativo} /></>}
           rodape={<>
             {!novo && !souEu && (profissional.ativo
               ? <button type="button" className="btn btn-perigo-suave" disabled={salvando} onClick={() => salvar(false)}>Inativar acesso</button>
               : <button type="button" className="btn btn-secundario" disabled={salvando} onClick={() => salvar(true)}>Reativar acesso</button>)}
             <span className="espaco" />
             <button type="button" className="btn btn-secundario" onClick={aoFechar}>Cancelar</button>
             <button form="form-profissional" className="btn btn-primario" disabled={salvando}><Icone nome="check" /> {salvando ? 'Salvando…' : 'Salvar'}</button>
           </>}>
      <Alerta tipo="erro">{erro}</Alerta>
      <form id="form-profissional" className="formulario" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <Campo rotulo="Tipo de registro" obrigatorio dica={novo ? (ehAdmin ? 'Acessa o portal administrativo.' : 'Acessa o app de atendimento.') : 'Não pode ser alterado.'}>
          <select name="tipoRegistro" value={form.tipoRegistro} onChange={alterar} disabled={!novo}>
            {Object.entries(TIPOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
        <Campo rotulo={ehAdmin ? 'Usuário' : 'Número do registro'} obrigatorio dica={novo ? undefined : 'Identifica o profissional nos logs e na auditoria.'}>
          <input name="registro" value={form.registro} onChange={alterar} required disabled={!novo} maxLength={30} />
        </Campo>
        <Campo rotulo="Nome completo" obrigatorio largo><input name="nome" value={form.nome} onChange={alterar} required maxLength={120} /></Campo>
        <Campo rotulo="UF do conselho">
          <select name="uf" value={form.uf} onChange={alterar}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
        </Campo>
        <Campo rotulo="E-mail"><input type="email" name="email" value={form.email} onChange={alterar} maxLength={120} /></Campo>
        <Campo rotulo={novo ? 'Senha' : 'Nova senha'} obrigatorio={novo} dica={novo ? 'Mínimo de 8 caracteres.' : 'Deixe em branco para manter a senha atual.'}>
          <input type="password" name="senha" value={form.senha} onChange={alterar} required={novo} minLength={8} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Confirmar senha" obrigatorio={novo || !!form.senha}>
          <input type="password" name="confirmacao" value={form.confirmacao} onChange={alterar} required={novo || !!form.senha} autoComplete="new-password" />
        </Campo>
      </form>
      {!novo && profissional.ativo && !souEu && (
        <p className="suave">Inativar impede novos logins. Os atendimentos já registrados por este profissional continuam no histórico.</p>
      )}
    </Modal>
  );
}

export default function Profissionais() {
  const { dados, erro, carregar, carregando, quando } = useDados(['/auth/profissional']);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null);
  const [aviso, setAviso] = useState(null);

  const lista = (dados?.[0] ?? []).filter((p) => !busca || normalizarBusca(`${p.nome} ${p.tipoRegistro} ${p.registro}`).includes(normalizarBusca(busca)));

  function salvo() {
    setAberto(null);
    setAviso('Profissional salvo.');
    carregar();
  }

  return (
    <>
      <CabecalhoPagina titulo="Profissionais" descricao="Médicos, enfermeiros, socorristas e administradores com acesso ao sistema."
                       carregar={carregar} carregando={carregando} quando={quando}>
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome ou registro…" />
        <button className="btn btn-primario" onClick={() => setAberto({ profissional: null })}><Icone nome="mais" /> Novo profissional</button>
      </CabecalhoPagina>
      <Alerta tipo="erro">{erro}</Alerta>
      <Alerta tipo="sucesso" aoFechar={() => setAviso(null)}>{aviso}</Alerta>
      <section className="painel painel-tabela">
        <div className="tabela-rolagem">
          <table>
            <thead><tr><th>Nome</th><th>Registro</th><th>Acesso</th><th>E-mail</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={`clicavel ${p.ativo ? '' : 'inativo'}`} onClick={() => setAberto({ profissional: p })}>
                  <td><strong>{p.nome}</strong></td>
                  <td className="nowrap">{p.tipoRegistro} {p.registro}{p.uf && `/${p.uf}`}</td>
                  <td><span className={`selo ${p.perfil === 'ADMIN' ? 'selo-roxo' : 'selo-info'}`}>{p.perfil === 'ADMIN' ? 'Portal' : 'App de atendimento'}</span></td>
                  <td>{p.email ?? '—'}</td>
                  <td><Ativo ativo={p.ativo} /></td>
                  <td className="acao-linha"><Icone nome="editar" /></td>
                </tr>
              ))}
              {!lista.length && <LinhaVazia colunas={6} carregando={carregando}>Nenhum profissional encontrado.</LinhaVazia>}
            </tbody>
          </table>
        </div>
        <p className="rodape-tabela">{lista.length} profissional(is)</p>
      </section>
      {aberto && <ProfissionalModal profissional={aberto.profissional} aoFechar={() => setAberto(null)} aoSalvar={salvo} />}
    </>
  );
}
