import Dexie from 'dexie';

/**
 * Banco de dados LOCAL embarcado no cliente: IndexedDB (via Dexie).
 * É um banco transacional que o navegador mantém no próprio dispositivo,
 * disponível sem rede e persistente entre reinicializações.
 *
 * syncStatus dos registros clínicos: PENDENTE | SINCRONIZADO | ERRO
 */
export const db = new Dexie('medicalfield');

db.version(1).stores({
  pessoas: 'id, nome, cpf, syncStatus',
  prontuarios: 'id, pessoaId, syncStatus',
  atendimentos: 'id, pessoaId, prontuarioId, dataHora, syncStatus',
  medicamentos: 'id, nome',
  // Outbox: fila de comandos aguardando envio ao servidor (ordem = seq)
  outbox: '++seq, opId, [entidade+entidadeId], status',
  // Logs locais de operações feitas sem conexão (enviados via POST /log)
  logs: 'id, dataHora, enviado',
  // Histórico de sincronizações e resultados (idempotência/conflitos)
  historico: '++id, dataHora',
  meta: 'chave',
});
