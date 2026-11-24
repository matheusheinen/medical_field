import { useEffect, useState } from 'react';
import { api, fmt, novoUuid } from '../api';
import Icone from '../ui/Icone';
import { Alerta, Campo, Modal } from '../ui/componentes';
import { cpfCompleto, mascararCpf } from '../ui/cpf';
import { mascararTelefone, telefoneCompleto } from '../ui/telefone';
import TabelaAtendimentos from '../ui/TabelaAtendimentos';
import FichaAtendimento from './FichaAtendimento';

const CAMPOS_PESSOA = ['nome', 'cpf', 'dataNascimento', 'sexo', 'telefone', 'email', 'contatoEmergenciaNome', 'contatoEmergenciaEmail'];
const CAMPOS_PRONTUARIO = ['tipoSanguineo', 'alergias', 'comorbidades', 'medicamentosContinuos', 'observacoes'];
const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** Copia só os campos do formulário, trocando null por '' (inputs controlados). */
const paraFormulario = (origem, campos) => Object.fromEntries(campos.map((c) => [c, origem?.[c] ?? '']));
/** Caminho inverso: '' vira null antes de enviar. */
const paraApi = (form) => Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));

/** Mensagem para cada resultado do upsert (o mesmo usado na sincronização dos dispositivos). */
function mensagem(r, oQue) {
  switch (r.status) {
    case 'CRIADO': return { tipo: 'sucesso', texto: `${oQue} cadastrado.` };
    case 'ATUALIZADO': return { tipo: 'sucesso', texto: 'Alterações salvas.' };
    case 'SEM_ALTERACAO': return { tipo: 'info', texto: 'Nenhuma alteração para salvar.' };
    case 'CONFLITO_RESOLVIDO': return {
      tipo: 'aviso',
      texto: `Este registro foi alterado por uma equipe em campo enquanto você editava. O conflito foi resolvido pela estratégia ${r.estrategia}; confira o resultado abaixo.`,
    };
    case 'VINCULADO': return {
      tipo: 'aviso',
      texto: oQue === 'Paciente'
        ? 'Já existia um paciente com este CPF. Os dados foram mesclados ao cadastro existente, que é o exibido agora.'
        : 'Este paciente já tinha prontuário. Os dados foram mesclados ao prontuário existente.',
    };
    default: return { tipo: 'info', texto: r.status };
  }
}

/**
 * Cadastro/edição de paciente e do seu prontuário.
 * Grava pelas mesmas rotas usadas pelos dispositivos (POST /pessoa e /prontuario), enviando a versão
 * que está sendo editada: se uma equipe alterou o registro nesse meio-tempo, o servidor detecta o
 * conflito e aplica a Strategy configurada (pessoa = LWW, prontuário = MERGE).
 */
