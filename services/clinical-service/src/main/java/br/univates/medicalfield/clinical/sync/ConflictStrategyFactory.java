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

    /**
     * Fail-fast: um valor inválido no .env (ex.: CONFLICT_STRATEGY_PRONTUARIO=MERG) impede o serviço de subir,
     * em vez de cair em LWW sem aviso e passar a sobrescrever alergias do prontuário.
     */
    public ConflictStrategyFactory() {
        for (String entidade : PADRAO.keySet()) para(entidade);
    }

    public ConflictStrategy para(String entidade) {
        String nome = Config.estrategiaConflito(entidade, PADRAO.getOrDefault(entidade, "LWW")).toUpperCase();
        ConflictStrategy s = DISPONIVEIS.get(nome);
        if (s == null) {
            throw new IllegalStateException("CONFLICT_STRATEGY_" + entidade.toUpperCase() + "=" + nome
                    + " é inválido. Use um destes: " + String.join(", ", DISPONIVEIS.keySet()));
        }
        return s;
    }

    /** Usada ao vincular dois cadastros do mesmo paciente: mescla os campos, nunca descarta um lado. */
    public ConflictStrategy mesclagem() {
        return DISPONIVEIS.get("MERGE");
    }
}
