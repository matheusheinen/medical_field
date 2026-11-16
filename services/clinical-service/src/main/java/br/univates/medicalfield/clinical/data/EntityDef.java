package br.univates.medicalfield.clinical.data;

import br.univates.medicalfield.clinical.http.ApiException;

import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Metadados de uma entidade sincronizável (pessoa, prontuário, atendimento).
 * Permite um único Repository genérico e uma única lógica de upsert/conflito
 * para todas as entidades, em vez de código repetido por tabela.
 */
public record EntityDef(String nome, String tabela, List<Campo> campos,
                        Set<String> obrigatorios, Set<String> camposCumulativos, boolean temMedicamentos) {

    public enum Tipo { UUID, TEXTO, INTEIRO, DECIMAL, DATA, DATA_HORA }

    public record Campo(String json, String coluna, Tipo tipo) {}

    public static final ZoneId FUSO_PADRAO = ZoneId.of("America/Sao_Paulo");

    /** Converte qualquer valor (JSON ou JDBC) para um tipo Java canônico e comparável. */
    public static Object normalizar(Tipo tipo, Object v) {
        if (v == null) return null;
        if (v instanceof String s) {
            s = s.trim();
            if (s.isEmpty()) return null;
            v = s;
        }
        try {
            return switch (tipo) {
                case UUID -> v instanceof java.util.UUID u ? u : java.util.UUID.fromString(v.toString());
                case TEXTO -> v.toString();
                case INTEIRO -> v instanceof Number n ? n.intValue() : new BigDecimal(v.toString()).intValue();
                case DECIMAL -> (v instanceof BigDecimal b ? b : new BigDecimal(v.toString())).stripTrailingZeros();
                case DATA -> v instanceof LocalDate d ? d
                        : v instanceof java.sql.Date sd ? sd.toLocalDate()
                        : LocalDate.parse(v.toString().substring(0, 10));
                case DATA_HORA -> dataHora(v);
            };
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(400, "Valor inválido '" + v + "' para o tipo " + tipo);
        }
    }

    /** Datas/horas sempre em UTC e com precisão de milissegundos (igual ao JavaScript). */
    public static OffsetDateTime dataHora(Object v) {
        if (v == null) return null;
        Instant i;
        if (v instanceof OffsetDateTime o) i = o.toInstant();
        else if (v instanceof java.sql.Timestamp ts) i = ts.toInstant();
        else if (v instanceof Instant in) i = in;
        else {
            String s = v.toString().trim();
            try { i = OffsetDateTime.parse(s).toInstant(); }
            catch (DateTimeException e) { i = LocalDateTime.parse(s).atZone(FUSO_PADRAO).toInstant(); }
        }
        return OffsetDateTime.ofInstant(i.truncatedTo(ChronoUnit.MILLIS), ZoneOffset.UTC);
    }

    /** Normaliza o mapa recebido do cliente para os campos desta entidade. */
    public Map<String, Object> normalizar(Map<String, ?> origem) {
        Map<String, Object> r = new LinkedHashMap<>();
        for (Campo c : campos) r.put(c.json(), normalizar(c.tipo(), origem.get(c.json())));
        return r;
    }

    public void validarObrigatorios(Map<String, Object> dados) {
        for (String o : obrigatorios) {
            if (dados.get(o) == null) throw new ApiException(400, "Campo obrigatório ausente em " + nome + ": " + o);
        }
    }
}
