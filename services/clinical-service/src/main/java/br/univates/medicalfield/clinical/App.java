package br.univates.medicalfield.clinical;

import br.univates.medicalfield.clinical.data.*;
import br.univates.medicalfield.clinical.http.*;
import br.univates.medicalfield.clinical.security.JwtVerifier.Usuario;
import br.univates.medicalfield.clinical.service.MedicamentoService;
import br.univates.medicalfield.clinical.service.SyncService;
import br.univates.medicalfield.clinical.service.UpsertService;
import br.univates.medicalfield.clinical.sync.ConflictStrategyFactory;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpServer;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.sql.Connection;
import java.util.*;
import java.util.concurrent.Executors;

/**
 * MedicalField - Clinical/Sync Service (Java 21, sem framework).
 * Cadastros clínicos, sincronização offline-first, auditoria e recepção de logs offline.
 */
public final class App {

    private interface ComConexao { Object executar(Connection c) throws Exception; }

    private static Object comConexao(ComConexao f) throws Exception {
        try (Connection c = Database.get().conexao()) { return f.executar(c); }
    }

    private static Object encontrado(Object o, String msg) {
        if (o == null) throw new ApiException(404, msg);
        return o;
    }

    public static void main(String[] args) throws Exception {
        Config.exigirSegredoJwt();   // fail-fast: sem segredo forte o serviço não sobe
        ClinicalRepository repo = new ClinicalRepository();
        AuditRepository auditoria = new AuditRepository();
        LogRepository logs = new LogRepository();
        UpsertService upsert = new UpsertService(repo, auditoria, new ConflictStrategyFactory());
        MedicamentoRepository medicamentoRepo = new MedicamentoRepository();
        SyncService sync = new SyncService(repo, medicamentoRepo, upsert);
        MedicamentoService medicamentos = new MedicamentoService(medicamentoRepo, auditoria);

        Router r = new Router();

        // ---------------- cadastro de medicamentos
        // ?todos=true lista também os inativos (só para ADMIN; os dispositivos recebem tudo pelo /sync/pull)
        r.get("/medicamento", ctx -> medicamentos.listar(ctx.usuario().admin() && "true".equals(ctx.query("todos"))));
        r.postAdmin("/medicamento", ctx -> { ctx.status(201); return medicamentos.criar(ctx.usuario(), ctx.corpo()); });
        r.putAdmin("/medicamento/{id}", ctx -> medicamentos.atualizar(ctx.usuario(), ctx.uuidParam("id"), ctx.corpo()));

        // ---------------- pessoa
        r.get("/pessoa", ctx -> comConexao(repo::listarPessoas));
        r.get("/pessoa/{id}", ctx -> encontrado(comConexao(c -> repo.buscar(c, Entities.PESSOA, ctx.uuidParam("id"), false)),
                "Pessoa não encontrada"));
        r.post("/pessoa", ctx -> gravar(ctx, sync, Entities.PESSOA));

        // ---------------- prontuário
        r.get("/prontuario", ctx -> comConexao(repo::listarProntuarios));
        r.get("/prontuario/{id}", ctx -> encontrado(comConexao(c -> repo.prontuarioDaPessoa(c, ctx.uuidParam("id"))),
                "Prontuário não encontrado"));
        r.post("/prontuario", ctx -> gravar(ctx, sync, Entities.PRONTUARIO));

        // ---------------- atendimento
        r.get("/atendimento", ctx -> comConexao(repo::listarAtendimentos));
        r.get("/atendimento/detalhe/{id}", ctx -> encontrado(comConexao(c -> repo.fichaAtendimento(c, ctx.uuidParam("id"))),
                "Atendimento não encontrado"));
        r.get("/atendimento/{id}", ctx -> comConexao(c -> repo.atendimentosDaPessoa(c, ctx.uuidParam("id"))));
        r.post("/atendimento", ctx -> gravar(ctx, sync, Entities.ATENDIMENTO));

        // ---------------- sincronização offline-first
        r.get("/sync/pull", ctx -> sync.pull(ctx.query("desde")));
        r.post("/sync/push", ctx -> sync.push(ctx.usuario(), ctx.corpo(), ctx.header("X-Device-Id")));

        // ---------------- logs e auditoria
        r.post("/log", ctx -> receberLogs(ctx, logs));
        r.getAdmin("/log", ctx -> comConexao(c -> logs.listar(c, limite(ctx, 200))));
        r.getAdmin("/auditoria", ctx -> comConexao(c -> auditoria.listar(c,
                ctx.query("entidadeId") == null ? null : UUID.fromString(ctx.query("entidadeId")), limite(ctx, 200))));

        HttpServer server = HttpServer.create(new InetSocketAddress(Config.PORT), 0);
        HttpContext contexto = server.createContext("/", r);
        // Cadeia de filtros (Chain of Responsibility): log de acesso -> autenticação -> rota
        contexto.getFilters().add(new AccessLogFilter());
        contexto.getFilters().add(new AuthFilter());
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        System.out.println("clinical-service ouvindo na porta " + Config.PORT);
    }

    private static Object gravar(Ctx ctx, SyncService sync, EntityDef def) throws Exception {
        Map<String, Object> r = sync.gravarDireto(def, ctx.usuario(), ctx.corpo(),
                ctx.header("Idempotency-Key"), ctx.header("X-Device-Id"));
        if ("CRIADO".equals(r.get("status"))) ctx.status(201);
        return r;
    }

    private static int limite(Ctx ctx, int padrao) {
        try { return Math.min(Integer.parseInt(ctx.query("limite")), 2000); }
        catch (Exception e) { return padrao; }
    }

    /** POST /log  { dispositivoId, logs: [ {id, dataHora, metodo, rota, statusCode, tempoMs, ip} ] } */
    @SuppressWarnings("unchecked")
    private static Object receberLogs(Ctx ctx, LogRepository logs) throws Exception {
        Map<String, Object> corpo = ctx.corpo();
        if (!(corpo.get("logs") instanceof List<?> lista)) throw new ApiException(400, "Informe 'logs': [...]");
        Usuario u = ctx.usuario();
        String dispositivo = corpo.get("dispositivoId") != null ? corpo.get("dispositivoId").toString() : ctx.header("X-Device-Id");
        int novos = 0;
        try (Connection c = Database.get().conexao()) {
            for (Object o : lista) {
                Map<String, Object> l = (Map<String, Object>) o;
                UUID idLocal = l.get("id") == null ? null : UUID.fromString(l.get("id").toString());
                boolean novo = logs.registrarLogCliente(c, idLocal, EntityDef.dataHora(l.get("dataHora")),
                        Objects.toString(l.get("ip"), "dispositivo-local"), u,
                        Objects.toString(l.get("metodo"), null), Objects.toString(l.get("rota"), null),
                        l.get("statusCode") instanceof Number n ? n.intValue() : null,
                        l.get("tempoMs") == null ? null : new BigDecimal(l.get("tempoMs").toString()),
                        dispositivo);
                if (novo) novos++;
            }
        }
        return Map.of("recebidos", lista.size(), "gravados", novos, "duplicadosIgnorados", lista.size() - novos);
    }
}
