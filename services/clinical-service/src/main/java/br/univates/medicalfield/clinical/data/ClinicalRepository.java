package br.univates.medicalfield.clinical.data;

import br.univates.medicalfield.clinical.data.EntityDef.Campo;

import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Padrão Repository (lado servidor): isola o SQL das regras de negócio.
 * Métodos genéricos (buscar/inserir/atualizar) servem às 3 entidades via EntityDef.
 */
public final class ClinicalRepository {

    // ------------------------------------------------------------------ genéricos

    /** Busca o registro com valores normalizados + metadados de versão. */
    public Map<String, Object> buscar(Connection c, EntityDef def, UUID id, boolean bloquear) throws SQLException {
        String cols = def.campos().stream().map(Campo::coluna).collect(Collectors.joining(", "));
        String sql = "SELECT " + cols + ", versao, atualizado_em, criado_offline, sincronizado_em FROM "
                + def.tabela() + " WHERE id = ?" + (bloquear ? " FOR UPDATE" : "");
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setObject(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Map<String, Object> r = new LinkedHashMap<>();
                for (Campo campo : def.campos()) {
                    r.put(campo.json(), EntityDef.normalizar(campo.tipo(), rs.getObject(campo.coluna())));
                }
                r.put("versao", rs.getInt("versao"));
                r.put("atualizadoEm", EntityDef.dataHora(rs.getTimestamp("atualizado_em")));
                r.put("criadoOffline", rs.getBoolean("criado_offline"));
                r.put("sincronizadoEm", EntityDef.dataHora(rs.getTimestamp("sincronizado_em")));
                if (def.temMedicamentos()) r.put("medicamentos", itensMedicamento(c, id));
                return r;
            }
        }
    }

    public void inserir(Connection c, EntityDef def, Map<String, Object> dados, int versao,
                        OffsetDateTime atualizadoEm, UUID atualizadoPor, boolean criadoOffline) throws SQLException {
        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        for (Campo campo : def.campos()) { cols.add(campo.coluna()); vals.add(dados.get(campo.json())); }
        cols.addAll(List.of("versao", "atualizado_em", "atualizado_por", "criado_offline", "sincronizado_em"));
        vals.addAll(Arrays.asList(versao, atualizadoEm, atualizadoPor, criadoOffline));
        String ph = String.join(", ", Collections.nCopies(vals.size(), "?")) + ", now()";
        Jdbc.executar(c, "INSERT INTO " + def.tabela() + " (" + String.join(", ", cols) + ") VALUES (" + ph + ")",
                vals.toArray());
        if (def.temMedicamentos()) substituirItens(c, (UUID) dados.get("id"), lista(dados.get("medicamentos")));
    }

    public void atualizar(Connection c, EntityDef def, Map<String, Object> dados, int versao,
                          OffsetDateTime atualizadoEm, UUID atualizadoPor) throws SQLException {
        List<String> sets = new ArrayList<>();
        List<Object> vals = new ArrayList<>();
        for (Campo campo : def.campos()) {
            if (campo.json().equals("id")) continue;
            sets.add(campo.coluna() + " = ?");
            vals.add(dados.get(campo.json()));
        }
        sets.addAll(List.of("versao = ?", "atualizado_em = ?", "atualizado_por = ?", "sincronizado_em = now()"));
        vals.addAll(Arrays.asList(versao, atualizadoEm, atualizadoPor));
        vals.add(dados.get("id"));
        Jdbc.executar(c, "UPDATE " + def.tabela() + " SET " + String.join(", ", sets) + " WHERE id = ?", vals.toArray());
        if (def.temMedicamentos()) substituirItens(c, (UUID) dados.get("id"), lista(dados.get("medicamentos")));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> lista(Object o) {
        return o == null ? List.of() : (List<Map<String, Object>>) o;
    }

    // ------------------------------------------------------------------ medicamentos do atendimento

    public List<Map<String, Object>> itensMedicamento(Connection c, UUID atendimentoId) throws SQLException {
        List<Map<String, Object>> itens = new ArrayList<>();
        for (Map<String, Object> linha : Jdbc.consultar(c,
                "SELECT id, medicamento_id, dose, unidade, via, horario FROM atendimento_medicamento " +
                "WHERE atendimento_id = ? ORDER BY horario NULLS LAST, id", atendimentoId)) {
            itens.add(normalizarItem(linha));
        }
        return itens;
    }

    public static Map<String, Object> normalizarItem(Map<String, ?> origem) {
        Map<String, Object> r = new LinkedHashMap<>();
        for (Campo campo : Entities.ITEM_MEDICAMENTO) {
            r.put(campo.json(), EntityDef.normalizar(campo.tipo(), origem.get(campo.json())));
        }
        return r;
    }

    private void substituirItens(Connection c, UUID atendimentoId, List<Map<String, Object>> itens) throws SQLException {
        Jdbc.executar(c, "DELETE FROM atendimento_medicamento WHERE atendimento_id = ?", atendimentoId);
        for (Map<String, Object> i : itens) {
            Jdbc.executar(c, "INSERT INTO atendimento_medicamento (id, atendimento_id, medicamento_id, dose, unidade, via, horario) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    i.get("id"), atendimentoId, i.get("medicamentoId"), i.get("dose"), i.get("unidade"), i.get("via"), i.get("horario"));
        }
    }

    // ------------------------------------------------------------------ consultas para as telas/rotas

    public List<Map<String, Object>> listarPessoas(Connection c) throws SQLException {
        return Jdbc.consultar(c, """
                SELECT p.*, (SELECT count(*) FROM atendimento a WHERE a.pessoa_id = p.id) AS total_atendimentos
                  FROM pessoa p ORDER BY p.nome""");
    }

    public List<Map<String, Object>> listarProntuarios(Connection c) throws SQLException {
        return Jdbc.consultar(c, """
                SELECT pr.*, p.nome AS pessoa_nome, p.cpf AS pessoa_cpf
                  FROM prontuario pr JOIN pessoa p ON p.id = pr.pessoa_id
                 ORDER BY pr.sincronizado_em DESC""");
    }

    /** Aceita o id da pessoa ou o id do próprio prontuário. */
    public Map<String, Object> prontuarioDaPessoa(Connection c, UUID id) throws SQLException {
        Map<String, Object> pr = Jdbc.umOuNulo(c, """
                SELECT pr.*, p.nome AS pessoa_nome, p.cpf AS pessoa_cpf, p.data_nascimento AS pessoa_data_nascimento
                  FROM prontuario pr JOIN pessoa p ON p.id = pr.pessoa_id
                 WHERE pr.pessoa_id = ? OR pr.id = ?""", id, id);
        if (pr != null) pr.put("atendimentos", atendimentosDaPessoa(c, (UUID) pr.get("pessoaId")));
        return pr;
    }

    private static final String SQL_ATENDIMENTO_RESUMO = """
            SELECT a.id, a.pessoa_id, a.prontuario_id, a.data_hora, a.local_ocorrencia, a.queixa_principal,
                   a.triagem_manchester, a.triagem_start, a.glasgow_total, a.destino, a.versao,
                   a.criado_offline, a.atualizado_em, a.sincronizado_em,
                   p.nome AS pessoa_nome, pf.nome AS profissional_nome,
                   pf.tipo_registro || ' ' || pf.registro AS profissional_registro
              FROM atendimento a
              JOIN pessoa p ON p.id = a.pessoa_id
              LEFT JOIN profissional pf ON pf.id = a.profissional_id
            """;

    public List<Map<String, Object>> listarAtendimentos(Connection c) throws SQLException {
        return Jdbc.consultar(c, SQL_ATENDIMENTO_RESUMO + " ORDER BY a.data_hora DESC");
    }

    public List<Map<String, Object>> atendimentosDaPessoa(Connection c, UUID pessoaId) throws SQLException {
        return Jdbc.consultar(c, SQL_ATENDIMENTO_RESUMO + " WHERE a.pessoa_id = ? OR a.id = ? ORDER BY a.data_hora DESC",
                pessoaId, pessoaId);
    }

    /** Ficha completa (usada pelo document-service para gerar o PDF). */
    public Map<String, Object> fichaAtendimento(Connection c, UUID id) throws SQLException {
        Map<String, Object> a = Jdbc.umOuNulo(c, "SELECT * FROM atendimento WHERE id = ?", id);
        if (a == null) return null;
        Map<String, Object> ficha = new LinkedHashMap<>();
        ficha.put("atendimento", a);
        ficha.put("pessoa", Jdbc.umOuNulo(c, "SELECT * FROM pessoa WHERE id = ?", a.get("pessoaId")));
        ficha.put("prontuario", Jdbc.umOuNulo(c, "SELECT * FROM prontuario WHERE id = ?", a.get("prontuarioId")));
        ficha.put("profissional", Jdbc.umOuNulo(c,
                "SELECT id, nome, tipo_registro, registro, uf FROM profissional WHERE id = ?", a.get("profissionalId")));
        ficha.put("medicamentos", Jdbc.consultar(c, """
                SELECT am.id, am.dose, am.unidade, am.via, am.horario,
                       m.id AS medicamento_id, m.nome, m.principio_ativo, m.apresentacao
                  FROM atendimento_medicamento am JOIN medicamento m ON m.id = am.medicamento_id
                 WHERE am.atendimento_id = ? ORDER BY am.horario NULLS LAST""", id));
        return ficha;
    }

    /** Ids alterados no servidor desde um instante (para o pull do cliente). */
    public List<UUID> idsAlteradosDesde(Connection c, EntityDef def, OffsetDateTime desde) throws SQLException {
        List<UUID> ids = new ArrayList<>();
        String sql = "SELECT id FROM " + def.tabela()
                + (desde == null ? "" : " WHERE sincronizado_em > ?::timestamptz - interval '5 seconds'")
                + " ORDER BY sincronizado_em";
        List<Map<String, Object>> linhas = desde == null ? Jdbc.consultar(c, sql) : Jdbc.consultar(c, sql, desde);
        for (Map<String, Object> l : linhas) ids.add((UUID) l.get("id"));
        return ids;
    }

    // ------------------------------------------------------------------ cadastro duplicado (vínculo)

    /** Id do servidor para um id gerado no dispositivo: o próprio id, ou o registro ao qual ele foi vinculado. */
    public UUID resolverVinculo(Connection c, String entidade, UUID id) throws SQLException {
        if (id == null) return null;
        Map<String, Object> v = Jdbc.umOuNulo(c,
                "SELECT id_destino FROM registro_vinculado WHERE entidade = ? AND id_origem = ?", entidade, id);
        return v == null ? id : (UUID) v.get("idDestino");
    }

    public void registrarVinculo(Connection c, String entidade, UUID origem, UUID destino,
                                 UUID profissionalId, String dispositivoId) throws SQLException {
        Jdbc.executar(c, """
                INSERT INTO registro_vinculado (entidade, id_origem, id_destino, profissional_id, dispositivo_id)
                VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING""",
                entidade, origem, destino, profissionalId, dispositivoId);
    }

    /**
     * Registro já existente que representa o MESMO dado de um cadastro novo vindo de outro dispositivo:
     * pessoa com o mesmo CPF (só os dígitos) ou o prontuário da mesma pessoa (há um por pessoa).
     */
    public UUID buscarEquivalente(Connection c, EntityDef def, Map<String, Object> dados) throws SQLException {
        Map<String, Object> r = null;
        if (def == Entities.PESSOA && dados.get("cpf") != null) {
            String digitos = dados.get("cpf").toString().replaceAll("\\D", "");
            if (digitos.isEmpty()) return null;
            r = Jdbc.umOuNulo(c, "SELECT id FROM pessoa WHERE regexp_replace(cpf, '[^0-9]', '', 'g') = ? LIMIT 1", digitos);
        } else if (def == Entities.PRONTUARIO && dados.get("pessoaId") != null) {
            r = Jdbc.umOuNulo(c, "SELECT id FROM prontuario WHERE pessoa_id = ?", dados.get("pessoaId"));
        }
        return r == null ? null : (UUID) r.get("id");
    }
}
