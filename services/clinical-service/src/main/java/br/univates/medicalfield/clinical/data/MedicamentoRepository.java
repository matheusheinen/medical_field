package br.univates.medicalfield.clinical.data;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Padrão Repository para o cadastro de apoio "medicamento": todo o SQL da tabela fica aqui,
 * e as regras (validação, inativação em vez de exclusão, auditoria) ficam no MedicamentoService.
 *
 * Separado do ClinicalRepository porque medicamento não é uma entidade sincronizada pelo
 * EntityDef (não tem versão, conflito nem vínculo): é mantido pelo portal e só descido no pull.
 */
public final class MedicamentoRepository {

    public List<Map<String, Object>> listar(Connection c, boolean incluirInativos) throws SQLException {
        return Jdbc.consultar(c, "SELECT * FROM medicamento"
                + (incluirInativos ? "" : " WHERE ativo") + " ORDER BY nome");
    }

    public Map<String, Object> buscar(Connection c, UUID id) throws SQLException {
        return Jdbc.umOuNulo(c, "SELECT * FROM medicamento WHERE id = ?", id);
    }

    /** {@code dados} já validados pelo service (chaves: nome, principioAtivo, apresentacao, viaPadrao, doseMaxima, unidade). */
    public void inserir(Connection c, UUID id, Map<String, Object> dados) throws SQLException {
        Jdbc.executar(c, """
                INSERT INTO medicamento (id, nome, principio_ativo, apresentacao, via_padrao, dose_maxima, unidade, ativo)
                VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)""",
                id, dados.get("nome"), dados.get("principioAtivo"), dados.get("apresentacao"),
                dados.get("viaPadrao"), dados.get("doseMaxima"), dados.get("unidade"));
    }

    /** Atualiza "atualizado_em": é isso que faz a alteração (inclusive a inativação) chegar aos dispositivos no pull. */
    public void atualizar(Connection c, UUID id, Map<String, Object> dados, boolean ativo) throws SQLException {
        Jdbc.executar(c, """
                UPDATE medicamento SET nome = ?, principio_ativo = ?, apresentacao = ?, via_padrao = ?,
                       dose_maxima = ?, unidade = ?, ativo = ?, atualizado_em = now()
                 WHERE id = ?""",
                dados.get("nome"), dados.get("principioAtivo"), dados.get("apresentacao"), dados.get("viaPadrao"),
                dados.get("doseMaxima"), dados.get("unidade"), ativo, id);
    }

    /** Medicamentos alterados desde um instante (para o pull do cliente); sem instante, todos. */
    public List<Map<String, Object>> alteradosDesde(Connection c, OffsetDateTime desde) throws SQLException {
        return desde == null
                ? Jdbc.consultar(c, "SELECT * FROM medicamento ORDER BY nome")
                : Jdbc.consultar(c, "SELECT * FROM medicamento WHERE atualizado_em > ?::timestamptz - interval '5 seconds' ORDER BY nome", desde);
    }
}
