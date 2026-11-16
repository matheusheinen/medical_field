package br.univates.medicalfield.clinical.http;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.postgresql.util.PGobject;

import java.io.IOException;
import java.io.InputStream;
import java.time.temporal.Temporal;
import java.util.*;

/** Conversão JSON (Jackson) + normalização de tipos Java/SQL para tipos JSON. */
public final class Json {
    public static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(JsonGenerator.Feature.WRITE_BIGDECIMAL_AS_PLAIN, true);

    private static final java.time.format.DateTimeFormatter DATA_HORA =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");

    private Json() {}

    public static byte[] escrever(Object o) throws IOException {
        return MAPPER.writeValueAsBytes(sanitizar(o));
    }

    public static String texto(Object o) {
        try { return MAPPER.writeValueAsString(sanitizar(o)); }
        catch (IOException e) { throw new RuntimeException(e); }
    }

    public static Map<String, Object> lerMapa(InputStream in) throws IOException {
        byte[] bytes = in.readAllBytes();
        if (bytes.length == 0) return new LinkedHashMap<>();
        return MAPPER.readValue(bytes, new TypeReference<LinkedHashMap<String, Object>>() {});
    }

    /** Converte UUID, datas e JSONB do PostgreSQL em String/Map serializáveis. */
    public static Object sanitizar(Object o) {
        if (o == null) return null;
        if (o instanceof Map<?, ?> m) {
            Map<String, Object> r = new LinkedHashMap<>();
            m.forEach((k, v) -> r.put(String.valueOf(k), sanitizar(v)));
            return r;
        }
        if (o instanceof Collection<?> c) {
            List<Object> l = new ArrayList<>();
            for (Object x : c) l.add(sanitizar(x));
            return l;
        }
        // datas/horas sempre como 2026-10-21T22:05:00.000Z (formato fixo, fácil de ler em JS e Python)
        if (o instanceof java.time.OffsetDateTime t) return DATA_HORA.format(t.withOffsetSameInstant(java.time.ZoneOffset.UTC));
        if (o instanceof java.time.Instant i) return DATA_HORA.format(i.atOffset(java.time.ZoneOffset.UTC));
        if (o instanceof UUID || o instanceof Temporal) return o.toString();
        if (o instanceof java.sql.Timestamp ts) return ts.toInstant().toString();
        if (o instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (o instanceof PGobject pg) {
            try { return pg.getValue() == null ? null : MAPPER.readValue(pg.getValue(), Object.class); }
            catch (IOException e) { return pg.getValue(); }
        }
        return o;
    }
}
