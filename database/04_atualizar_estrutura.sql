-- =====================================================================
-- MedicalField - atualiza a estrutura de um banco JÁ EXISTENTE para a
-- versão atual do 01_schema.sql, sem apagar dados.
-- Pode ser executado quantas vezes quiser (tudo é IF NOT EXISTS).
-- O install_vm.sh roda este script em toda instalação/atualização.
--   psql -h localhost -U medicalfield -d medicalfield -f 04_atualizar_estrutura.sql
-- =====================================================================

SET client_min_messages = warning;

-- Profissional
ALTER TABLE profissional ADD COLUMN IF NOT EXISTS uf        CHAR(2);
ALTER TABLE profissional ADD COLUMN IF NOT EXISTS email     VARCHAR(120);
ALTER TABLE profissional ADD COLUMN IF NOT EXISTS ativo     BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE profissional ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Medicamento
ALTER TABLE medicamento ADD COLUMN IF NOT EXISTS principio_ativo VARCHAR(120);
ALTER TABLE medicamento ADD COLUMN IF NOT EXISTS apresentacao    VARCHAR(120);
ALTER TABLE medicamento ADD COLUMN IF NOT EXISTS via_padrao      VARCHAR(30);
ALTER TABLE medicamento ADD COLUMN IF NOT EXISTS dose_maxima     NUMERIC(10,3);
ALTER TABLE medicamento ADD COLUMN IF NOT EXISTS unidade         VARCHAR(10);
ALTER TABLE medicamento ADD COLUMN IF NOT EXISTS ativo         BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE medicamento ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Pessoa
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS sexo            CHAR(1);
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS telefone                 VARCHAR(20);
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS email                    VARCHAR(120);
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS contato_emergencia_nome  VARCHAR(120);
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS contato_emergencia_email VARCHAR(120);
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS versao          INTEGER     NOT NULL DEFAULT 1;
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS atualizado_por  UUID REFERENCES profissional(id);
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS criado_offline  BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE pessoa ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Prontuário
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS tipo_sanguineo VARCHAR(3);
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS alergias       TEXT;
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS comorbidades   TEXT;
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS medicamentos_continuos TEXT;
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS observacoes     TEXT;
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS versao          INTEGER     NOT NULL DEFAULT 1;
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS atualizado_por  UUID REFERENCES profissional(id);
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS criado_offline  BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE prontuario ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Atendimento
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS profissional_id    UUID REFERENCES profissional(id);
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS local_ocorrencia   VARCHAR(200);
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS queixa_principal   TEXT;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS pa_sistolica       INTEGER;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS pa_diastolica      INTEGER;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS freq_cardiaca      INTEGER;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS freq_respiratoria  INTEGER;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS saturacao_o2       INTEGER;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS temperatura        NUMERIC(4,1);
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS glasgow_ocular     SMALLINT;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS glasgow_verbal     SMALLINT;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS glasgow_motora     SMALLINT;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS glasgow_total      SMALLINT;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS triagem_manchester VARCHAR(10);
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS glicemia        INTEGER;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS triagem_start   VARCHAR(10);
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS procedimentos   TEXT;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS observacoes     TEXT;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS destino         VARCHAR(200);
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS versao          INTEGER     NOT NULL DEFAULT 1;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS atualizado_por  UUID REFERENCES profissional(id);
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS criado_offline  BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE atendimento ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- Tabelas de suporte
CREATE TABLE IF NOT EXISTS atendimento_medicamento (
    id              UUID PRIMARY KEY,
    atendimento_id  UUID NOT NULL REFERENCES atendimento(id) ON DELETE CASCADE,
    medicamento_id  UUID NOT NULL REFERENCES medicamento(id),
    dose            NUMERIC(10,3) NOT NULL,
    unidade         VARCHAR(10),
    via             VARCHAR(30),
    horario         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sync_operacao (
    op_id            UUID PRIMARY KEY,
    entidade         VARCHAR(30) NOT NULL,
    entidade_id      UUID        NOT NULL,
    profissional_id  UUID REFERENCES profissional(id),
    dispositivo_id   VARCHAR(60),
    resultado        VARCHAR(20) NOT NULL,
    estrategia       VARCHAR(40),
    recebido_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registro_vinculado (
    entidade         VARCHAR(30) NOT NULL,
    id_origem        UUID        NOT NULL,
    id_destino       UUID        NOT NULL,
    profissional_id  UUID,
    dispositivo_id   VARCHAR(60),
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entidade, id_origem)
);

CREATE TABLE IF NOT EXISTS auditoria_alteracao (
    id               BIGSERIAL PRIMARY KEY,
    data_hora        TIMESTAMPTZ NOT NULL DEFAULT now(),
    entidade         VARCHAR(30) NOT NULL,
    entidade_id      UUID        NOT NULL,
    operacao         VARCHAR(30) NOT NULL,
    origem           VARCHAR(20) NOT NULL,
    estrategia       VARCHAR(40),
    profissional_id  UUID,
    dispositivo_id   VARCHAR(60),
    op_id            UUID,
    dados_antes      JSONB,
    dados_depois     JSONB
);
ALTER TABLE auditoria_alteracao ALTER COLUMN operacao TYPE VARCHAR(30);
ALTER TABLE auditoria_alteracao ADD COLUMN IF NOT EXISTS op_id UUID;
ALTER TABLE auditoria_alteracao ADD COLUMN IF NOT EXISTS estrategia      VARCHAR(40);
ALTER TABLE auditoria_alteracao ADD COLUMN IF NOT EXISTS profissional_id UUID;
ALTER TABLE auditoria_alteracao ADD COLUMN IF NOT EXISTS dispositivo_id  VARCHAR(60);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidade ON auditoria_alteracao(entidade, entidade_id);

ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS ip_cliente      VARCHAR(60);
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS profissional_id UUID;
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS registro        VARCHAR(40);
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS metodo          VARCHAR(10);
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS rota            VARCHAR(300);
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS status_code     INTEGER;
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS tempo_ms        NUMERIC(10,2);
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS origem         VARCHAR(20) NOT NULL DEFAULT 'SERVIDOR';
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS dispositivo_id VARCHAR(60);
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS id_local       UUID UNIQUE;
ALTER TABLE log_acesso ADD COLUMN IF NOT EXISTS recebido_em    TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS ix_log_data ON log_acesso(data_hora DESC);
CREATE INDEX IF NOT EXISTS ix_atendimento_pessoa ON atendimento(pessoa_id);

-- Restrições que podem ter mudado de uma versão para outra (recriadas com as regras atuais)
ALTER TABLE profissional DROP CONSTRAINT IF EXISTS profissional_tipo_registro_check;
ALTER TABLE profissional ADD  CONSTRAINT profissional_tipo_registro_check
      CHECK (tipo_registro IN ('CRM','COREN','SOC','ADM'));

-- CPF único (só se ainda não houver CPFs repetidos; senão apenas avisa)
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS ux_pessoa_cpf ON pessoa(cpf) WHERE cpf IS NOT NULL AND cpf <> '';
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'Há CPFs repetidos na tabela pessoa: índice ux_pessoa_cpf não criado';
END $$;
