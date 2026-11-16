import { db } from '../db/localDb';
import { connectivity } from '../net/ConnectivityMonitor';
import { LocalRepository as local } from '../repositories/LocalRepository';
import { RemoteRepository as remoto } from '../repositories/RemoteRepository';
import { syncManager } from '../sync/SyncManager';
import { sessao } from './sessao';
import { Comandos } from '../sync/commands';
import { agoraIso, uuid } from '../util/uuid';

const CAMPOS_PESSOA = ['nome', 'cpf', 'dataNascimento', 'sexo', 'telefone', 'email', 'contatoEmergenciaNome', 'contatoEmergenciaEmail'];
const CAMPOS_PRONTUARIO = ['tipoSanguineo', 'alergias', 'comorbidades', 'medicamentosContinuos', 'observacoes'];

const vazio = (v) => v === undefined || v === null || v === '';
function mudou(antes, depois, campos) {
  if (!antes) return true;
  return campos.some((c) => (vazio(antes[c]) ? '' : String(antes[c])) !== (vazio(depois[c]) ? '' : String(depois[c])));
}
function limpar(obj) {
  const r = {};
  for (const [k, v] of Object.entries(obj)) r[k] = vazio(v) ? null : v;
  return r;
}

/**
 * Caso de uso "Registrar ocorrência": SEMPRE grava primeiro no banco local
 * (offline-first) e enfileira os comandos na Outbox. Se estiver online,
 * a Outbox é enviada logo em seguida; se estiver offline, fica pendente
 * até a conexão voltar.
 */
export async function registrarOcorrencia({ pessoa, prontuario, atendimento, profissionalId }) {
  const online = connectivity.online;
  const inicio = performance.now();
  const agora = agoraIso();

  const pessoaAntes = pessoa.id ? await local.obterPessoa(pessoa.id) : null;
  if (!pessoaAntes && pessoa.cpf) {
    const mesmoCpf = await local.pessoaPorCpf(pessoa.cpf);
    if (mesmoCpf) throw new Error(`Já existe um paciente com este CPF no aparelho (${mesmoCpf.nome}). Selecione-o na busca.`);
  }
  const pessoaId = pessoa.id ?? uuid();
  const prontAntes = await local.prontuarioDaPessoa(pessoaId);
  const prontuarioId = prontAntes?.id ?? uuid();
  const atendimentoId = uuid();
  const gravados = [];

  await db.transaction('rw', [db.pessoas, db.prontuarios, db.atendimentos, db.outbox, db.logs], async () => {
    if (mudou(pessoaAntes, pessoa, CAMPOS_PESSOA)) {
      const dados = {
        ...limpar(Object.fromEntries(CAMPOS_PESSOA.map((c) => [c, pessoa[c]]))),
        id: pessoaId,
        versao: pessoaAntes?.versao ?? 0,
        atualizadoEm: agora,
        criadoOffline: pessoaAntes ? !!pessoaAntes.criadoOffline : !online,
      };
      await local.salvarComOutbox(Comandos.salvarPessoa(dados));
      gravados.push('POST /pessoa');   // a API só tem POST: o servidor decide se cria ou atualiza (upsert)
    }

    if (mudou(prontAntes, prontuario, CAMPOS_PRONTUARIO) || !prontAntes) {
      const dados = {
        ...limpar(Object.fromEntries(CAMPOS_PRONTUARIO.map((c) => [c, prontuario[c]]))),
        id: prontuarioId,
        pessoaId,
        versao: prontAntes?.versao ?? 0,
        atualizadoEm: agora,
        criadoOffline: prontAntes ? !!prontAntes.criadoOffline : !online,
      };
      await local.salvarComOutbox(Comandos.salvarProntuario(dados));
      gravados.push('POST /prontuario');
    }

    const dadosAt = {
      ...limpar(atendimento),
      id: atendimentoId,
      pessoaId,
      prontuarioId,
      profissionalId,
      dataHora: new Date(atendimento.dataHora || agora).toISOString(),
      medicamentos: (atendimento.medicamentos ?? []).map((m) => ({ ...limpar(m), id: m.id ?? uuid() })),
      versao: 0,
      atualizadoEm: agora,
      criadoOffline: !online,
    };
    await local.salvarComOutbox(Comandos.registrarAtendimento(dadosAt));
    gravados.push('POST /atendimento');

    // Sem conexão, as operações viram logs locais (enviados depois via POST /log)
    if (!online) {
      const ms = Math.round((performance.now() - inicio) * 100) / 100;
      for (const rota of gravados) {
        const [metodo, caminho] = rota.split(' ');
        await local.registrarLog(`${caminho} (offline)`, metodo, 201, ms);
      }
    }
  });

  let envio = null;
  if (online) {
    try { envio = await syncManager.enviarPendentes('Atendimento registrado online'); }
    catch { /* continua pendente; será enviado na próxima sincronização */ }
  }
  return { atendimentoId, pessoaId, prontuarioId, online, envio };
}

export async function abrirFichaPdf(atendimentoId) {
  const blob = await remoto.baixarFichaPdf(atendimentoId);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const enviarFichaPorEmail = (id, destinatario, mensagem) => remoto.enviarFichaPorEmail(id, destinatario, mensagem);

export async function login(tipoRegistro, registro, senha) {
  return remoto.login(tipoRegistro, registro, senha);
}

// ------------------------------------------------------------------ sessão no aparelho

/** O que ainda não chegou ao servidor. */
export async function pendenciasLocais() {
  const [naFila, comErro, logs] = await Promise.all([
    db.outbox.filter((o) => o.status !== 'ERRO').count(),
    db.outbox.where('status').equals('ERRO').count(),
    db.logs.filter((l) => !l.enviado).count(),
  ]);
  return { naFila, comErro, logs, total: naFila + comErro + logs };
}

/**
 * Abre (ou renova) a sessão depois de um login bem-sucedido.
 * Os dados do aparelho pertencem a um profissional: outro profissional só entra
 * depois que tudo foi enviado, e então o aparelho é limpo (LGPD e rastreabilidade:
 * a Outbox de um nunca é enviada com o token de outro).
 */
export async function iniciarSessao(resposta) {
  const novo = resposta.profissional;
  const atual = sessao.obter();
  if (atual && atual.profissional.id !== novo.id) {
    throw new Error(`A sessão deste aparelho é de ${atual.profissional.nome}. Entre com a mesma conta para sincronizar.`);
  }
  const dono = await local.meta('profissionalId');
  if (dono && dono !== novo.id) {
    if ((await pendenciasLocais()).total) {
      throw new Error('Este aparelho tem registros não enviados de outro profissional. Ele precisa entrar e sincronizar antes.');
    }
    await local.limparTudo();
  }
  await local.definirMeta('profissionalId', novo.id);
  sessao.salvar(resposta);
}

/**
 * Sai do app e apaga os dados clínicos do aparelho, para que o próximo profissional
 * não veja os pacientes deste. Registros ainda não enviados NUNCA são descartados;
 * os recusados pelo servidor (ERRO) só com confirmação explícita.
 */
export async function sair({ descartarRecusados = false } = {}) {
  const p = await pendenciasLocais();
  if (p.naFila || p.logs) throw new Error('Há registros ainda não enviados. Sincronize antes de sair.');
  if (p.comErro && !descartarRecusados) throw new Error('Há registros recusados pelo servidor. Confirme o descarte para sair.');
  await local.limparTudo();
  sessao.encerrar();
}
