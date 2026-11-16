package br.univates.medicalfield.clinical.http;

import br.univates.medicalfield.clinical.data.LogRepository;
import br.univates.medicalfield.clinical.security.JwtVerifier.Usuario;
import com.sun.net.httpserver.Filter;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Interceptor de log de acesso (LGPD): data/hora, IP, profissional, método, rota, status e tempo. Primeiro elo da cadeia de filtros,
 * por isso registra inclusive as requisições recusadas pela autenticação (401).
 */
public final class AccessLogFilter extends Filter {
    public static final String SERVICO = "clinical-service";
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final LogRepository logs = new LogRepository();

    @Override
    public void doFilter(HttpExchange ex, Chain chain) throws IOException {
        long inicio = System.nanoTime();
        OffsetDateTime dataHora = OffsetDateTime.now(ZoneOffset.UTC);
        try {
            chain.doFilter(ex);
        } finally {
            double ms = (System.nanoTime() - inicio) / 1_000_000.0;
            int status = ex.getResponseCode();
            Usuario u = (Usuario) ex.getAttribute(AuthFilter.ATRIBUTO_USUARIO);
            String ip = ip(ex);
            String rota = ex.getRequestURI().toString();
            String metodo = ex.getRequestMethod();
            String dispositivo = ex.getRequestHeaders().getFirst("X-Device-Id");

            System.out.printf("[%s] %s ip=%s prof=%s %s %s %d %.1fms%n", dataHora, SERVICO, ip,
                    u == null ? "-" : u.registroCompleto(), metodo, rota, status, ms);

            // gravação assíncrona para não atrasar a resposta
            executor.submit(() -> logs.registrarAcesso(SERVICO, dataHora, ip, u, metodo, rota, status, ms, dispositivo));
        }
    }

    private static String ip(HttpExchange ex) {
        String real = ex.getRequestHeaders().getFirst("X-Real-IP");   // definido pelo Nginx
        if (real != null && !real.isBlank()) return real;
        String fwd = ex.getRequestHeaders().getFirst("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].trim();
        return ex.getRemoteAddress().getAddress().getHostAddress();
    }

    @Override
    public String description() { return "Log de acesso"; }
}
