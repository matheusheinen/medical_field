package br.univates.medicalfield.clinical.data;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.UUID;

/**
 * Padrão Repository para a tabela sync_operacao: o registro de cada opId já processado.
 * É a base da idempotência: um comando reenviado com o mesmo opId é reconhecido como DUPLICADO.
 */
public final class SyncOperacaoRepository {

    public boolean jaProcessada(Connection c, UUID opId) throws SQLException {
        return Jdbc.umOuNulo(c, "SELECT 1 FROM sync_operacao WHERE op_id = ?", opId) != null;
    }

    public void registrar(Connection c, UUID opId, String entidade, UUID entidadeId, UUID profissionalId,
                          String dispositivoId, String resultado, String estrategia) throws SQLException {
        Jdbc.executar(c, """
                INSERT INTO sync_operacao (op_id, entidade, entidade_id, profissional_id, dispositivo_id, resultado, estrategia)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                opId, entidade, entidadeId, profissionalId, dispositivoId, resultado, estrategia);
    }
}
