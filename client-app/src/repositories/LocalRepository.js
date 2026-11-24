import { db } from '../db/localDb';
import { uuid, agoraIso } from '../util/uuid';

/**
 * Padrão REPOSITORY (local): ÚNICO ponto de acesso ao banco embarcado (IndexedDB).
 * Telas, serviços e o SyncManager usam estes métodos; só este arquivo conhece o Dexie.
 */
const tabela = { pessoa: db.pessoas, prontuario: db.prontuarios, atendimento: db.atendimentos };

export const LocalRepository = {
  tabela: (entidade) => tabela[entidade],

  /** Executa fn numa transação com os dados clínicos, a Outbox e os logs (tudo grava ou nada grava). */
  emTransacao: (fn) => db.transaction('rw', [db.pessoas, db.prontuarios, db.atendimentos, db.outbox, db.logs], fn),

  // ---------------------------------------------------------------- consultas
  listarPessoas: () => db.pessoas.orderBy('nome').toArray(),
  obterPessoa: (id) => db.pessoas.get(id),
  prontuarioDaPessoa: (pessoaId) => db.prontuarios.where('pessoaId').equals(pessoaId).first(),
  listarMedicamentos: () => db.medicamentos.orderBy('nome').filter((m) => m.ativo !== false).toArray(),
  listarOutbox: () => db.outbox.orderBy('seq').toArray(),
  contarPendentes: () => db.outbox.count(),
  listarLogsNaoEnviados: () => db.logs.filter((l) => !l.enviado).toArray(),
  listarLogsRecentes: (limite = 30) => db.logs.orderBy('dataHora').reverse().limit(limite).toArray(),
  listarHistorico: () => db.historico.orderBy('id').reverse().limit(50).toArray(),

  /** Atendimentos (mais recentes primeiro) com a pessoa de cada um. */
  async listarAtendimentosComPessoa() {
    const ats = await db.atendimentos.orderBy('dataHora').reverse().toArray();
    const pessoas = new Map((await db.pessoas.toArray()).map((p) => [p.id, p]));
    return ats.map((a) => ({ ...a, pessoa: pessoas.get(a.pessoaId) }));
  },

  /** Pessoas (por nome) com o prontuário de cada uma. */
  async listarPessoasComProntuario() {
    const pessoas = await db.pessoas.orderBy('nome').toArray();
    const pronts = new Map((await db.prontuarios.toArray()).map((p) => [p.pessoaId, p]));
    return pessoas.map((p) => ({ ...p, prontuario: pronts.get(p.id) }));
  },

  /** O que ainda não chegou ao servidor: comandos na fila, comandos recusados (ERRO) e logs offline. */
  async contarPendencias() {
    const [naFila, comErro, logs] = await Promise.all([
      db.outbox.filter((o) => o.status !== 'ERRO').count(),
      db.outbox.where('status').equals('ERRO').count(),
      db.logs.filter((l) => !l.enviado).count(),
    ]);
    return { naFila, comErro, logs };
  },

  // ---------------------------------------------------------------- Outbox (usada pelo SyncManager)
  /** App fechado no meio de um envio: os comandos ENVIANDO voltam para a fila (mesmo opId, reenvio seguro). */
  recuperarEnvioInterrompido: () => db.outbox.where('status').equals('ENVIANDO').modify({ status: 'PENDENTE' }),
  comandosParaEnviar: () => db.outbox.orderBy('seq').filter((o) => o.status !== 'ENVIANDO').toArray(),
  marcarComandos: (seqs, status) => db.outbox.where('seq').anyOf(seqs).modify({ status }),
  marcarComandoComErro: (seq, mensagem) => db.outbox.update(seq, { status: 'ERRO', mensagem }),
  removerComando: (seq) => db.outbox.delete(seq),
  /** Comando ainda não enviado para o mesmo registro (o usuário editou de novo durante o envio). */
  comandoPendenteDe: (entidade, entidadeId) => db.outbox
    .where('[entidade+entidadeId]').equals([entidade, entidadeId])
    .filter((o) => o.status === 'PENDENTE').first(),
  atualizarVersaoBase: (comando, versao) => db.outbox.update(comando.seq, { dados: { ...comando.dados, versao } }),

  async meta(chave) { return (await db.meta.get(chave))?.valor; },
  definirMeta: (chave, valor) => db.meta.put({ chave, valor }),

  // ---------------------------------------------------------------- gravação local + Outbox
  /**
   * Grava o registro localmente (PENDENTE) e enfileira o comando na Outbox.
   * Se já houver um comando ainda não enviado para o mesmo registro, ele é
   * ATUALIZADO no lugar (coalescência) — mantém a ordem pessoa → prontuário → atendimento.
   */
  async salvarComOutbox(comando) {
    const { entidade, entidadeId, dados } = comando;
    await tabela[entidade].put({ ...dados, syncStatus: 'PENDENTE' });
    const existente = await LocalRepository.comandoPendenteDe(entidade, entidadeId);
    if (existente) {
      await db.outbox.update(existente.seq, { opId: comando.opId, dados, atualizadoEm: agoraIso() });
    } else {
      await db.outbox.add({ ...comando.serializar(), status: 'PENDENTE' });
    }
  },

  /** Dados recebidos do servidor (pull). Registros com alteração local pendente são preservados. */
  async aplicarDoServidor(entidade, registros) {
    let aplicados = 0;
    for (const r of registros) {
      const local = await tabela[entidade].get(r.id);
      if (local && local.syncStatus === 'PENDENTE') continue;
      await tabela[entidade].put({ ...r, syncStatus: 'SINCRONIZADO' });
      aplicados++;
    }
    return aplicados;
  },

  salvarMedicamentos: (lista) => db.medicamentos.bulkPut(lista),

  /** Paciente já cadastrado no aparelho com o mesmo CPF (só os dígitos importam). */
  async pessoaPorCpf(cpf) {
    const digitos = String(cpf ?? '').replace(/\D/g, '');
    if (!digitos) return null;
    return db.pessoas.filter((p) => String(p.cpf ?? '').replace(/\D/g, '') === digitos).first();
  },

  /**
   * O servidor vinculou o registro local "de" a um registro existente "para" (cadastro duplicado).
   * Troca o id em todo o aparelho: o registro, as referências e os comandos ainda na Outbox.
   */
  async vincular(entidade, de, para) {
    const ref = { pessoa: 'pessoaId', prontuario: 'prontuarioId' }[entidade];
    await db.transaction('rw', [db.pessoas, db.prontuarios, db.atendimentos, db.outbox], async () => {
      await tabela[entidade].delete(de);
      if (ref) {
        for (const t of [db.prontuarios, db.atendimentos]) {
          await t.filter((r) => r[ref] === de).modify({ [ref]: para });
        }
      }
      await db.outbox.toCollection().modify((o) => {
        if (o.entidade === entidade && o.entidadeId === de) { o.entidadeId = para; o.dados = { ...o.dados, id: para }; }
        if (ref && o.dados?.[ref] === de) o.dados = { ...o.dados, [ref]: para };
      });
    });
  },

  /** Apaga todos os dados clínicos e de sincronização do aparelho (usado no logout). */
  limparTudo: () => db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear()))),

  // ---------------------------------------------------------------- logs locais
  registrarLog: (rota, metodo = 'LOCAL', statusCode = 201, tempoMs = 0) =>
    db.logs.add({ id: uuid(), dataHora: agoraIso(), metodo, rota, statusCode, tempoMs, enviado: false }),

  marcarLogsEnviados: (ids) => db.logs.where('id').anyOf(ids).modify({ enviado: true }),

  registrarHistorico: (registro) => db.historico.add({ dataHora: agoraIso(), ...registro }),
};
