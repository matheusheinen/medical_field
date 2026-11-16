-- =====================================================================
-- Inclusão de medicamentos direto no banco (alternativa ao cadastro pelo portal).
--   psql -h localhost -U medicalfield -d medicalfield -f 03_novos_medicamentos.sql
-- Depois, no app, "Receber dados": os itens chegam ao dispositivo porque o
-- pull traz tudo com atualizado_em posterior à última sincronização.
-- (Usado no passo 9 do roteiro de testes — docs/05_ROTEIRO_DE_TESTES.md.)
-- =====================================================================
INSERT INTO medicamento (nome, principio_ativo, apresentacao, via_padrao, dose_maxima, unidade) VALUES
 ('Morfina',        'Sulfato de morfina', 'Ampola 10 mg/mL',  'IV', 10,  'mg'),
 ('Naloxona',       'Naloxona',           'Ampola 0,4 mg/mL', 'IV', 2,   'mg'),
 ('Hidrocortisona', 'Hidrocortisona',     'Frasco 500 mg',    'IV', 500, 'mg');

SELECT nome, apresentacao, atualizado_em FROM medicamento ORDER BY atualizado_em DESC LIMIT 5;
