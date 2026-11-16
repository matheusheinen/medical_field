-- =====================================================================
-- MedicalField - Banco de dados CENTRAL (PostgreSQL)
-- Executar como dono do banco "medicalfield":
--   psql -h localhost -U medicalfield -d medicalfield -f 01_schema.sql
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

DROP TABLE IF EXISTS atendimento_medicamento, atendimento, prontuario, pessoa,
                     medicamento, profissional, sync_operacao, registro_vinculado,
                     auditoria_alteracao, log_acesso CASCADE;

-- ---------------------------------------------------------------------
-- Profissionais de saúde (credenciais de acesso)
-- tipo_registro: CRM (médico), COREN (enfermagem), SOC (socorrista), ADM
-- perfil: ADMIN (portal) ou SOCORRISTA (aplicação cliente)
-- ---------------------------------------------------------------------
CREATE TABLE profissional (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome           VARCHAR(120) NOT NULL,
    tipo_registro  VARCHAR(10)  NOT NULL CHECK (tipo_registro IN ('CRM','COREN','SOC','ADM')),
    registro       VARCHAR(30)  NOT NULL,
    uf             CHAR(2),
    email          VARCHAR(120),
    senha_hash     VARCHAR(100) NOT NULL,           -- bcrypt
    perfil         VARCHAR(15)  NOT NULL DEFAULT 'SOCORRISTA'
                   CHECK (perfil IN ('ADMIN','SOCORRISTA')),
    ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tipo_registro, registro)
);

