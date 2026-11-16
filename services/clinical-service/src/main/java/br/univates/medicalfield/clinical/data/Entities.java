package br.univates.medicalfield.clinical.data;

import br.univates.medicalfield.clinical.data.EntityDef.Campo;
import br.univates.medicalfield.clinical.data.EntityDef.Tipo;
import br.univates.medicalfield.clinical.http.ApiException;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static br.univates.medicalfield.clinical.data.EntityDef.Tipo.*;

/** Definição das entidades clínicas sincronizáveis (espelham as tabelas do PostgreSQL). */
public final class Entities {
    private Entities() {}

    private static Campo c(String json, String coluna, Tipo tipo) { return new Campo(json, coluna, tipo); }

    public static final EntityDef PESSOA = new EntityDef("pessoa", "pessoa", List.of(
            c("id", "id", UUID),
            c("nome", "nome", TEXTO),
            c("cpf", "cpf", TEXTO),
            c("dataNascimento", "data_nascimento", DATA),
            c("sexo", "sexo", TEXTO),
            c("telefone", "telefone", TEXTO),
            c("email", "email", TEXTO),
            c("contatoEmergenciaNome", "contato_emergencia_nome", TEXTO),
            c("contatoEmergenciaEmail", "contato_emergencia_email", TEXTO)
    ), Set.of("id", "nome"), Set.of(), false);

    public static final EntityDef PRONTUARIO = new EntityDef("prontuario", "prontuario", List.of(
            c("id", "id", UUID),
            c("pessoaId", "pessoa_id", UUID),
            c("tipoSanguineo", "tipo_sanguineo", TEXTO),
            c("alergias", "alergias", TEXTO),
            c("comorbidades", "comorbidades", TEXTO),
            c("medicamentosContinuos", "medicamentos_continuos", TEXTO),
            c("observacoes", "observacoes", TEXTO)
    ), Set.of("id", "pessoaId"),
            // em conflito, estes campos são UNIDOS (nunca se perde uma alergia registrada)
            Set.of("alergias", "comorbidades", "medicamentosContinuos"), false);

    public static final EntityDef ATENDIMENTO = new EntityDef("atendimento", "atendimento", List.of(
            c("id", "id", UUID),
            c("prontuarioId", "prontuario_id", UUID),
            c("pessoaId", "pessoa_id", UUID),
            c("profissionalId", "profissional_id", UUID),
            c("dataHora", "data_hora", DATA_HORA),
            c("localOcorrencia", "local_ocorrencia", TEXTO),
            c("queixaPrincipal", "queixa_principal", TEXTO),
            c("paSistolica", "pa_sistolica", INTEIRO),
            c("paDiastolica", "pa_diastolica", INTEIRO),
            c("freqCardiaca", "freq_cardiaca", INTEIRO),
            c("freqRespiratoria", "freq_respiratoria", INTEIRO),
            c("saturacaoO2", "saturacao_o2", INTEIRO),
            c("temperatura", "temperatura", DECIMAL),
            c("glicemia", "glicemia", INTEIRO),
            c("glasgowOcular", "glasgow_ocular", INTEIRO),
            c("glasgowVerbal", "glasgow_verbal", INTEIRO),
            c("glasgowMotora", "glasgow_motora", INTEIRO),
            c("glasgowTotal", "glasgow_total", INTEIRO),
            c("triagemManchester", "triagem_manchester", TEXTO),
            c("triagemStart", "triagem_start", TEXTO),
            c("procedimentos", "procedimentos", TEXTO),
            c("observacoes", "observacoes", TEXTO),
            c("destino", "destino", TEXTO)
    ), Set.of("id", "prontuarioId", "pessoaId", "dataHora"), Set.of("procedimentos"), true);

    /** Itens "medicamentos administrados" de um atendimento. */
    public static final List<Campo> ITEM_MEDICAMENTO = List.of(
            c("id", "id", UUID),
            c("medicamentoId", "medicamento_id", UUID),
            c("dose", "dose", DECIMAL),
            c("unidade", "unidade", TEXTO),
            c("via", "via", TEXTO),
            c("horario", "horario", DATA_HORA)
    );

    private static final Map<String, EntityDef> POR_NOME = Map.of(
            "pessoa", PESSOA, "prontuario", PRONTUARIO, "atendimento", ATENDIMENTO);

    public static EntityDef porNome(String nome) {
        EntityDef d = nome == null ? null : POR_NOME.get(nome.toLowerCase());
        if (d == null) throw new ApiException(400, "Entidade desconhecida: " + nome);
        return d;
    }
}
