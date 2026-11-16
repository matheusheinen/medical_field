import { uuid, agoraIso } from '../util/uuid';

/**
 * Padrão COMMAND: cada alteração feita no dispositivo vira um objeto-comando
 * serializável, guardado na Outbox e executado depois (no servidor) quando houver rede.
 *
 *  - opId: chave de idempotência. O servidor registra cada opId processado;
 *          reenviar o mesmo comando devolve "DUPLICADO" sem regravar nada.
 *  - dados.versao: versão do servidor em que a edição se baseou (detecção de conflito).
 *  - dados.atualizadoEm: carimbo de data/hora da edição (usado pela estratégia LWW).
 */
export class UpsertCommand {
  constructor({ opId = uuid(), entidade, entidadeId, dados, criadoEm = agoraIso() }) {
    Object.assign(this, { opId, entidade, entidadeId, dados, criadoEm });
  }

  /** Formato enviado ao POST /sync/push */
  paraOperacao() {
    return { opId: this.opId, entidade: this.entidade, dados: this.dados };
  }

  serializar() {
    return { opId: this.opId, entidade: this.entidade, entidadeId: this.entidadeId, dados: this.dados, criadoEm: this.criadoEm };
  }

  static desserializar(linha) {
    const c = new UpsertCommand(linha);
    c.seq = linha.seq;
    return c;
  }
}

/** Fábricas de comandos (uma por caso de uso). */
export const Comandos = {
  salvarPessoa: (pessoa) => new UpsertCommand({ entidade: 'pessoa', entidadeId: pessoa.id, dados: pessoa }),
  salvarProntuario: (pr) => new UpsertCommand({ entidade: 'prontuario', entidadeId: pr.id, dados: pr }),
  registrarAtendimento: (at) => new UpsertCommand({ entidade: 'atendimento', entidadeId: at.id, dados: at }),
};
