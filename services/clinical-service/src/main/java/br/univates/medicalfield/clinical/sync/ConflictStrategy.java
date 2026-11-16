package br.univates.medicalfield.clinical.sync;

import br.univates.medicalfield.clinical.data.EntityDef;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * Padrão Strategy: algoritmo de resolução de conflito usado quando o cliente envia
 * uma alteração baseada numa versão diferente da que está no servidor.
 *
 * Os mapas contêm os campos da entidade (normalizados), "atualizadoEm" e,
 * para atendimento, a lista "medicamentos".
 */
public interface ConflictStrategy {

    /** Nome gravado na auditoria (ex.: LWW, SERVER_WINS, MERGE). */
    String nome();

    Map<String, Object> resolver(EntityDef def, Map<String, Object> servidor, Map<String, Object> cliente);

    static boolean clienteMaisRecente(Map<String, Object> servidor, Map<String, Object> cliente) {
        OffsetDateTime ts = (OffsetDateTime) servidor.get("atualizadoEm");
        OffsetDateTime tc = (OffsetDateTime) cliente.get("atualizadoEm");
        return tc != null && (ts == null || tc.isAfter(ts));   // empate: mantém o servidor
    }
}