-- ---------------------------------------------------------------------
-- Cadastro de apoio: medicamentos (inseridos manualmente no banco)
-- ---------------------------------------------------------------------
CREATE TABLE medicamento (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome             VARCHAR(120) NOT NULL,
    principio_ativo  VARCHAR(120),
    apresentacao     VARCHAR(120),
    via_padrao       VARCHAR(30),
    dose_maxima      NUMERIC(10,3),        -- usada para alertar dose excessiva no cliente
    unidade          VARCHAR(10),
    ativo            BOOLEAN     NOT NULL DEFAULT TRUE,
    atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Entidades clínicas sincronizáveis.
-- O "id" é UUID gerado NO CLIENTE (inclusive offline) -> chave de idempotência.
-- "versao" + "atualizado_em" são usados na resolução de conflitos.
-- ---------------------------------------------------------------------
CREATE TABLE pessoa (
    id                        UUID PRIMARY KEY,
    nome                      VARCHAR(120) NOT NULL,
    cpf                       VARCHAR(14),
    data_nascimento           DATE,
    sexo                      CHAR(1) CHECK (sexo IN ('M','F','O')),
    telefone                  VARCHAR(20),
    email                     VARCHAR(120),
    contato_emergencia_nome   VARCHAR(120),
    contato_emergencia_email  VARCHAR(120),
    versao                    INTEGER     NOT NULL DEFAULT 1,
    atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_por            UUID REFERENCES profissional(id),
    criado_offline            BOOLEAN     NOT NULL DEFAULT FALSE,
    sincronizado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_pessoa_cpf ON pessoa(cpf) WHERE cpf IS NOT NULL AND cpf <> '';

CREATE TABLE prontuario (
    id                     UUID PRIMARY KEY,
    pessoa_id              UUID NOT NULL REFERENCES pessoa(id),
    tipo_sanguineo         VARCHAR(3),
    alergias               TEXT,
    comorbidades           TEXT,
    medicamentos_continuos TEXT,
    observacoes            TEXT,
    versao                 INTEGER     NOT NULL DEFAULT 1,
    atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_por         UUID REFERENCES profissional(id),
    criado_offline         BOOLEAN     NOT NULL DEFAULT FALSE,
    sincronizado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pessoa_id)                       -- um prontuário por pessoa
);

CREATE TABLE atendimento (
    id                 UUID PRIMARY KEY,
    prontuario_id      UUID NOT NULL REFERENCES prontuario(id),
    pessoa_id          UUID NOT NULL REFERENCES pessoa(id),
    profissional_id    UUID REFERENCES profissional(id),
    data_hora          TIMESTAMPTZ NOT NULL,
    local_ocorrencia   VARCHAR(200),
    queixa_principal   TEXT,
    -- sinais vitais
    pa_sistolica       INTEGER,
    pa_diastolica      INTEGER,
    freq_cardiaca      INTEGER,
    freq_respiratoria  INTEGER,
    saturacao_o2       INTEGER,
    temperatura        NUMERIC(4,1),
    glicemia           INTEGER,
    -- nível de consciência (Escala de Coma de Glasgow)
    glasgow_ocular     SMALLINT CHECK (glasgow_ocular BETWEEN 1 AND 4),
    glasgow_verbal     SMALLINT CHECK (glasgow_verbal BETWEEN 1 AND 5),
    glasgow_motora     SMALLINT CHECK (glasgow_motora BETWEEN 1 AND 6),
    glasgow_total      SMALLINT CHECK (glasgow_total BETWEEN 3 AND 15),
    -- protocolos de triagem
    triagem_manchester VARCHAR(10) CHECK (triagem_manchester IN ('VERMELHO','LARANJA','AMARELO','VERDE','AZUL')),
    triagem_start      VARCHAR(10) CHECK (triagem_start IN ('VERMELHO','AMARELO','VERDE','PRETO')),
    procedimentos      TEXT,
    observacoes        TEXT,
    destino            VARCHAR(200),
    versao             INTEGER     NOT NULL DEFAULT 1,
    atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_por     UUID REFERENCES profissional(id),
    criado_offline     BOOLEAN     NOT NULL DEFAULT FALSE,
    sincronizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_atendimento_pessoa ON atendimento(pessoa_id);

CREATE TABLE atendimento_medicamento (
    id              UUID PRIMARY KEY,
    atendimento_id  UUID NOT NULL REFERENCES atendimento(id) ON DELETE CASCADE,
    medicamento_id  UUID NOT NULL REFERENCES medicamento(id),
    dose            NUMERIC(10,3) NOT NULL,
    unidade         VARCHAR(10),
    via             VARCHAR(30),
    horario         TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- Idempotência: cada operação da Outbox do cliente tem um op_id único.
-- Reenvio do mesmo op_id => resposta "DUPLICADO", sem regravar.
-- ---------------------------------------------------------------------
CREATE TABLE sync_operacao (
    op_id            UUID PRIMARY KEY,
    entidade         VARCHAR(30) NOT NULL,
    entidade_id      UUID        NOT NULL,
    profissional_id  UUID REFERENCES profissional(id),
    dispositivo_id   VARCHAR(60),
    resultado        VARCHAR(20) NOT NULL,     -- CRIADO | ATUALIZADO | SEM_ALTERACAO | CONFLITO_RESOLVIDO | VINCULADO
    estrategia       VARCHAR(40),
    recebido_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Cadastro duplicado entre dispositivos offline: duas equipes cadastram o
-- mesmo paciente (mesmo CPF), cada uma com seu UUID. O segundo cadastro é
-- VINCULADO ao que já existia: o id do dispositivo passa a apontar para o
-- registro do servidor, inclusive em prontuários/atendimentos enviados depois.
-- ---------------------------------------------------------------------
CREATE TABLE registro_vinculado (
    entidade         VARCHAR(30) NOT NULL,     -- pessoa | prontuario
    id_origem        UUID        NOT NULL,     -- id gerado no dispositivo
    id_destino       UUID        NOT NULL,     -- registro que já existia no servidor
    profissional_id  UUID,
    dispositivo_id   VARCHAR(60),
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entidade, id_origem)
);

-- ---------------------------------------------------------------------
-- Rastreabilidade (auditoria de alterações de dados)
-- ---------------------------------------------------------------------
CREATE TABLE auditoria_alteracao (
    id               BIGSERIAL PRIMARY KEY,
    data_hora        TIMESTAMPTZ NOT NULL DEFAULT now(),
    entidade         VARCHAR(30) NOT NULL,
    entidade_id      UUID        NOT NULL,
    operacao         VARCHAR(30) NOT NULL,     -- INSERT | UPDATE | CONFLITO | VINCULO | INATIVACAO | UPDATE_SENHA
    origem           VARCHAR(20) NOT NULL,     -- API_DIRETA | SYNC_PUSH | PORTAL
    estrategia       VARCHAR(40),
    profissional_id  UUID,
    dispositivo_id   VARCHAR(60),
    op_id            UUID,
    dados_antes      JSONB,
    dados_depois     JSONB
);
CREATE INDEX ix_auditoria_entidade ON auditoria_alteracao(entidade, entidade_id);

-- ---------------------------------------------------------------------
-- Logs de acesso (gravados pelo middleware de TODOS os serviços
-- e também os logs locais enviados pelo cliente via POST /log)
-- ---------------------------------------------------------------------
CREATE TABLE log_acesso (
    id               BIGSERIAL PRIMARY KEY,
    servico          VARCHAR(30) NOT NULL,     -- auth-service | clinical-service | document-service | client-app
    origem           VARCHAR(20) NOT NULL DEFAULT 'SERVIDOR',  -- SERVIDOR | CLIENTE_OFFLINE
    data_hora        TIMESTAMPTZ NOT NULL,
    ip_cliente       VARCHAR(60),
    profissional_id  UUID,
    registro         VARCHAR(40),              -- ex.: CRM 12345
    metodo           VARCHAR(10),
    rota             VARCHAR(300),
    status_code      INTEGER,
    tempo_ms         NUMERIC(10,2),
    dispositivo_id   VARCHAR(60),
    id_local         UUID UNIQUE,              -- id gerado no cliente: reenvio do mesmo log não duplica
    recebido_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_log_data ON log_acesso(data_hora DESC);
