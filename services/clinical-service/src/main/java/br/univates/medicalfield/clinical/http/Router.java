package br.univates.medicalfield.clinical.http;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.sql.SQLException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Roteador simples: associa (método, caminho com {parametros}) a um handler. */
public final class Router implements HttpHandler {

    @FunctionalInterface
    public interface Handler { Object handle(Ctx ctx) throws Exception; }

    private record Rota(String metodo, Pattern padrao, List<String> nomes, Handler handler, boolean somenteAdmin) {}

    private final List<Rota> rotas = new ArrayList<>();

    // Rotas para qualquer profissional autenticado
    public Router get(String caminho, Handler h)  { return add("GET", caminho, h, false); }
    public Router post(String caminho, Handler h) { return add("POST", caminho, h, false); }

    // Rotas restritas ao perfil ADMIN (portal administrativo)
    public Router getAdmin(String caminho, Handler h)  { return add("GET", caminho, h, true); }
    public Router postAdmin(String caminho, Handler h) { return add("POST", caminho, h, true); }
    public Router putAdmin(String caminho, Handler h)  { return add("PUT", caminho, h, true); }

    private Router add(String metodo, String caminho, Handler h, boolean admin) {
        List<String> nomes = new ArrayList<>();
        Matcher m = Pattern.compile("\\{(\\w+)}").matcher(caminho);
        while (m.find()) nomes.add(m.group(1));
        String regex = "^" + caminho.replaceAll("\\{\\w+}", "([^/]+)") + "/?$";
        rotas.add(new Rota(metodo, Pattern.compile(regex), nomes, h, admin));
        return this;
    }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        String caminho = ex.getRequestURI().getPath();
        boolean caminhoExiste = false;
        try {
            for (Rota r : rotas) {
                Matcher m = r.padrao().matcher(caminho);
                if (!m.matches()) continue;
                caminhoExiste = true;
                if (!r.metodo().equalsIgnoreCase(ex.getRequestMethod())) continue;

                Map<String, String> params = new HashMap<>();
                for (int i = 0; i < r.nomes().size(); i++) params.put(r.nomes().get(i), m.group(i + 1));
                Ctx ctx = new Ctx(ex, params);
                if (r.somenteAdmin() && !ctx.usuario().admin()) {
                    throw new ApiException(403, "Acesso restrito ao perfil ADMIN");
                }
                Object resposta = r.handler().handle(ctx);
                enviar(ex, ctx.status(), resposta);
                return;
            }
            if (caminhoExiste) throw new ApiException(405, "Método não permitido");
            throw new ApiException(404, "Rota não encontrada");
        } catch (ApiException e) {
            enviar(ex, e.status(), Map.of("erro", e.getMessage()));
        } catch (SQLException e) {
            // O detalhe técnico vai só para o log do servidor; o cliente recebe uma mensagem clara
            System.err.println("Erro SQL [" + e.getSQLState() + "]: " + e.getMessage());
            String estado = e.getSQLState() == null ? "" : e.getSQLState();
            // 23 = regra de integridade (409); 22 = dado inválido enviado pelo cliente (400)
            int status = estado.startsWith("23") ? 409 : estado.startsWith("22") ? 400 : 500;
            enviar(ex, status, Map.of("erro", mensagemSql(e)));
        } catch (Exception e) {
            e.printStackTrace();
            enviar(ex, 500, Map.of("erro", "Erro interno do servidor"));
        }
    }

    /** Mensagem clara para o usuário; o detalhe técnico (constraint, valores) fica só no log. */
    public static String mensagemSql(SQLException e) {
        String estado = e.getSQLState() == null ? "" : e.getSQLState();
        if (estado.equals("23505")) return "Já existe um registro com esses dados (ex.: CPF duplicado)";
        if (estado.equals("23503")) return "Registro relacionado não encontrado no servidor";
        if (estado.startsWith("23")) return "Dados violam uma regra de integridade";
        if (estado.equals("22001")) return "Um dos campos excede o tamanho máximo permitido";
        if (estado.equals("22003")) return "Um dos valores numéricos está fora do intervalo permitido";
        return "Erro no banco de dados";
    }

    public static void enviar(HttpExchange ex, int status, Object corpo) throws IOException {
        byte[] bytes = corpo == null ? new byte[0] : Json.escrever(corpo);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            if (bytes.length > 0) os.write(bytes);
        }
    }
}
