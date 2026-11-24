import { connectivity } from '../net/ConnectivityMonitor';
import { OfflineError } from '../net/apiClient';
import { LocalRepository as local } from '../repositories/LocalRepository';
import { RemoteRepository as remoto } from '../repositories/RemoteRepository';
import { dispositivoId, sessao } from '../services/sessao';
import { UpsertCommand } from './commands';

/**
 * Padrão FACADE: a interface só chama sincronizar(), enviarPendentes() ou receberDados().
 * Por trás ficam a Outbox, os comandos, a idempotência, os logs offline e o pull incremental.
 *
 * Também é OBSERVER do ConnectivityMonitor: quando a conexão volta (offline -> online),
 * a sincronização da Outbox é disparada automaticamente.
 */
class SyncManager {
  #estado = { sincronizando: false, mensagem: null, erro: null, ultimaSync: null };
  #observadores = new Set();   // quem quer saber do estado da sincronização (a barra de status, via useSync)
  #emAndamento = null;
  #recuperado = Promise.resolve();

  constructor() {
    // Recuperação: se o app foi fechado no meio de um envio, os comandos ficaram
    // marcados como ENVIANDO e nunca mais seriam enviados. Voltam para a fila;
    // o reenvio é seguro porque cada comando mantém o mesmo opId (idempotência).
    this.#recuperado = local.recuperarEnvioInterrompido().catch(() => {});

    connectivity.inscrever((ev) => {
      if (ev.online && !ev.anterior && sessao.tokenValido()) {
        this.sincronizar('Conexão restabelecida').catch(() => {});
      }
    });
  }

  get estado() { return this.#estado; }
  inscrever(fn) { this.#observadores.add(fn); return () => this.#observadores.delete(fn); }

  /** Muda parte do estado e notifica a lista (mesma forma do ConnectivityMonitor). */
  #mudarEstado(parcial) {
    this.#estado = { ...this.#estado, ...parcial };
    this.#notificar();
  }

  #notificar() {
    this.#observadores.forEach((fn) => {
      try { fn(this.#estado); } catch (e) { console.error('[SyncManager] observador falhou', e); }
    });
  }

