package br.univates.medicalfield.clinical.sync;

import br.univates.medicalfield.clinical.data.EntityDef;

import java.util.LinkedHashMap;
import java.util.Map;

/** Server-Wins: em conflito, mantém o que já está consolidado no servidor (a alteração fica só na auditoria). */
public final class ServerWinsStrategy implements ConflictStrategy {
    @Override public String nome() { return "SERVER_WINS"; }

    @Override
    public Map<String, Object> resolver(EntityDef def, Map<String, Object> servidor, Map<String, Object> cliente) {
        return new LinkedHashMap<>(servidor);
    }
}
