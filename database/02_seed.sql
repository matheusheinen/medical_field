-- =====================================================================
-- MedicalField - Dados iniciais
-- Profissionais, medicamentos e um histórico de atendimentos de exemplo.
-- Senhas geradas com bcrypt pelo próprio PostgreSQL (pgcrypto).
-- Credenciais de acesso: ver README.md.
-- E-mails usam o domínio reservado example.com (nunca chegam a ninguém).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profissionais
-- ---------------------------------------------------------------------
INSERT INTO profissional (id, nome, tipo_registro, registro, uf, email, senha_hash, perfil, ativo) VALUES
 ('00000000-0000-0000-0000-000000000001','Administrador do Portal','ADM','admin',NULL,'admin@example.com', crypt('senha123', gen_salt('bf',10)),'ADMIN', TRUE),
 ('00000000-0000-0000-0000-000000000002','Dra. Ana Souza','CRM','12345','RS','ana.souza@example.com', crypt('senha123', gen_salt('bf',10)),'SOCORRISTA', TRUE),
 ('00000000-0000-0000-0000-000000000003','Enf. Bruno Lima','COREN','54321','RS','bruno.lima@example.com', crypt('senha123', gen_salt('bf',10)),'SOCORRISTA', TRUE),
 ('00000000-0000-0000-0000-000000000004','Carlos Pereira','SOC','SOC-0001','RS','carlos.pereira@example.com', crypt('senha123', gen_salt('bf',10)),'SOCORRISTA', TRUE),
 ('00000000-0000-0000-0000-000000000005','Dr. Rafael Kunz','CRM','23871','RS','rafael.kunz@example.com', crypt('senha123', gen_salt('bf',10)),'SOCORRISTA', TRUE),
 ('00000000-0000-0000-0000-000000000006','Enf. Juliana Prates','COREN','61904','RS','juliana.prates@example.com', crypt('senha123', gen_salt('bf',10)),'SOCORRISTA', TRUE),
 ('00000000-0000-0000-0000-000000000007','Marcos Weber','SOC','SOC-0002','RS','marcos.weber@example.com', crypt('senha123', gen_salt('bf',10)),'SOCORRISTA', FALSE);

-- ---------------------------------------------------------------------
-- Medicamentos (dose_maxima = limite por administração usado no alerta do app)
-- ---------------------------------------------------------------------
INSERT INTO medicamento (nome, principio_ativo, apresentacao, via_padrao, dose_maxima, unidade) VALUES
 ('Adrenalina',             'Epinefrina',          'Ampola 1 mg/mL',          'IV',         1,    'mg'),
 ('Dipirona',               'Metamizol sódico',    'Ampola 500 mg/mL 2 mL',   'IV',         1000, 'mg'),
 ('Soro Fisiológico 0,9%',  'Cloreto de sódio',    'Bolsa 500 mL',            'IV',         2000, 'mL'),
 ('Ácido Acetilsalicílico', 'AAS',                 'Comprimido 100 mg',       'VO',         300,  'mg'),
 ('Midazolam',              'Midazolam',           'Ampola 5 mg/mL 3 mL',     'IV',         15,   'mg'),
 ('Ondansetrona',           'Ondansetrona',        'Ampola 2 mg/mL 4 mL',     'IV',         8,    'mg'),
 ('Glicose 50%',            'Glicose',             'Ampola 10 mL',            'IV',         50,   'mL'),
 ('Atropina',               'Sulfato de atropina', 'Ampola 0,5 mg/mL',        'IV',         3,    'mg'),
 ('Diazepam',               'Diazepam',            'Ampola 5 mg/mL 2 mL',     'IV',         10,   'mg'),
 ('Ácido Tranexâmico',      'Ácido tranexâmico',   'Ampola 50 mg/mL 5 mL',    'IV',         1000, 'mg'),
 ('Salbutamol',             'Sulfato de salbutamol','Aerossol 100 mcg/dose',  'Inalatória', 800,  'mcg');

