package br.univates.medicalfield.clinical.service;

import br.univates.medicalfield.clinical.data.AuditRepository;
import br.univates.medicalfield.clinical.data.Database;
import br.univates.medicalfield.clinical.data.Jdbc;
import br.univates.medicalfield.clinical.http.ApiException;
import br.univates.medicalfield.clinical.security.JwtVerifier.Usuario;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.*;

/**
 * Cadastro de medicamentos (feito pelo portal administrativo).
 *
 *  - Medicamento nunca é apagado: é INATIVADO (ativo = false), porque atendimentos
 *    antigos continuam apontando para ele.
 *  - Toda gravação atualiza "atualizado_em": é isso que faz o item chegar aos
 *    dispositivos no próximo pull (inclusive a inativação).
 *  - Toda criação/alteração é registrada em auditoria_alteracao (antes/depois).
 */
public final class MedicamentoService {
    private static final String ORIGEM = "PORTAL";
    private final AuditRepository auditoria;

    public MedicamentoService(AuditRepository auditoria) {
        this.auditoria = auditoria;
    }

    public List<Map<String, Object>> listar(boolean incluirInativos) throws SQLException {
        try (Connection c = Database.get().conexao()) {
            return Jdbc.consultar(c, "SELECT * FROM medicamento"
                    + (incluirInativos ? "" : " WHERE ativo") + " ORDER BY nome");
        }
    }

    public Map<String, Object> criar(Usuario usuario, Map<String, Object> corpo) throws SQLException {
        Map<String, Object> m = validar(corpo);
        UUID id = UUID.randomUUID();
        return emTransacao(c -> {
            Jdbc.executar(c, """
                    INSERT INTO medicamento (id, nome, principio_ativo, apresentacao, via_padrao, dose_maxima, unidade, ativo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)""",
                    id, m.get("nome"), m.get("principioAtivo"), m.get("apresentacao"),
                    m.get("viaPadrao"), m.get("doseMaxima"), m.get("unidade"));
            Map<String, Object> depois = buscar(c, id);
            auditoria.registrar(c, "medicamento", id, "INSERT", ORIGEM, null, usuario.id(), null, null, null, depois);
            return depois;
        });
    }

    public Map<String, Object> atualizar(Usuario usuario, UUID id, Map<String, Object> corpo) throws SQLException {
        Map<String, Object> m = validar(corpo);
        boolean ativo = !Boolean.FALSE.equals(corpo.get("ativo"));
        return emTransacao(c -> {
            Map<String, Object> antes = buscar(c, id);
            if (antes == null) throw new ApiException(404, "Medicamento não encontrado");
            Jdbc.executar(c, """
                    UPDATE medicamento SET nome = ?, principio_ativo = ?, apresentacao = ?, via_padrao = ?,
                           dose_maxima = ?, unidade = ?, ativo = ?, atualizado_em = now()
                     WHERE id = ?""",
                    m.get("nome"), m.get("principioAtivo"), m.get("apresentacao"), m.get("viaPadrao"),
                    m.get("doseMaxima"), m.get("unidade"), ativo, id);
            Map<String, Object> depois = buscar(c, id);
            String operacao = Boolean.TRUE.equals(antes.get("ativo")) && !ativo ? "INATIVACAO" : "UPDATE";
            auditoria.registrar(c, "medicamento", id, operacao, ORIGEM, null, usuario.id(), null, null, antes, depois);
            return depois;
        });
    }

    // ------------------------------------------------------------------ internos

    private static Map<String, Object> buscar(Connection c, UUID id) throws SQLException {
        return Jdbc.umOuNulo(c, "SELECT * FROM medicamento WHERE id = ?", id);
    }

    /** Valida o corpo e devolve os valores já normalizados (texto aparado, dose como número). */
    private static Map<String, Object> validar(Map<String, Object> corpo) {
        Map<String, Object> m = new HashMap<>();
        m.put("nome", texto(corpo, "nome", 120));
        m.put("principioAtivo", texto(corpo, "principioAtivo", 120));
        m.put("apresentacao", texto(corpo, "apresentacao", 120));
        m.put("viaPadrao", texto(corpo, "viaPadrao", 30));
        m.put("unidade", texto(corpo, "unidade", 10));
        if (m.get("nome") == null) throw new ApiException(400, "Informe o nome do medicamento");

        Object dose = corpo.get("doseMaxima");
        if (dose != null && !dose.toString().isBlank()) {
            BigDecimal d;
            try { d = new BigDecimal(dose.toString().replace(',', '.')); }
            catch (NumberFormatException e) { throw new ApiException(400, "Dose máxima inválida"); }
            if (d.signum() <= 0) throw new ApiException(400, "A dose máxima deve ser maior que zero");
            m.put("doseMaxima", d);
            if (m.get("unidade") == null) throw new ApiException(400, "Informe a unidade da dose máxima (ex.: mg)");
        }
        return m;
    }

    private static String texto(Map<String, Object> corpo, String campo, int max) {
        Object v = corpo.get(campo);
        if (v == null) return null;
        String s = v.toString().trim();
        if (s.isEmpty()) return null;
        if (s.length() > max) throw new ApiException(400, "Campo '" + campo + "' excede " + max + " caracteres");
        return s;
    }

    private interface Tarefa { Map<String, Object> executar(Connection c) throws SQLException; }

    private static Map<String, Object> emTransacao(Tarefa t) throws SQLException {
        try (Connection c = Database.get().conexao()) {
            c.setAutoCommit(false);
            try {
                Map<String, Object> r = t.executar(c);
                c.commit();
                return r;
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }
}
