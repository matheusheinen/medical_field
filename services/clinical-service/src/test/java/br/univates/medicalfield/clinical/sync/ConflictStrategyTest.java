package br.univates.medicalfield.clinical.sync;

import br.univates.medicalfield.clinical.data.Entities;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Testes do padrão Strategy isolados: cada estratégia recebe a versão do SERVIDOR e a do
 * CLIENTE (dispositivo) de um mesmo registro e devolve a versão que será gravada.
 * Não precisam de banco, rede nem dos outros serviços:  mvn test
 */
class ConflictStrategyTest {

    private static final OffsetDateTime T1 = OffsetDateTime.parse("2026-11-10T10:00:00Z");
    private static final OffsetDateTime T2 = OffsetDateTime.parse("2026-11-10T10:05:00Z");   // mais recente

    /** Monta um registro a partir de pares chave/valor (aceita null, ao contrário de Map.of). */
    private static Map<String, Object> registro(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static final UUID ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Nested
    @DisplayName("Last-Write-Wins (LWW)")
    class Lww {
        private final ConflictStrategy lww = new LastWriteWinsStrategy();

        @Test
        void clienteMaisRecenteVence() {
            var servidor = registro("id", ID, "nome", "João Silva", "atualizadoEm", T1);
            var cliente = registro("id", ID, "nome", "João da Silva", "atualizadoEm", T2);
            assertEquals("João da Silva", lww.resolver(Entities.PESSOA, servidor, cliente).get("nome"));
        }

        @Test
        void servidorMaisRecenteVence() {
            var servidor = registro("id", ID, "nome", "João da Silva", "atualizadoEm", T2);
            var cliente = registro("id", ID, "nome", "João Silva", "atualizadoEm", T1);
            assertEquals("João da Silva", lww.resolver(Entities.PESSOA, servidor, cliente).get("nome"));
        }

        @Test
        void empateMantemOServidor() {
            var servidor = registro("id", ID, "nome", "Servidor", "atualizadoEm", T1);
            var cliente = registro("id", ID, "nome", "Cliente", "atualizadoEm", T1);
            assertEquals("Servidor", lww.resolver(Entities.PESSOA, servidor, cliente).get("nome"));
        }
    }

    @Nested
    @DisplayName("Server-Wins")
    class ServerWins {
        @Test
        void mantemSempreOServidorMesmoComClienteMaisRecente() {
            var servidor = registro("id", ID, "telefone", "(51) 3333-0000", "atualizadoEm", T1);
            var cliente = registro("id", ID, "telefone", "(51) 99999-0000", "atualizadoEm", T2);
            var r = new ServerWinsStrategy().resolver(Entities.PESSOA, servidor, cliente);
            assertEquals(servidor, r);
            assertNotSame(servidor, r, "devolve uma cópia, não o próprio mapa do servidor");
        }
    }

    @Nested
    @DisplayName("Merge campo a campo (prontuário)")
    class Merge {
        private final ConflictStrategy merge = new FieldMergeStrategy();

        @Test
        void alergiasDosDoisLadosSaoUnidasSemDuplicar() {
            var servidor = registro("id", ID, "alergias", "Penicilina, AAS", "atualizadoEm", T1);
            var cliente = registro("id", ID, "alergias", "penicilina; Iodo", "atualizadoEm", T2);
            var r = merge.resolver(Entities.PRONTUARIO, servidor, cliente);
            assertEquals("Penicilina, AAS, Iodo", r.get("alergias"));
        }

        @Test
        void campoVazioDeUmLadoUsaOValorDoOutro() {
            var servidor = registro("id", ID, "tipoSanguineo", null, "observacoes", "Usa marcapasso", "atualizadoEm", T2);
            var cliente = registro("id", ID, "tipoSanguineo", "O+", "observacoes", null, "atualizadoEm", T1);
            var r = merge.resolver(Entities.PRONTUARIO, servidor, cliente);
            assertEquals("O+", r.get("tipoSanguineo"));
            assertEquals("Usa marcapasso", r.get("observacoes"));
        }

        @Test
        void campoComumDivergenteFicaComOLadoMaisRecente() {
            var servidor = registro("id", ID, "observacoes", "Versão do servidor", "atualizadoEm", T1);
            var cliente = registro("id", ID, "observacoes", "Versão do dispositivo", "atualizadoEm", T2);
            var r = merge.resolver(Entities.PRONTUARIO, servidor, cliente);
            assertEquals("Versão do dispositivo", r.get("observacoes"));
            assertEquals(T2, r.get("atualizadoEm"));
        }

        @Test
        void medicamentosAdministradosSaoUnidosPorId() {
            UUID a = UUID.randomUUID(), b = UUID.randomUUID();
            var servidor = registro("id", ID, "atualizadoEm", T1,
                    "medicamentos", List.of(registro("id", a, "dose", 1)));
            var cliente = registro("id", ID, "atualizadoEm", T2,
                    "medicamentos", List.of(registro("id", a, "dose", 2), registro("id", b, "dose", 5)));
            @SuppressWarnings("unchecked")
            var meds = (List<Map<String, Object>>) merge.resolver(Entities.ATENDIMENTO, servidor, cliente).get("medicamentos");
            assertEquals(2, meds.size(), "nenhum medicamento administrado se perde");
            assertEquals(2, meds.get(0).get("dose"), "no mesmo item, vale o lado mais recente");
        }

        @Test
        void unirIgnoraMaiusculasEspacosESeparadores() {
            assertEquals("Dipirona, Látex", FieldMergeStrategy.unir("Dipirona", " dipirona ;\nLátex"));
        }
    }

    @Nested
    @DisplayName("Factory")
    class Factory {
        private final ConflictStrategyFactory fabrica = new ConflictStrategyFactory();

        @Test
        void estrategiasPadraoPorEntidade() {
            // valem quando CONFLICT_STRATEGY_<ENTIDADE> não está definida no ambiente
            assumirSemVariavel("PESSOA");
            assumirSemVariavel("PRONTUARIO");
            assumirSemVariavel("ATENDIMENTO");
            assertEquals("LWW", fabrica.para("pessoa").nome());
            assertEquals("MERGE", fabrica.para("prontuario").nome());
            assertEquals("LWW", fabrica.para("atendimento").nome());
        }

        @Test
        void vinculoDeCadastroDuplicadoSempreMescla() {
            assertEquals("MERGE", fabrica.mesclagem().nome());
        }

        private static void assumirSemVariavel(String entidade) {
            org.junit.jupiter.api.Assumptions.assumeTrue(System.getenv("CONFLICT_STRATEGY_" + entidade) == null);
        }
    }
}
