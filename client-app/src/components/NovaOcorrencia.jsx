import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { LocalRepository as local } from '../repositories/LocalRepository';
import { registrarOcorrencia } from '../services/AtendimentoService';
import { useConectividade } from '../hooks';
import { cpfCompleto, mascararCpf } from '../util/cpf';

const GLASGOW = {
  glasgowOcular: ['Ausente', 'À dor', 'À voz', 'Espontânea'],
  glasgowVerbal: ['Ausente', 'Sons incompreensíveis', 'Palavras inapropriadas', 'Confuso', 'Orientado'],
  glasgowMotora: ['Ausente', 'Extensão anormal', 'Flexão anormal', 'Retirada à dor', 'Localiza dor', 'Obedece comandos'],
};
const MANCHESTER = [
  ['VERMELHO', 'Emergência'], ['LARANJA', 'Muito urgente'], ['AMARELO', 'Urgente'], ['VERDE', 'Pouco urgente'], ['AZUL', 'Não urgente'],
];
const START = [['VERMELHO', 'Imediato'], ['AMARELO', 'Tardio'], ['VERDE', 'Leve'], ['PRETO', 'Óbito/expectante']];

const pessoaVazia = { nome: '', cpf: '', dataNascimento: '', sexo: '', telefone: '', email: '', contatoEmergenciaNome: '', contatoEmergenciaEmail: '' };
const prontuarioVazio = { tipoSanguineo: '', alergias: '', comorbidades: '', medicamentosContinuos: '', observacoes: '' };
const localAgora = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const atendimentoVazio = () => ({
  dataHora: localAgora(), localOcorrencia: '', queixaPrincipal: '',
  paSistolica: '', paDiastolica: '', freqCardiaca: '', freqRespiratoria: '', saturacaoO2: '', temperatura: '', glicemia: '',
  glasgowOcular: '', glasgowVerbal: '', glasgowMotora: '',
  triagemManchester: '', triagemStart: '', procedimentos: '', observacoes: '', destino: '',
});

function Campo({ rotulo, children, largo }) {
  return <label className={largo ? 'campo largo' : 'campo'}><span>{rotulo}</span>{children}</label>;
}