export default function PacienteModal({ pessoaId: idInicial, abaInicial = 'dados', aoFechar, aoSalvar }) {
  const [pessoaId, setPessoaId] = useState(idInicial ?? null);
  const [aba, setAba] = useState(idInicial ? abaInicial : 'dados');
  const [pessoa, setPessoa] = useState(null);          // registro do servidor (com versão)
  const [prontuario, setProntuario] = useState(null);
  const [atendimentos, setAtendimentos] = useState([]);
  const [formPessoa, setFormPessoa] = useState(paraFormulario(null, CAMPOS_PESSOA));
  const [formPront, setFormPront] = useState(paraFormulario(null, CAMPOS_PRONTUARIO));
  const [msg, setMsg] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(!!idInicial);
  const [fichaAberta, setFichaAberta] = useState(null);

  useEffect(() => {
    if (!idInicial) return;
    Promise.all([
      api(`/pessoa/${idInicial}`),
      api(`/prontuario/${idInicial}`).catch(() => null),   // paciente pode ainda não ter prontuário
      api(`/atendimento/${idInicial}`),
    ]).then(([p, pr, ats]) => {
      setPessoa(p); setFormPessoa(paraFormulario(p, CAMPOS_PESSOA));
      setProntuario(pr); setFormPront(paraFormulario(pr, CAMPOS_PRONTUARIO));
      setAtendimentos(ats);
    }).catch((e) => setMsg({ tipo: 'erro', texto: e.message }))
      .finally(() => setCarregando(false));
  }, [idInicial]);

  async function gravar(caminho, corpo) {
    // Idempotency-Key: um duplo clique no botão não grava duas vezes
    return api(caminho, { method: 'POST', body: corpo, headers: { 'Idempotency-Key': novoUuid() } });
  }

  async function salvarPessoa(e) {
    e.preventDefault();
    if (!cpfCompleto(formPessoa.cpf)) { setMsg({ tipo: 'erro', texto: 'CPF incompleto: informe os 11 dígitos ou deixe o campo vazio.' }); return; }
    // só confere o telefone se foi alterado: cadastros antigos podem estar sem DDD
    if (formPessoa.telefone !== (pessoa?.telefone ?? '') && !telefoneCompleto(formPessoa.telefone)) { setMsg({ tipo: 'erro', texto: 'Telefone incompleto: informe DDD e número ou deixe o campo vazio.' }); return; }
    setSalvando(true); setMsg(null);
    try {
      const id = pessoaId ?? novoUuid();
      const r = await gravar('/pessoa', {
        ...paraApi(formPessoa), id, versao: pessoa?.versao ?? 0, atualizadoEm: new Date().toISOString(),
      });
      setPessoa(r.registro); setFormPessoa(paraFormulario(r.registro, CAMPOS_PESSOA));
      setPessoaId(r.id ?? id);   // VINCULADO: o servidor devolve o id do cadastro que já existia
      setMsg(mensagem(r, 'Paciente'));
      aoSalvar?.();
    } catch (e2) { setMsg({ tipo: 'erro', texto: e2.message }); } finally { setSalvando(false); }
  }

  async function salvarProntuario(e) {
    e.preventDefault();
    setSalvando(true); setMsg(null);
    try {
      const r = await gravar('/prontuario', {
        ...paraApi(formPront), id: prontuario?.id ?? novoUuid(), pessoaId,
        versao: prontuario?.versao ?? 0, atualizadoEm: new Date().toISOString(),
      });
      setProntuario(r.registro); setFormPront(paraFormulario(r.registro, CAMPOS_PRONTUARIO));
      setMsg(mensagem(r, 'Prontuário'));
      aoSalvar?.();
    } catch (e2) { setMsg({ tipo: 'erro', texto: e2.message }); } finally { setSalvando(false); }
  }

  const alterar = (setter) => (e) => setter((f) => ({ ...f, [e.target.name]: e.target.value }));
  const ap = alterar(setFormPessoa);
  const apr = alterar(setFormPront);
  const formId = aba === 'dados' ? 'form-pessoa' : 'form-prontuario';

  return (
    <>
      <Modal titulo={pessoaId ? (pessoa?.nome ?? 'Paciente') : 'Novo paciente'} largura="grande" aoFechar={aoFechar}
             subtitulo={pessoa && <>Atualizado em {fmt(pessoa.atualizadoEm)}</>}
             rodape={aba !== 'atendimentos' && (
               <>
                 <button type="button" className="btn btn-secundario" onClick={aoFechar}>Fechar</button>
                 <button form={formId} className="btn btn-primario" disabled={salvando || carregando}>
                   <Icone nome="check" /> {salvando ? 'Salvando…' : aba === 'dados' ? 'Salvar paciente' : 'Salvar prontuário'}
                 </button>
               </>
             )}>
        <nav className="abas" role="tablist">
          <button role="tab" aria-selected={aba === 'dados'} onClick={() => setAba('dados')}>Dados pessoais</button>
          <button role="tab" aria-selected={aba === 'prontuario'} onClick={() => setAba('prontuario')} disabled={!pessoaId}
                  title={pessoaId ? undefined : 'Salve o paciente primeiro'}>Prontuário</button>
          <button role="tab" aria-selected={aba === 'atendimentos'} onClick={() => setAba('atendimentos')} disabled={!pessoaId}>
            Atendimentos {pessoaId && <span className="contador">{atendimentos.length}</span>}
          </button>
        </nav>

        <Alerta tipo={msg?.tipo} aoFechar={() => setMsg(null)}>{msg?.texto}</Alerta>
        {carregando && <p className="suave">Carregando…</p>}

        {!carregando && aba === 'dados' && (
          <form id="form-pessoa" className="formulario" onSubmit={salvarPessoa}>
            <Campo rotulo="Nome completo" obrigatorio largo><input name="nome" value={formPessoa.nome} onChange={ap} required maxLength={120} /></Campo>
            <Campo rotulo="CPF"><input name="cpf" value={formPessoa.cpf} onChange={(e) => setFormPessoa((f) => ({ ...f, cpf: mascararCpf(e.target.value) }))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} /></Campo>
            <Campo rotulo="Data de nascimento"><input type="date" name="dataNascimento" value={formPessoa.dataNascimento} onChange={ap} /></Campo>
            <Campo rotulo="Sexo">
              <select name="sexo" value={formPessoa.sexo} onChange={ap}>
                <option value="">Não informado</option><option value="F">Feminino</option><option value="M">Masculino</option><option value="O">Outro</option>
              </select>
            </Campo>
            <Campo rotulo="Telefone"><input name="telefone" type="tel" value={formPessoa.telefone} onChange={(e) => setFormPessoa((f) => ({ ...f, telefone: mascararTelefone(e.target.value) }))} placeholder="(51) 99999-0000" inputMode="numeric" maxLength={15} /></Campo>
            <Campo rotulo="E-mail" largo><input type="email" name="email" value={formPessoa.email} onChange={ap} maxLength={120} /></Campo>
            <Campo rotulo="Contato de emergência"><input name="contatoEmergenciaNome" value={formPessoa.contatoEmergenciaNome} onChange={ap} maxLength={120} /></Campo>
            <Campo rotulo="E-mail do contato" dica="Usado para enviar a ficha de atendimento ao familiar.">
              <input type="email" name="contatoEmergenciaEmail" value={formPessoa.contatoEmergenciaEmail} onChange={ap} maxLength={120} />
            </Campo>
          </form>
        )}

        {!carregando && aba === 'prontuario' && (
          <form id="form-prontuario" className="formulario" onSubmit={salvarProntuario}>
            {!prontuario && <p className="campo-largo suave">Este paciente ainda não tem prontuário. Preencha e salve para criá-lo.</p>}
            <Campo rotulo="Tipo sanguíneo">
              <select name="tipoSanguineo" value={formPront.tipoSanguineo} onChange={apr}>
                <option value="">Não informado</option>{TIPOS_SANGUINEOS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Alergias" largo dica="Separe por vírgula. Em conflito, as alergias das duas versões são unidas: nenhuma se perde.">
              <input name="alergias" value={formPront.alergias} onChange={apr} className={formPront.alergias ? 'destaque-perigo' : ''} />
            </Campo>
            <Campo rotulo="Comorbidades" largo><input name="comorbidades" value={formPront.comorbidades} onChange={apr} /></Campo>
            <Campo rotulo="Medicamentos de uso contínuo" largo><input name="medicamentosContinuos" value={formPront.medicamentosContinuos} onChange={apr} /></Campo>
            <Campo rotulo="Observações" largo><textarea name="observacoes" value={formPront.observacoes} onChange={apr} rows={3} /></Campo>
          </form>
        )}

        {!carregando && aba === 'atendimentos' && (
          <TabelaAtendimentos lista={atendimentos} aoAbrir={(a) => setFichaAberta(a.id)} compacta />
        )}
      </Modal>
      {fichaAberta && <FichaAtendimento id={fichaAberta} aoFechar={() => setFichaAberta(null)} />}
    </>
  );
}
