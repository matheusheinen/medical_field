package br.univates.medicalfield.clinical.http;

import br.univates.medicalfield.clinical.security.JwtVerifier;
import com.sun.net.httpserver.Filter;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.Map;

/**
 * Elo da cadeia de filtros (Chain of Responsibility) que exige JWT válido.
 * Neste serviço NÃO existe rota pública: o login fica no auth-service.
 */
public final class AuthFilter extends Filter {
    public static final String ATRIBUTO_USUARIO = "usuario";

    @Override
    public void doFilter(HttpExchange ex, Chain chain) throws IOException {
        String h = ex.getRequestHeaders().getFirst("Authorization");
        if (h == null || !h.startsWith("Bearer ")) {
            Router.enviar(ex, 401, Map.of("erro", "Token ausente"));
            return;
        }
        try {
            ex.setAttribute(ATRIBUTO_USUARIO, JwtVerifier.verificar(h.substring(7)));
        } catch (IllegalArgumentException e) {
            Router.enviar(ex, 401, Map.of("erro", "Token inválido ou expirado"));
            return;
        }
        chain.doFilter(ex);
    }

    @Override
    public String description() { return "Autenticação JWT"; }
}
