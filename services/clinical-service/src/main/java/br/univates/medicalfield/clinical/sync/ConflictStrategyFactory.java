package br.univates.medicalfield.clinical.sync;

import br.univates.medicalfield.clinical.Config;

import java.util.Map;

/**
 * Padrão Factory: escolhe a Strategy de conflito para cada entidade.
 * Padrões: pessoa=LWW, prontuario=MERGE, atendimento=LWW
 * (alteráveis por variável de ambiente CONFLICT_STRATEGY_<ENTIDADE>).
 */
public final class ConflictStrategyFactory {
    private static final Map<String, ConflictStrategy> DISPONIVEIS = Map.of(
            "LWW", new LastWriteWinsStrategy(),
            "SERVER_WINS", new ServerWinsStrategy(),
            "MERGE", new FieldMergeStrategy());

    private static final Map<String, String> PADRAO = Map.of(
            "pessoa", "LWW",
            "prontuario", "MERGE",
            "atendimento", "LWW");

    public ConflictStrategy para(String entidade) {
        String nome = Config.estrategiaConflito(entidade, PADRAO.getOrDefault(entidade, "LWW")).toUpperCase();
        return DISPONIVEIS.getOrDefault(nome, DISPONIVEIS.get("LWW"));
    }

    /** Usada ao vincular dois cadastros do mesmo paciente: mescla os campos, nunca descarta um lado. */
    public ConflictStrategy mesclagem() {
        return DISPONIVEIS.get("MERGE");
    }
}