export default function NovaOcorrencia({ profissional, aoConcluir }) {
  const { online } = useConectividade();
  const pessoas = useLiveQuery(() => local.listarPessoas(), [], []);
  const medicamentos = useLiveQuery(() => local.listarMedicamentos(), [], []);

  const [busca, setBusca] = useState('');
  const [pessoa, setPessoa] = useState(pessoaVazia);
  const [prontuario, setProntuario] = useState(prontuarioVazio);
  const [at, setAt] = useState(atendimentoVazio);
  const [meds, setMeds] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    return pessoas.filter((p) => p.nome.toLowerCase().includes(q) || (p.cpf ?? '').includes(q)).slice(0, 6);
  }, [busca, pessoas]);

  const glasgowTotal = at.glasgowOcular && at.glasgowVerbal && at.glasgowMotora
    ? Number(at.glasgowOcular) + Number(at.glasgowVerbal) + Number(at.glasgowMotora) : null;

  async function selecionarPessoa(p) {
    const pr = await local.prontuarioDaPessoa(p.id);
    setPessoa({ ...pessoaVazia, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])) });
    setProntuario(pr ? { ...prontuarioVazio, ...Object.fromEntries(Object.entries(pr).map(([k, v]) => [k, v ?? ''])) } : prontuarioVazio);
    setBusca('');
  }

  function novoPaciente() {
    setPessoa(pessoaVazia);
    setProntuario(prontuarioVazio);
  }

  const alterar = (setter) => (e) => setter((o) => ({ ...o, [e.target.name]: e.target.value }));

  function adicionarMed() {
    setMeds((m) => [...m, { medicamentoId: '', dose: '', unidade: '', via: '', horario: localAgora() }]);
  }
  function alterarMed(i, campo, valor) {
    setMeds((lista) => lista.map((m, j) => {
      if (j !== i) return m;
      const novo = { ...m, [campo]: valor };
      if (campo === 'medicamentoId') {
        const ref = medicamentos.find((x) => x.id === valor);
        novo.unidade = ref?.unidade ?? '';
        novo.via = ref?.viaPadrao ?? '';
      }
      return novo;
    }));
  }
  const doseExcessiva = (m) => {
    const ref = medicamentos.find((x) => x.id === m.medicamentoId);
    return ref?.doseMaxima && m.dose !== '' && Number(m.dose) > Number(ref.doseMaxima) ? ref : null;
  };

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    if (!cpfCompleto(pessoa.cpf)) { setErro('CPF incompleto: informe os 11 dígitos ou deixe o campo vazio.'); return; }
    const alertas = meds.map(doseExcessiva).filter(Boolean);
    if (alertas.length && !window.confirm(
      `ATENÇÃO: dose acima da máxima cadastrada para ${alertas.map((a) => `${a.nome} (máx. ${a.doseMaxima} ${a.unidade})`).join(', ')}.\nConfirmar mesmo assim?`)) return;
    if (meds.some((m) => !m.medicamentoId || m.dose === '')) { setErro('Preencha medicamento e dose de todas as linhas.'); return; }

    setSalvando(true);
    try {
      const r = await registrarOcorrencia({
        pessoa,
        prontuario,
        profissionalId: profissional.id,
        atendimento: {
          ...at,
          glasgowTotal,
          medicamentos: meds.map((m) => ({ ...m, horario: m.horario ? new Date(m.horario).toISOString() : null })),
        },
      });
      setResultado(r);
      setPessoa(pessoaVazia); setProntuario(prontuarioVazio); setAt(atendimentoVazio()); setMeds([]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setSalvando(false);
    }
  }

  const enviado = resultado?.envio && !resultado.envio.erros?.length;

  return (
    <form onSubmit={salvar} className="formulario">
      {resultado && (
        <div className={`alerta ${enviado ? 'sucesso' : 'aviso'}`}>
          {enviado
            ? <>Atendimento registrado e <b>enviado ao servidor central</b>.</>
            : <>Atendimento registrado <b>no dispositivo</b>. Será enviado quando houver conexão.</>}
          {' '}<button type="button" className="link" onClick={aoConcluir}>Ver atendimentos</button>
        </div>
      )}
      {!online && <div className="alerta offline">Sem conexão: o atendimento será salvo no aparelho e enviado automaticamente quando a conexão voltar.</div>}

      <section className="painel">
        <h2>1. Paciente</h2>
        <div className="linha">
          <input placeholder="Buscar paciente já cadastrado (nome ou CPF)…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button type="button" onClick={novoPaciente}>Novo paciente</button>
        </div>
        {sugestoes.length > 0 && (
          <ul className="sugestoes">
            {sugestoes.map((p) => (
              <li key={p.id}><button type="button" onClick={() => selecionarPessoa(p)}>{p.nome} <small>{p.cpf}</small></button></li>
            ))}
          </ul>
        )}
        {pessoa.id && <p className="dica">Editando paciente existente.</p>}
        <div className="grade">
          <Campo rotulo="Nome *" largo><input name="nome" value={pessoa.nome} onChange={alterar(setPessoa)} required maxLength={120} /></Campo>
          <Campo rotulo="CPF"><input name="cpf" value={pessoa.cpf} onChange={(e) => setPessoa((o) => ({ ...o, cpf: mascararCpf(e.target.value) }))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} /></Campo>
          <Campo rotulo="Nascimento"><input type="date" name="dataNascimento" value={pessoa.dataNascimento} onChange={alterar(setPessoa)} /></Campo>
          <Campo rotulo="Sexo">
            <select name="sexo" value={pessoa.sexo} onChange={alterar(setPessoa)}>
              <option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option><option value="O">Outro</option>
            </select>
          </Campo>
          <Campo rotulo="Telefone"><input name="telefone" type="tel" value={pessoa.telefone} onChange={alterar(setPessoa)} maxLength={20} /></Campo>
          <Campo rotulo="E-mail do paciente"><input type="email" name="email" value={pessoa.email} onChange={alterar(setPessoa)} maxLength={120} /></Campo>
          <Campo rotulo="Contato de emergência (familiar)"><input name="contatoEmergenciaNome" value={pessoa.contatoEmergenciaNome} onChange={alterar(setPessoa)} maxLength={120} /></Campo>
          <Campo rotulo="E-mail do familiar"><input type="email" name="contatoEmergenciaEmail" value={pessoa.contatoEmergenciaEmail} onChange={alterar(setPessoa)} maxLength={120} /></Campo>
        </div>
      </section>

      <section className="painel">
        <h2>2. Prontuário</h2>
        <div className="grade">
          <Campo rotulo="Tipo sanguíneo">
            <select name="tipoSanguineo" value={prontuario.tipoSanguineo} onChange={alterar(setProntuario)}>
              <option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Alergias" largo><input name="alergias" value={prontuario.alergias} onChange={alterar(setProntuario)} placeholder="Separe por vírgula" /></Campo>
          <Campo rotulo="Comorbidades" largo><input name="comorbidades" value={prontuario.comorbidades} onChange={alterar(setProntuario)} /></Campo>
          <Campo rotulo="Medicamentos de uso contínuo" largo><input name="medicamentosContinuos" value={prontuario.medicamentosContinuos} onChange={alterar(setProntuario)} /></Campo>
        </div>
      </section>

      <section className="painel">
        <h2>3. Ocorrência e sinais vitais</h2>
        <div className="grade">
          <Campo rotulo="Data/hora *"><input type="datetime-local" name="dataHora" value={at.dataHora} onChange={alterar(setAt)} required /></Campo>
          <Campo rotulo="Local" largo><input name="localOcorrencia" value={at.localOcorrencia} onChange={alterar(setAt)} placeholder="Endereço, rodovia, km…" maxLength={200} /></Campo>
          <Campo rotulo="Queixa principal" largo><input name="queixaPrincipal" value={at.queixaPrincipal} onChange={alterar(setAt)} /></Campo>
          <Campo rotulo="PA sistólica (mmHg)"><input type="number" name="paSistolica" value={at.paSistolica} onChange={alterar(setAt)} min="0" max="300" /></Campo>
          <Campo rotulo="PA diastólica (mmHg)"><input type="number" name="paDiastolica" value={at.paDiastolica} onChange={alterar(setAt)} min="0" max="200" /></Campo>
          <Campo rotulo="FC (bpm)"><input type="number" name="freqCardiaca" value={at.freqCardiaca} onChange={alterar(setAt)} min="0" max="300" /></Campo>
          <Campo rotulo="FR (irpm)"><input type="number" name="freqRespiratoria" value={at.freqRespiratoria} onChange={alterar(setAt)} min="0" max="80" /></Campo>
          <Campo rotulo="SpO₂ (%)"><input type="number" name="saturacaoO2" value={at.saturacaoO2} onChange={alterar(setAt)} min="0" max="100" /></Campo>
          <Campo rotulo="Temperatura (°C)"><input type="number" step="0.1" name="temperatura" value={at.temperatura} onChange={alterar(setAt)} min="25" max="45" /></Campo>
          <Campo rotulo="Glicemia (mg/dL)"><input type="number" name="glicemia" value={at.glicemia} onChange={alterar(setAt)} min="0" max="2000" /></Campo>
        </div>
      </section>

      <section className="painel">
        <h2>4. Escala de Glasgow e triagem</h2>
        <div className="grade">
          {Object.entries(GLASGOW).map(([campo, opcoes]) => (
            <Campo key={campo} rotulo={{ glasgowOcular: 'Abertura ocular', glasgowVerbal: 'Resposta verbal', glasgowMotora: 'Resposta motora' }[campo]}>
              <select name={campo} value={at[campo]} onChange={alterar(setAt)}>
                <option value="">—</option>
                {opcoes.map((o, i) => <option key={o} value={i + 1}>{i + 1} – {o}</option>)}
              </select>
            </Campo>
          ))}
          <div className="campo glasgow-total">
            <span>Glasgow total</span>
            <strong className={glasgowTotal == null ? '' : glasgowTotal <= 8 ? 'grave' : glasgowTotal <= 12 ? 'moderado' : 'leve'}>
              {glasgowTotal ?? '—'}
            </strong>
            {glasgowTotal != null && <small>{glasgowTotal <= 8 ? 'TCE grave' : glasgowTotal <= 12 ? 'TCE moderado' : 'TCE leve'}</small>}
          </div>
        </div>
        <div className="triagens">
          <fieldset>
            <legend>Protocolo de Manchester</legend>
            {MANCHESTER.map(([cor, desc]) => (
              <label key={cor} className={`cor ${cor.toLowerCase()} ${at.triagemManchester === cor ? 'marcada' : ''}`}>
                <input type="radio" name="triagemManchester" value={cor} checked={at.triagemManchester === cor} onChange={alterar(setAt)} />
                {desc}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Protocolo START (múltiplas vítimas)</legend>
            {START.map(([cor, desc]) => (
              <label key={cor} className={`cor ${cor.toLowerCase()} ${at.triagemStart === cor ? 'marcada' : ''}`}>
                <input type="radio" name="triagemStart" value={cor} checked={at.triagemStart === cor} onChange={alterar(setAt)} />
                {desc}
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      <section className="painel">
        <h2>5. Medicamentos administrados</h2>
        {medicamentos.length === 0 && <p className="dica">Nenhum medicamento no dispositivo. Use “Receber dados” com conexão.</p>}
        {meds.map((m, i) => {
          const excesso = doseExcessiva(m);
          return (
            <div key={i} className={`linha-med ${excesso ? 'excesso' : ''}`}>
              <select value={m.medicamentoId} onChange={(e) => alterarMed(i, 'medicamentoId', e.target.value)}>
                <option value="">Medicamento…</option>
                {medicamentos.map((x) => <option key={x.id} value={x.id}>{x.nome} — {x.apresentacao}</option>)}
              </select>
              <input type="number" step="any" min="0" placeholder="Dose" value={m.dose} onChange={(e) => alterarMed(i, 'dose', e.target.value)} />
              <input placeholder="Unid." maxLength={10} value={m.unidade} onChange={(e) => alterarMed(i, 'unidade', e.target.value)} maxLength={10} />
              <input placeholder="Via" maxLength={30} value={m.via} onChange={(e) => alterarMed(i, 'via', e.target.value)} maxLength={30} />
              <input type="datetime-local" value={m.horario} onChange={(e) => alterarMed(i, 'horario', e.target.value)} />
              <button type="button" className="discreto" onClick={() => setMeds((l) => l.filter((_, j) => j !== i))} aria-label="Remover">✕</button>
              {excesso && <div className="aviso-dose">⚠ Dose acima da máxima cadastrada ({excesso.doseMaxima} {excesso.unidade})</div>}
            </div>
          );
        })}
        <button type="button" onClick={adicionarMed}>+ Adicionar medicamento</button>
      </section>

      <section className="painel">
        <h2>6. Conduta</h2>
        <div className="grade">
          <Campo rotulo="Procedimentos realizados" largo><textarea name="procedimentos" value={at.procedimentos} onChange={alterar(setAt)} rows={2} /></Campo>
          <Campo rotulo="Observações" largo><textarea name="observacoes" value={at.observacoes} onChange={alterar(setAt)} rows={2} /></Campo>
          <Campo rotulo="Destino / hospital" largo><input name="destino" value={at.destino} onChange={alterar(setAt)} maxLength={200} /></Campo>
        </div>
      </section>

      {erro && <div className="alerta erro">{erro}</div>}
      <div className="rodape-form">
        <button className="primario grande" disabled={salvando}>
          {salvando ? 'Salvando…' : online ? 'Registrar atendimento' : 'Registrar atendimento (offline)'}
        </button>
      </div>
    </form>
  );
}
