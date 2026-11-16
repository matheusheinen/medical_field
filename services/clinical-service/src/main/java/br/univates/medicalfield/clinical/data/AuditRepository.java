package br.univates.medicalfield.clinical.data;

import br.univates.medicalfield.clinical.http.Json;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Rastreabilidade: cada criação/alteração/conflito gera uma linha em auditoria_alteracao. */
public final class AuditRepository {

    public void registrar(Connection c, String entidade, UUID entidadeId, String operacao, String origem,
                          String estrategia, UUID profissionalId, String dispositivoId, UUID opId,
                          Object antes, Object depois) throws SQLException {
        Jdbc.executar(c, """
                INSERT INTO auditoria_alteracao (entidade, entidade_id, operacao, origem, estrategia,
                       profissional_id, dispositivo_id, op_id, dados_antes, dados_depois)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)""",
                entidade, entidadeId, operacao, origem, estrategia, profissionalId, dispositivoId, opId,
                antes == null ? null : Json.texto(antes), depois == null ? null : Json.texto(depois));
    }

    public List<Map<String, Object>> listar(Connection c, UUID entidadeId, int limite) throws SQLException {
        String base = """
                SELECT au.*, pf.nome AS profissional_nome
                  FROM auditoria_alteracao au LEFT JOIN profissional pf ON pf.id = au.profissional_id
                """;
        return entidadeId == null
                ? Jdbc.consultar(c, base + " ORDER BY au.id DESC LIMIT ?", limite)
                : Jdbc.consultar(c, base + " WHERE au.entidade_id = ? ORDER BY au.id DESC LIMIT ?", entidadeId, limite);
    }
}
