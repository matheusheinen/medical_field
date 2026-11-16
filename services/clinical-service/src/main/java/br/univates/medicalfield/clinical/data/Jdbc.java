package br.univates.medicalfield.clinical.data;

import br.univates.medicalfield.clinical.http.Json;

import java.sql.*;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

/** Utilitários JDBC: executa SQL parametrizado e converte linhas em Map (chaves em camelCase). */
public final class Jdbc {
    private Jdbc() {}

    public static List<Map<String, Object>> consultar(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            vincular(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData md = rs.getMetaData();
                List<Map<String, Object>> linhas = new ArrayList<>();
                while (rs.next()) {
                    Map<String, Object> linha = new LinkedHashMap<>();
                    for (int i = 1; i <= md.getColumnCount(); i++) {
                        linha.put(camel(md.getColumnLabel(i)), converter(rs.getObject(i)));
                    }
                    linhas.add(linha);
                }
                return linhas;
            }
        }
    }

    public static Map<String, Object> umOuNulo(Connection c, String sql, Object... params) throws SQLException {
        List<Map<String, Object>> l = consultar(c, sql, params);
        return l.isEmpty() ? null : l.get(0);
    }

    public static int executar(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            vincular(ps, params);
            return ps.executeUpdate();
        }
    }

    static void vincular(PreparedStatement ps, Object... params) throws SQLException {
        for (int i = 0; i < params.length; i++) {
            Object p = params[i];
            if (p == null) ps.setNull(i + 1, Types.OTHER);
            else ps.setObject(i + 1, p);
        }
    }

    static Object converter(Object v) {
        if (v instanceof Timestamp ts) return OffsetDateTime.ofInstant(ts.toInstant(), ZoneOffset.UTC);
        if (v instanceof java.sql.Date d) return d.toLocalDate();
        if (v instanceof org.postgresql.util.PGobject) return Json.sanitizar(v);
        return v;
    }

    /** "data_hora" -> "dataHora" */
    public static String camel(String snake) {
        StringBuilder sb = new StringBuilder();
        boolean maiuscula = false;
        for (char ch : snake.toCharArray()) {
            if (ch == '_') { maiuscula = true; continue; }
            sb.append(maiuscula ? Character.toUpperCase(ch) : ch);
            maiuscula = false;
        }
        return sb.toString();
    }
}
