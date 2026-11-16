package br.univates.medicalfield.clinical.service;

import br.univates.medicalfield.clinical.data.*;
import br.univates.medicalfield.clinical.http.ApiException;
import br.univates.medicalfield.clinical.http.Router;
import br.univates.medicalfield.clinical.security.JwtVerifier.Usuario;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Padrão Facade: expõe a sincronização como duas operações simples (pull e push),
 * escondendo transações, idempotência, estratégias de conflito e auditoria.
 */
public final class SyncService {
    private final ClinicalRepository repo;
    private final UpsertService upsert;

    public SyncService(ClinicalRepository repo, UpsertService upsert) {
        this.repo = repo;
        this.upsert = upsert;
    }

    /** Servidor -> cliente: tudo que mudou no servidor desde o último pull do dispositivo. */
    public Map<String, Object> pull(String desdeParam) throws SQLException {
        OffsetDateTime desde = desdeParam == null || desdeParam.isBlank() ? null : EntityDef.dataHora(desdeParam);
        try (Connection c = Database.get().conexao()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("servidorAgora", EntityDef.dataHora(Jdbc.umOuNulo(c, "SELECT now() AS agora").get("agora")));
            r.put("desde", desde);
            r.put("medicamentos", repo.medicamentosDesde(c, desde));
            for (EntityDef def : List.of(Entities.PESSOA, Entities.PRONTUARIO, Entities.ATENDIMENTO)) {
                List<Map<String, Object>> registros = new ArrayList<>();
                for (UUID id : repo.idsAlteradosDesde(c, def, desde)) registros.add(repo.buscar(c, def, id, false));
                r.put(def.nome() + "s", registros);   // pessoas, prontuarios, atendimentos
            }
            return r;
        }
    }

    /**
     * Cliente -> servidor: processa a Outbox do dispositivo NA ORDEM recebida
     * (pessoa antes de prontuário antes de atendimento). Cada operação tem sua
     * própria transação: uma falha não desfaz as demais.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> push(Usuario usuario, Map<String, Object> corpo, String dispositivoHeader) throws SQLException {
        Object ops = corpo.get("operacoes");
        if (!(ops instanceof List<?> operacoes)) throw new ApiException(400, "Informe 'operacoes': [...]");
        String dispositivo = corpo.get("dispositivoId") != null ? corpo.get("dispositivoId").toString() : dispositivoHeader;

        List<Map<String, Object>> resultados = new ArrayList<>();
        try (Connection c = Database.get().conexao()) {
            c.setAutoCommit(false);
            for (Object o : operacoes) {
                Map<String, Object> op = (Map<String, Object>) o;
                try {
                    UUID opId = UUID.fromString(String.valueOf(op.get("opId")));
                    EntityDef def = Entities.porNome((String) op.get("entidade"));
                    Map<String, Object> dados = (Map<String, Object>) op.get("dados");
                    if (dados == null) throw new ApiException(400, "Operação sem 'dados'");
                    var ctx = new UpsertService.Contexto(usuario.id(), dispositivo, opId, "SYNC_PUSH");
                    resultados.add(upsert.executar(c, def, dados, ctx));
                    c.commit();
                } catch (Exception e) {
                    c.rollback();
                    Map<String, Object> erro = new LinkedHashMap<>();
                    erro.put("opId", op.get("opId"));
                    erro.put("entidade", op.get("entidade"));
                    erro.put("status", "ERRO");
                    erro.put("mensagem", mensagemErro(e));
                    resultados.add(erro);
                }
            }
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("processadas", resultados.size());
        r.put("resultados", resultados);
        return r;
    }

    /** Erros de validação vão como estão; erros de banco/internos viram mensagem clara (detalhe só no log). */
    private static String mensagemErro(Exception e) {
        if (e instanceof ApiException) return e.getMessage();
        System.err.println("Erro no push: " + e);
        return e instanceof SQLException s ? Router.mensagemSql(s) : "Erro interno do servidor";
    }

    /** Gravação direta (POST /pessoa, /prontuario, /atendimento), também idempotente. */
    public Map<String, Object> gravarDireto(EntityDef def, Usuario usuario, Map<String, Object> dados,
                                            String chaveIdempotencia, String dispositivo) throws SQLException {
        UUID opId = null;
        if (chaveIdempotencia != null && !chaveIdempotencia.isBlank()) {
            try { opId = UUID.fromString(chaveIdempotencia); }
            catch (IllegalArgumentException e) { opId = UUID.nameUUIDFromBytes(chaveIdempotencia.getBytes()); }
        }
        try (Connection c = Database.get().conexao()) {
            c.setAutoCommit(false);
            try {
                var r = upsert.executar(c, def, dados, new UpsertService.Contexto(usuario.id(), dispositivo, opId, "API_DIRETA"));
                c.commit();
                return r;
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        }
    }
}