-- ---------------------------------------------------------------------
-- Pacientes
-- ---------------------------------------------------------------------
INSERT INTO pessoa (id, nome, cpf, data_nascimento, sexo, telefone, email, contato_emergencia_nome, contato_emergencia_email, atualizado_por) VALUES
 ('11111111-1111-1111-1111-111111111111','João da Silva','123.456.789-00','1980-05-12','M','(51) 99812-4410','joao.silva@example.com','Maria da Silva','maria.silva@example.com','00000000-0000-0000-0000-000000000002'),
 ('22222222-2222-2222-2222-222222222222','Fernanda Oliveira','987.654.321-00','1995-09-30','F','(51) 99645-0217','fernanda.oliveira@example.com','Paulo Oliveira','paulo.oliveira@example.com','00000000-0000-0000-0000-000000000003'),
 ('33333333-3333-3333-3333-333333333333','Antônio Becker','214.587.360-91','1948-02-03','M','(51) 3714-2280',NULL,'Rosane Becker (filha)','rosane.becker@example.com','00000000-0000-0000-0000-000000000005'),
 ('44444444-4444-4444-4444-444444444444','Luciana Ferreira Costa','308.112.945-27','1987-11-21','F','(51) 99230-7781','luciana.costa@example.com','Diego Costa','diego.costa@example.com','00000000-0000-0000-0000-000000000006'),
 ('55555555-5555-5555-5555-555555555555','Pedro Henrique Schmitt','419.763.208-05','2009-07-14','M',NULL,NULL,'Carla Schmitt (mãe)','carla.schmitt@example.com','00000000-0000-0000-0000-000000000004'),
 ('66666666-6666-6666-6666-666666666666','Não identificado (masc., ~40 anos)',NULL,NULL,'M',NULL,NULL,NULL,NULL,'00000000-0000-0000-0000-000000000002');

