package br.univates.medicalfield.clinical.sync;

import br.univates.medicalfield.clinical.data.EntityDef;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Last-Write-Wins: prevalece o registro com carimbo de data/hora (atualizadoEm)
 * mais recente, informado pelo profissional no momento da edição.
 */
public final class LastWriteWinsStrategy implements ConflictStrategy {
    @Override public String nome() { return "LWW"; }

    @Override
    public Map<String, Object> resolver(EntityDef def, Map<String, Object> servidor, Map<String, Object> cliente) {
        return new LinkedHashMap<>(ConflictStrategy.clienteMaisRecente(servidor, cliente) ? cliente : servidor);
    }
}
