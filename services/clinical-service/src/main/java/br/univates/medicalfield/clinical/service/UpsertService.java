package br.univates.medicalfield.clinical.service;

import br.univates.medicalfield.clinical.data.*;
import br.univates.medicalfield.clinical.sync.ConflictStrategy;
import br.univates.medicalfield.clinical.sync.ConflictStrategyFactory;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * Núcleo da gravação idempotente, usado tanto pelas rotas diretas (POST /pessoa, /prontuario,
 * /atendimento) quanto pela sincronização em lote (POST /sync/push).
 *
 *  1. op_id já processado ............................ DUPLICADO (nada é regravado)
 *  2. id inexistente no servidor ..................... CRIADO
 *  3. conteúdo idêntico ao do servidor ............... SEM_ALTERACAO
 *  4. versão-base do cliente == versão do servidor ... ATUALIZADO (versão + 1)
 *  5. versões divergentes ............................ CONFLITO_RESOLVIDO pela Strategy da entidade
 *  6. id novo, mas o mesmo dado já existe ............ VINCULADO (ex.: mesmo CPF cadastrado em dois
 *     dispositivos offline): o id do dispositivo passa a apontar para o registro existente e os
 *     dados são mesclados (MERGE). A resposta traz "idOrigem" para o cliente trocar o id local.
 *
 * Toda criação/alteração/conflito é registrada em auditoria_alteracao.
 */
public final class UpsertService {

    public record Contexto(UUID profissionalId, String dispositivoId, UUID opId, String origem) {}

    private final ClinicalRepository repo;
    private final AuditRepository auditoria;
    private final ConflictStrategyFactory estrategias;

    public UpsertService(ClinicalRepository repo, AuditRepository auditoria, ConflictStrategyFactory estrategias) {
        this.repo = repo;
        this.auditoria = auditoria;
        this.estrategias = estrategias;
    }