INSERT INTO prontuario (id, pessoa_id, tipo_sanguineo, alergias, comorbidades, medicamentos_continuos, observacoes, atualizado_por) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','O+','Penicilina','Hipertensão arterial','Losartana 50 mg',NULL,'00000000-0000-0000-0000-000000000002'),
 ('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','A-',NULL,'Asma','Salbutamol inalatório',NULL,'00000000-0000-0000-0000-000000000003'),
 ('aaaaaaaa-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','B+','Dipirona, Iodo','Diabetes tipo 2, Insuficiência cardíaca','Metformina 850 mg, Furosemida 40 mg','Usa marca-passo desde 2019','00000000-0000-0000-0000-000000000005'),
 ('aaaaaaaa-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','O-',NULL,NULL,NULL,'Gestante, 28 semanas','00000000-0000-0000-0000-000000000006'),
 ('aaaaaaaa-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555','A+','Látex','Epilepsia','Ácido valproico 250 mg',NULL,'00000000-0000-0000-0000-000000000004'),
 ('aaaaaaaa-0000-0000-0000-000000000006','66666666-6666-6666-6666-666666666666',NULL,NULL,NULL,NULL,'Encontrado sem documentos; identificação pendente','00000000-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------
-- Atendimentos (histórico dos últimos dias, todos já consolidados no servidor)
-- ---------------------------------------------------------------------
INSERT INTO atendimento (id, prontuario_id, pessoa_id, profissional_id, data_hora, local_ocorrencia, queixa_principal,
    pa_sistolica, pa_diastolica, freq_cardiaca, freq_respiratoria, saturacao_o2, temperatura, glicemia,
    glasgow_ocular, glasgow_verbal, glasgow_motora, glasgow_total, triagem_manchester, triagem_start,
    procedimentos, observacoes, destino, atualizado_por) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000002', now() - interval '2 days','BR-386, km 350 - Lajeado/RS','Dor torácica após colisão',
  150, 95, 110, 22, 94, 36.8, 110, 4, 5, 6, 15, 'LARANJA','AMARELO',
  'Imobilização cervical, oxigenoterapia 3 L/min', NULL, 'Hospital Bruno Born','00000000-0000-0000-0000-000000000002'),
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333',
  '00000000-0000-0000-0000-000000000005', now() - interval '3 days 4 hours','Rua Júlio de Castilhos, 812 - Estrela/RS','Dispneia súbita e confusão mental',
  88, 52, 128, 30, 86, 36.1, 248, 3, 4, 6, 13, 'VERMELHO', NULL,
  'Oxigenoterapia por máscara 10 L/min, acesso venoso periférico, monitorização', 'Filha relata piora progressiva há 2 dias', 'Hospital Estrela','00000000-0000-0000-0000-000000000005'),
 ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444',
  '00000000-0000-0000-0000-000000000006', now() - interval '1 day 6 hours','Av. Benjamin Constant, 1450 - Lajeado/RS','Queda da própria altura, dor em punho direito',
  118, 76, 92, 18, 98, 36.6, NULL, 4, 5, 6, 15, 'VERDE', NULL,
  'Imobilização de punho com tala', 'Gestante 28 semanas, sem sangramento ou contrações', 'Hospital Bruno Born','00000000-0000-0000-0000-000000000006'),
 ('bbbbbbbb-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555',
  '00000000-0000-0000-0000-000000000004', now() - interval '20 hours','Escola Estadual - Rua Bento Gonçalves, 300 - Teutônia/RS','Crise convulsiva tônico-clônica',
  124, 80, 118, 24, 95, 37.4, 96, 2, 3, 5, 10, 'LARANJA', NULL,
  'Proteção de via aérea, posição lateral de segurança', 'Crise de ~3 min; pós-ictal no transporte', 'UPA Lajeado','00000000-0000-0000-0000-000000000004'),
 ('bbbbbbbb-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000006','66666666-6666-6666-6666-666666666666',
  '00000000-0000-0000-0000-000000000002', now() - interval '9 hours','BR-386, km 341 - Estrela/RS (acidente com 3 vítimas)','Politrauma, motociclista',
  92, 60, 134, 28, 91, 35.9, NULL, 2, 2, 4, 8, 'VERMELHO','VERMELHO',
  'Colar cervical, prancha rígida, controle de hemorragia em coxa esquerda, 2 acessos calibrosos', 'Vítima 1 de 3 no local', 'Hospital Bruno Born','00000000-0000-0000-0000-000000000002'),
 ('bbbbbbbb-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000003', now() - interval '3 hours','Rua Pinheiro Machado, 210 - Lajeado/RS','Crise asmática',
  130, 84, 112, 28, 91, 36.7, NULL, 4, 5, 6, 15, 'AMARELO', NULL,
  'Nebulização, oxigenoterapia 2 L/min', NULL, 'UPA Lajeado','00000000-0000-0000-0000-000000000003');

INSERT INTO atendimento_medicamento (id, atendimento_id, medicamento_id, dose, unidade, via, horario)
SELECT v.id::uuid, v.atendimento::uuid, m.id, v.dose, v.unidade, v.via, now() - v.atras::interval
  FROM (VALUES
    ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Dipirona',          500, 'mg',  'IV',         '2 days'),
    ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Soro Fisiológico 0,9%', 250, 'mL', 'IV',       '3 days 3 hours 50 minutes'),
    ('cccccccc-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000004','Diazepam',          5,   'mg',  'IV',         '20 hours'),
    ('cccccccc-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000005','Ácido Tranexâmico', 1000,'mg',  'IV',         '8 hours 50 minutes'),
    ('cccccccc-0000-0000-0000-000000000005','bbbbbbbb-0000-0000-0000-000000000005','Soro Fisiológico 0,9%', 500, 'mL', 'IV',       '8 hours 45 minutes'),
    ('cccccccc-0000-0000-0000-000000000006','bbbbbbbb-0000-0000-0000-000000000006','Salbutamol',        400, 'mcg', 'Inalatória', '2 hours 50 minutes')
  ) AS v(id, atendimento, medicamento, dose, unidade, via, atras)
  JOIN medicamento m ON m.nome = v.medicamento;
