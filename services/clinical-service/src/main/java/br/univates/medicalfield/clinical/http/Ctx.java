package br.univates.medicalfield.clinical.http;

import br.univates.medicalfield.clinical.security.JwtVerifier.Usuario;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Contexto de uma requisição: parâmetros de rota, query string, corpo e usuário autenticado. */
public final class Ctx {
    private final HttpExchange ex;
    private final Map<String, String> params;
    private final Map<String, String> query = new HashMap<>();
    private int status = 200;

    Ctx(HttpExchange ex, Map<String, String> params) {
        this.ex = ex;
        this.params = params;
        String q = ex.getRequestURI().getRawQuery();
        if (q != null) {
            for (String par : q.split("&")) {
                String[] kv = par.split("=", 2);
                query.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8),
                        kv.length > 1 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "");
            }
        }
    }

    public Usuario usuario() { return AuthFilter.usuario(ex); }

    public UUID uuidParam(String nome) {
        try { return UUID.fromString(params.get(nome)); }
        catch (Exception e) { throw new ApiException(400, "Parâmetro '" + nome + "' deve ser um UUID"); }
    }

    public String query(String nome) { return query.get(nome); }

    public String header(String nome) { return ex.getRequestHeaders().getFirst(nome); }

    public Map<String, Object> corpo() throws IOException { return Json.lerMapa(ex.getRequestBody()); }

    public void status(int s) { this.status = s; }

    int status() { return status; }
}