    /** Deve ser chamado dentro de uma transação (autoCommit=false). */
    public Map<String, Object> executar(Connection c, EntityDef def, Map<String, Object> bruto, Contexto ctx)
            throws SQLException {
        Map<String, Object> cliente = def.normalizar(bruto);
        UUID idOrigem = (UUID) cliente.get("id");
        resolverVinculos(c, def, cliente);   // ids de cadastros que já foram vinculados a outro registro
        UUID id = (UUID) cliente.get("id");

        // 1) Idempotência pela chave da operação
        if (ctx.opId() != null && Jdbc.umOuNulo(c, "SELECT 1 FROM sync_operacao WHERE op_id = ?", ctx.opId()) != null) {
            return resultado(ctx, def, id, idOrigem, "DUPLICADO", null, id == null ? null : repo.buscar(c, def, id, false));
        }

        def.validarObrigatorios(cliente);
        if (def.temMedicamentos()) cliente.put("medicamentos", itens(id, bruto.get("medicamentos")));

        int versaoBase = bruto.get("versao") instanceof Number n ? n.intValue() : 0;
        OffsetDateTime atualizadoEm = bruto.get("atualizadoEm") == null
                ? OffsetDateTime.now(ZoneOffset.UTC) : EntityDef.dataHora(bruto.get("atualizadoEm"));
        boolean criadoOffline = Boolean.TRUE.equals(bruto.get("criadoOffline"));

        Map<String, Object> servidor = repo.buscar(c, def, id, true);

        // 6) Cadastro novo de um dado que já existe (ex.: mesmo CPF vindo de outro dispositivo)
        boolean vinculado = false;
        if (servidor == null) {
            UUID existente = repo.buscarEquivalente(c, def, cliente);
            if (existente != null) {
                repo.registrarVinculo(c, def.nome(), id, existente, ctx.profissionalId(), ctx.dispositivoId());
                id = existente;
                cliente.put("id", id);
                servidor = repo.buscar(c, def, id, true);
                vinculado = true;
            }
        }

        // O responsável pelo atendimento vem SEMPRE do token (nunca do corpo da requisição),
        // senão um profissional poderia registrar atendimentos em nome de outro.
        // Em alterações, mantém o responsável original.
        if (def == Entities.ATENDIMENTO) {
            cliente.put("profissionalId", servidor == null ? ctx.profissionalId() : servidor.get("profissionalId"));
        }
        String status;
        String estrategia = null;

        if (servidor == null) {
            repo.inserir(c, def, cliente, 1, atualizadoEm, ctx.profissionalId(), criadoOffline);
            status = "CRIADO";
            auditoria.registrar(c, def.nome(), id, "INSERT", ctx.origem(), null, ctx.profissionalId(),
                    ctx.dispositivoId(), ctx.opId(), null, cliente);
        } else if (vinculado) {
            // Dois cadastros do mesmo paciente: nada se perde, os campos são mesclados
            ConflictStrategy merge = estrategias.mesclagem();
            Map<String, Object> clienteComData = new LinkedHashMap<>(cliente);
            clienteComData.put("atualizadoEm", atualizadoEm);
            Map<String, Object> resolvido = merge.resolver(def, servidor, clienteComData);
            if (!mesmoConteudo(def, servidor, resolvido)) {
                repo.atualizar(c, def, resolvido, (Integer) servidor.get("versao") + 1,
                        (OffsetDateTime) resolvido.get("atualizadoEm"), ctx.profissionalId());
            }
            status = "VINCULADO";
            estrategia = merge.nome();
            Map<String, Object> antes = new LinkedHashMap<>();
            antes.put("servidor", servidor);
            antes.put("cliente", clienteComData);
            antes.put("idOrigem", idOrigem);
            auditoria.registrar(c, def.nome(), id, "VINCULO", ctx.origem(), estrategia, ctx.profissionalId(),
                    ctx.dispositivoId(), ctx.opId(), antes, resolvido);
        } else if (mesmoConteudo(def, servidor, cliente)) {
            status = "SEM_ALTERACAO";
        } else if (versaoBase == (Integer) servidor.get("versao")) {
            repo.atualizar(c, def, cliente, versaoBase + 1, atualizadoEm, ctx.profissionalId());
            status = "ATUALIZADO";
            auditoria.registrar(c, def.nome(), id, "UPDATE", ctx.origem(), null, ctx.profissionalId(),
                    ctx.dispositivoId(), ctx.opId(), servidor, cliente);
        } else {
            ConflictStrategy s = estrategias.para(def.nome());
            Map<String, Object> clienteComData = new LinkedHashMap<>(cliente);
            clienteComData.put("atualizadoEm", atualizadoEm);
            Map<String, Object> resolvido = s.resolver(def, servidor, clienteComData);
            repo.atualizar(c, def, resolvido, (Integer) servidor.get("versao") + 1,
                    (OffsetDateTime) resolvido.get("atualizadoEm"), ctx.profissionalId());
            status = "CONFLITO_RESOLVIDO";
            estrategia = s.nome();
            Map<String, Object> antes = new LinkedHashMap<>();
            antes.put("servidor", servidor);
            antes.put("cliente", clienteComData);
            antes.put("versaoBaseCliente", versaoBase);
            auditoria.registrar(c, def.nome(), id, "CONFLITO", ctx.origem(), estrategia, ctx.profissionalId(),
                    ctx.dispositivoId(), ctx.opId(), antes, resolvido);
        }

        if (ctx.opId() != null) {
            Jdbc.executar(c, """
                    INSERT INTO sync_operacao (op_id, entidade, entidade_id, profissional_id, dispositivo_id, resultado, estrategia)
                    VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    ctx.opId(), def.nome(), id, ctx.profissionalId(), ctx.dispositivoId(), status, estrategia);
        }
        return resultado(ctx, def, id, idOrigem, status, estrategia, repo.buscar(c, def, id, false));
    }

    /** Troca o próprio id e as referências (pessoaId, prontuarioId) pelos registros aos quais foram vinculados. */
    private void resolverVinculos(Connection c, EntityDef def, Map<String, Object> dados) throws SQLException {
        dados.put("id", repo.resolverVinculo(c, def.nome(), (UUID) dados.get("id")));
        if (dados.containsKey("pessoaId")) {
            dados.put("pessoaId", repo.resolverVinculo(c, "pessoa", (UUID) dados.get("pessoaId")));
        }
        if (dados.containsKey("prontuarioId")) {
            dados.put("prontuarioId", repo.resolverVinculo(c, "prontuario", (UUID) dados.get("prontuarioId")));
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> itens(UUID atendimentoId, Object bruto) {
        List<Map<String, Object>> r = new ArrayList<>();
        if (!(bruto instanceof List<?> lista)) return r;
        int i = 0;
        for (Object o : lista) {
            Map<String, Object> item = ClinicalRepository.normalizarItem((Map<String, Object>) o);
            if (item.get("id") == null) {   // id determinístico => reenvio não duplica o item
                item.put("id", UUID.nameUUIDFromBytes((atendimentoId + "#" + i).getBytes(StandardCharsets.UTF_8)));
            }
            r.add(item);
            i++;
        }
        return r;
    }

    @SuppressWarnings("unchecked")
    private static boolean mesmoConteudo(EntityDef def, Map<String, Object> servidor, Map<String, Object> cliente) {
        for (var campo : def.campos()) {
            if (!Objects.equals(servidor.get(campo.json()), cliente.get(campo.json()))) return false;
        }
        if (def.temMedicamentos()) {
            Comparator<Map<String, Object>> porId = Comparator.comparing(m -> String.valueOf(m.get("id")));
            List<Map<String, Object>> a = new ArrayList<>((List<Map<String, Object>>) servidor.get("medicamentos"));
            List<Map<String, Object>> b = new ArrayList<>((List<Map<String, Object>>) cliente.get("medicamentos"));
            a.sort(porId);
            b.sort(porId);
            return a.equals(b);
        }
        return true;
    }

    private static Map<String, Object> resultado(Contexto ctx, EntityDef def, UUID id, UUID idOrigem, String status,
                                                 String estrategia, Map<String, Object> registro) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("opId", ctx.opId());
        r.put("entidade", def.nome());
        r.put("id", id);
        // id enviado pelo dispositivo, quando o registro foi vinculado a outro já existente
        if (idOrigem != null && !idOrigem.equals(id)) r.put("idOrigem", idOrigem);
        r.put("status", status);
        r.put("estrategia", estrategia);
        r.put("registro", registro);
        return r;
    }
}