  /** Executa uma tarefa por vez (evita dois envios simultâneos da mesma Outbox). */
  async #exclusivo(rotulo, tarefa) {
    while (this.#emAndamento) await this.#emAndamento.catch(() => {});
    this.#mudarEstado({ sincronizando: true, mensagem: rotulo, erro: null });
    this.#emAndamento = (async () => {
      try {
        const r = await tarefa();
        this.#mudarEstado({ sincronizando: false, ultimaSync: new Date().toISOString() });
        return r;
      } catch (e) {
        this.#mudarEstado({ sincronizando: false, erro: e instanceof OfflineError ? 'Sem conexão' : e.message });
        throw e;
      }
    })();
    try { return await this.#emAndamento; } finally { this.#emAndamento = null; }
  }

  /** Cliente -> Portal: envia logs offline e a Outbox. Depois recebe as novidades do servidor. */
  sincronizar(motivo = 'Sincronização manual') {
    return this.#exclusivo(motivo, async () => {
      const logs = await this.#enviarLogs();
      const push = await this.#push();
      const pull = await this.#pull();
      const resumo = { tipo: 'SYNC', motivo, logs, ...push, recebidos: pull };
      await local.registrarHistorico(resumo);
      this.#mudarEstado({ mensagem: this.#descrever(resumo) });
      return resumo;
    });
  }

  enviarPendentes(motivo = 'Envio de pendentes') {
    return this.#exclusivo(motivo, async () => {
      const logs = await this.#enviarLogs();
      const push = await this.#push();
      const resumo = { tipo: 'PUSH', motivo, logs, ...push };
      if (push.enviados) await local.registrarHistorico(resumo);
      this.#mudarEstado({ mensagem: this.#descrever(resumo) });
      return resumo;
    });
  }

  /** Portal -> Cliente (pull incremental). */
  receberDados(motivo = 'Receber dados do portal') {
    return this.#exclusivo(motivo, async () => {
      const recebidos = await this.#pull();
      const resumo = { tipo: 'PULL', motivo, recebidos };
      await local.registrarHistorico(resumo);
      this.#mudarEstado({ mensagem: this.#descrever(resumo) });
      return resumo;
    });
  }

  // ------------------------------------------------------------------ internos

  async #push() {
    await this.#recuperado;
    const linhas = await local.comandosParaEnviar();
    if (!linhas.length) return { enviados: 0, porStatus: {}, conflitos: [], vinculados: [], erros: [] };
    if (!connectivity.online) throw new OfflineError();

    const seqs = linhas.map((l) => l.seq);
    await local.marcarComandos(seqs, 'ENVIANDO');
    const comandos = linhas.map(UpsertCommand.desserializar);

    let resposta;
    try {
      resposta = await remoto.push(dispositivoId(), comandos.map((c) => c.paraOperacao()));
    } catch (e) {
      // falhou o envio: nada foi confirmado, os comandos voltam para a fila (serão reenviados com o mesmo opId)
      await local.marcarComandos(seqs, 'PENDENTE');
      throw e;
    }

    const porStatus = {};
    const conflitos = [];
    const vinculados = [];
    const erros = [];
    for (const res of resposta.resultados) {
      const cmd = comandos.find((c) => c.opId === res.opId);
      if (!cmd) continue;
      porStatus[res.status] = (porStatus[res.status] ?? 0) + 1;
      const tabela = local.tabela(cmd.entidade);

      if (res.status === 'ERRO') {
        erros.push({ entidade: cmd.entidade, id: cmd.entidadeId, mensagem: res.mensagem });
        await local.marcarComandoComErro(cmd.seq, res.mensagem);
        await tabela.update(cmd.entidadeId, { syncStatus: 'ERRO' });
        continue;
      }

      if (res.status === 'CONFLITO_RESOLVIDO') {
        conflitos.push({ entidade: cmd.entidade, id: cmd.entidadeId, estrategia: res.estrategia });
      }
      await local.removerComando(cmd.seq);

      // Cadastro duplicado (ex.: paciente com o mesmo CPF já cadastrado por outra equipe):
      // o servidor vinculou ao registro existente, então o id local é trocado pelo do servidor
      // aqui no aparelho (registro, referências e comandos ainda na fila).
      const id = res.id ?? cmd.entidadeId;
      if (id !== cmd.entidadeId) {
        vinculados.push({ entidade: cmd.entidade, de: cmd.entidadeId, para: id, nome: res.registro?.nome });
        await local.vincular(cmd.entidade, cmd.entidadeId, id);
      }

      // Se o usuário editou o mesmo registro durante o envio, mantém a edição local
      // e só atualiza a versão-base do comando que ainda está na fila.
      const outroPendente = await local.comandoPendenteDe(cmd.entidade, id);
      if (outroPendente) {
        await local.atualizarVersaoBase(outroPendente, res.registro.versao);
        await tabela.update(id, { versao: res.registro.versao });
      } else if (res.registro) {
        await tabela.put({ ...res.registro, syncStatus: 'SINCRONIZADO' });
      }
    }
    return { enviados: comandos.length, porStatus, conflitos, vinculados, erros };
  }

  async #pull() {
    const desde = await local.meta('ultimoPull');
    const dados = await remoto.pull(desde);
    await local.salvarMedicamentos(dados.medicamentos);
    const recebidos = {
      medicamentos: dados.medicamentos.length,
      pessoas: await local.aplicarDoServidor('pessoa', dados.pessoas),
      prontuarios: await local.aplicarDoServidor('prontuario', dados.prontuarios),
      atendimentos: await local.aplicarDoServidor('atendimento', dados.atendimentos),
    };
    await local.definirMeta('ultimoPull', dados.servidorAgora);
    return recebidos;
  }

  async #enviarLogs() {
    const logs = await local.listarLogsNaoEnviados();
    if (!logs.length) return 0;
    if (!connectivity.online) throw new OfflineError();
    await remoto.enviarLogs(dispositivoId(), logs.map(({ enviado, ...l }) => l));
    await local.marcarLogsEnviados(logs.map((l) => l.id));
    return logs.length;
  }

  #descrever(r) {
    const partes = [];
    if (r.enviados !== undefined) {
      partes.push(r.enviados ? `${r.enviados} enviado(s)` : 'nada pendente');
      if (r.conflitos?.length) partes.push(`${r.conflitos.length} conflito(s) resolvido(s)`);
      if (r.vinculados?.length) partes.push(`${r.vinculados.length} cadastro(s) já existente(s) vinculado(s)`);
      if (r.porStatus?.DUPLICADO) partes.push(`${r.porStatus.DUPLICADO} duplicado(s) ignorado(s)`);
      if (r.erros?.length) partes.push(`${r.erros.length} erro(s)`);
    }
    if (r.logs) partes.push(`${r.logs} log(s) offline enviado(s)`);
    if (r.recebidos) {
      const q = r.recebidos;
      partes.push(`recebidos: ${q.medicamentos} medicamento(s), ${q.pessoas} pessoa(s), ${q.prontuarios} prontuário(s), ${q.atendimentos} atendimento(s)`);
    }
    return `${r.motivo}: ${partes.join(' • ')}`;
  }
}

export const syncManager = new SyncManager();
