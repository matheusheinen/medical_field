package br.univates.medicalfield.clinical.data;

import br.univates.medicalfield.clinical.security.JwtVerifier.Usuario;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Persistência dos logs de acesso (servidor) e dos logs locais enviados pelo cliente. */
public final class LogRepository {

    public void registrarAcesso(String servico, OffsetDateTime dataHora, String ip, Usuario u, String metodo,
                                String rota, int status, double ms, String dispositivo) {
        try (Connection c = Database.get().conexao()) {
            Jdbc.executar(c, """
                    INSERT INTO log_acesso (servico, origem, data_hora, ip_cliente, profissional_id, registro,
                                            metodo, rota, status_code, tempo_ms, dispositivo_id)
                    VALUES (?, 'SERVIDOR', ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    servico, dataHora, ip, u == null ? null : u.id(), u == null ? null : u.registroCompleto(),
                    metodo, rota, status, BigDecimal.valueOf(ms).setScale(2, RoundingMode.HALF_UP), dispositivo);
        } catch (SQLException e) {
            System.err.println("Falha ao gravar log_acesso: " + e.getMessage());
        }
    }

    /** Logs gerados no cliente durante o modo offline. Retorna true se era novo (não duplicado). */
    public boolean registrarLogCliente(Connection c, UUID idLocal, OffsetDateTime dataHora, String ip, Usuario u,
                                       String metodo, String rota, Integer status, BigDecimal ms,
                                       String dispositivo) throws SQLException {
        return Jdbc.executar(c, """
                INSERT INTO log_acesso (servico, origem, data_hora, ip_cliente, profissional_id, registro,
                                        metodo, rota, status_code, tempo_ms, dispositivo_id, id_local)
                VALUES ('client-app', 'CLIENTE_OFFLINE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id_local) DO NOTHING""",
                dataHora, ip, u.id(), u.registroCompleto(), metodo, rota, status, ms, dispositivo, idLocal) > 0;
    }

    public List<Map<String, Object>> listar(Connection c, int limite) throws SQLException {
        return Jdbc.consultar(c, "SELECT * FROM log_acesso ORDER BY data_hora DESC, id DESC LIMIT ?", limite);
    }
}
