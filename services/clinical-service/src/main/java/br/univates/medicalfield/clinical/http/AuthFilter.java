package br.univates.medicalfield.clinical.http;

import br.univates.medicalfield.clinical.security.JwtVerifier;
import br.univates.medicalfield.clinical.security.JwtVerifier.Usuario;
import com.sun.net.httpserver.Filter;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Elo da cadeia de filtros (Chain of Responsibility) que exige JWT válido.
 * Neste serviço NÃO existe rota pública: o login fica no auth-service.
 */
public final class AuthFilter extends Filter {
    /**
     * Usuário autenticado de cada requisição em andamento.
     * Não usar HttpExchange.setAttribute: no HttpServer do JDK os atributos ficam no HttpContext,
     * compartilhados por TODAS as requisições, e uma requisição leria o usuário de outra.
     */
    private static final Map<HttpExchange, Usuario> USUARIOS = new ConcurrentHashMap<>();

    /** Usuário autenticado da requisição (null se ela não passou pela autenticação). */
    public static Usuario usuario(HttpExchange ex) { return USUARIOS.get(ex); }

    /** Libera o usuário ao fim da requisição (chamado pelo AccessLogFilter, primeiro elo da cadeia). */
    static Usuario liberar(HttpExchange ex) { return USUARIOS.remove(ex); }

    @Override
    public void doFilter(HttpExchange ex, Chain chain) throws IOException {
        String h = ex.getRequestHeaders().getFirst("Authorization");
        if (h == null || !h.startsWith("Bearer ")) {
            Router.enviar(ex, 401, Map.of("erro", "Token ausente"));
            return;
        }
        try {
            USUARIOS.put(ex, JwtVerifier.verificar(h.substring(7)));
        } catch (IllegalArgumentException e) {
            Router.enviar(ex, 401, Map.of("erro", "Token inválido ou expirado"));
            return;
        }
        chain.doFilter(ex);
    }

    @Override
    public String description() { return "Autenticação JWT"; }
}
