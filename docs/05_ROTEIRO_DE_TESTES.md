# 5. Roteiro de Testes

Três formas de comprovar o funcionamento, complementares:

| Forma | Ferramenta | O que comprova |
|---|---|---|
| **A. Demonstração na interface** (apresentação) | Navegador: Portal (`/admin/`) e App cliente (`/app/`) | Os 17 passos do enunciado, visualmente |
| **B. Teste automatizado do roteiro** | `cd client-app && npm run test:e2e` | Os 17 passos + idempotência + conflito, usando o código real do app cliente contra os serviços |
| **C. Validação das rotas** | Postman/Newman (`postman/MedicalField.postman_collection.json`) | Todas as rotas, autenticação, erros, idempotência e conflito |

## Preparação (antes da apresentação)

1. Recriar o banco com os dados iniciais: `sudo ./scripts/install_vm.sh --reset-db` (ou rodar `01_schema.sql` e `02_seed.sql`).
2. Conferir os serviços: `systemctl status medicalfield-auth medicalfield-clinical medicalfield-document`.
3. Abrir **duas janelas lado a lado**: Portal (`http://IP/admin/`) à esquerda e App cliente (`http://IP/app/`) à direita. Use uma janela anônima ou outro navegador para o cliente, ou limpe os dados do site (F12 → Application → Clear storage) para começar com o banco local vazio.
4. Terminal com `psql` aberto para o passo 9: `psql -h localhost -U medicalfield -d medicalfield`.
5. Configurar o SMTP no `.env` (passo 17) e reiniciar o document-service.

## A. Roteiro na interface gráfica

| # | Onde | Ação | Resultado esperado |
|---|---|---|---|
| 1 | Portal | Entrar com `admin` / `senha123` | Abre a "Visão geral" com os contadores |
| 2 | Portal | Menu **Cadastros**: Pacientes, Medicamentos e Profissionais | Pacientes (6), Medicamentos (11) e Profissionais (7, um deles inativo) |
| 3 | Portal | Menu **Prontuários** | 6 prontuários; clicar em João da Silva abre o paciente, com as abas Prontuário e Atendimentos |
| 4 | Portal | Menu **Atendimentos** | 6 atendimentos |
| 5 | Cliente | Entrar com CRM `12345` / `senha123` | Cabeçalho com nome da Dra. Ana Souza, chave **Simular conectividade** em **Online** |
| 6 | Cliente | Botão **Receber dados** | Barra de status: "recebidos: 11 medicamento(s), 6 pessoa(s), 6 prontuário(s), 6 atendimento(s)". Abas Pacientes/Medicamentos/Atendimentos preenchidas |
| 7 | Cliente (ONLINE) | **Nova ocorrência** → buscar "João" → preencher sinais vitais, Glasgow, Manchester, um medicamento → **Registrar atendimento** | Mensagem verde "registrado e enviado ao servidor central"; barra de status em **Tudo sincronizado** |
| 8 | Portal | **Atendimentos** → **Atualizar** | O atendimento do passo 7 aparece (7 no total) |
| 9 | Banco | `\i database/03_novos_medicamentos.sql` | 3 linhas inseridas (Morfina, Naloxona, Hidrocortisona) |
| 10 | Portal | **Atendimentos** e **Medicamentos** → **Atualizar** | Atendimentos inalterados; Medicamentos agora com 14 |
| 11 | Cliente | **Receber dados** | Aba Medicamentos com 14 itens (Morfina etc. disponíveis no formulário) |
| 12 | Cliente | Chave → **Offline**. **Nova ocorrência** → "Novo paciente" (nome, CPF, e-mail do familiar) + prontuário (alergias) + atendimento com Morfina → **Registrar atendimento (offline)** | Aviso amarelo "registrado no dispositivo e colocado na Outbox". Contador **3 pendentes**. Aba Sincronização: 3 comandos (pessoa → prontuario → atendimento) e 3 logs locais |
| 13 | Portal | **Prontuários** e **Atendimentos** → **Atualizar** | O novo paciente **não aparece** |
| 14 | Cliente | Chave → **Online** (não clicar em mais nada) | O Observer dispara a sincronização sozinho: "Conexão restabelecida: 3 enviado(s) • 3 log(s) offline enviado(s)…". Contador volta a 0; atendimento **Sincronizado** |
| 15 | Portal | **Prontuários** e **Atendimentos** → **Atualizar** | O novo paciente e o atendimento **aparecem**. Em **Logs de acesso**, filtrar o serviço `client-app`: os 3 logs offline. Em **Auditoria**: 3 INSERT com origem SYNC_PUSH |
| 16 | Portal ou Cliente | Abrir o atendimento → **Gerar PDF** (no cliente: botão **PDF**) | Abre a Ficha de Atendimento em PDF (paciente, alergias em vermelho, sinais vitais, Glasgow, triagem colorida, medicamentos, assinatura) |
| 17 | Portal ou Cliente | **Enviar por e-mail** para o familiar | Mensagem de sucesso; mostrar a caixa de entrada com o e-mail e o PDF anexado |

### Testes extras recomendados (mostram os requisitos de sincronização)

| # | Teste | Como fazer | Esperado |
|---|---|---|---|
| E1 | **Idempotência** | Postman: "Cadastrar pessoa" e depois "Cadastrar pessoa de novo (idempotente)" | Segunda chamada responde `DUPLICADO`; só existe uma pessoa |
| E2 | **Conflito com merge** | No banco: `UPDATE prontuario SET alergias = alergias || ', AAS', versao = versao + 1, sincronizado_em = now() WHERE pessoa_id = '11111111-1111-1111-1111-111111111111';` Depois, no cliente OFFLINE, registrar atendimento para João adicionando "Iodo" nas alergias e voltar ONLINE | Aba Sincronização: "Conflito em prontuario … resolvido por MERGE". No portal, alergias = "Penicilina, AAS, Iodo". Em Auditoria, linha CONFLITO com as duas versões (antes/depois) |
| E3 | **Rota sem token** | Postman: "Rota protegida SEM token (401)" | `401 {"erro":"Token ausente"}`, registrado em Logs de acesso |
| E4 | **Alerta de dose** | Nova ocorrência → Adrenalina dose 5 mg | Linha fica vermelha: "Dose acima da máxima cadastrada (1 mg)" e pede confirmação |
| E5 | **Queda de rede durante o envio** | Desligar o clinical-service (`sudo systemctl stop medicalfield-clinical`), tentar sincronizar e religar | Comandos voltam para PENDENTE; ao religar e sincronizar, são enviados com o mesmo `opId` sem duplicar |
| E6 | **Cadastro no portal chega ao dispositivo** | Portal → Medicamentos → **Novo medicamento** (ex.: Cetamina). No cliente, **Receber dados**. Depois, no portal, **Inativar** e receber de novo | O medicamento aparece no formulário do cliente e, depois de inativado, some. Em Auditoria: INSERT e INATIVACAO com origem PORTAL |
| E7 | **Profissional inativado** | Portal → Profissionais → **Novo profissional** (tipo SOC) → entrar no app com ele. Depois **Inativar acesso** e tentar entrar de novo | Primeiro login funciona; após inativar, "Credenciais inválidas". A senha nunca aparece na Auditoria |
| E8 | **Mesmo paciente em dois aparelhos** | Duas janelas do app (uma anônima), ambas **Offline**. Em cada uma, **Novo paciente** com o mesmo CPF e alergias diferentes. Voltar a primeira para **Online**, depois a segunda | A segunda mostra "cadastro(s) já existente(s) vinculado(s)". No portal, **um** paciente só, com as duas alergias e os dois atendimentos. Em Auditoria: VINCULO |
| E9 | **Sessão expirada e saída segura** | Com registros pendentes (offline), clicar em **Sair** | A saída é bloqueada: "Ainda há dados só neste aparelho" com **Sincronizar e sair**. Depois de sair, as tabelas em F12 → Application → IndexedDB ficam vazias. Com o token vencido, o app continua registrando e mostra **Entrar novamente** (só a senha). Sem pendências e com a chave em **Offline**, **Sair** pede confirmação ("Sair sem conexão?"), já que entrar de novo exige conexão |
| E10 | **Conflito via portal** | Abrir o paciente João no portal (aba Prontuário) e deixar a janela aberta. No cliente, registrar atendimento para João alterando as alergias e sincronizar. No portal, alterar as observações e **Salvar** | O portal avisa "conflito resolvido (MERGE)"; nenhuma das duas alterações se perde |

## B. Teste automatizado do roteiro

`client-app/tests/e2e.mjs` executa os passos 1–17, os extras E1 e E2 os de cadastro E6 (medicamento criado e inativado pelo administrador chega ao dispositivo; socorrista recebe 403) e E7 (profissional inativado não faz login), E8 (mesmo CPF em dois aparelhos → vinculado) e E9 (token vencido não bloqueia o app; sair só depois de sincronizar e apaga o banco local) usando os **mesmos módulos** do app (Dexie, `LocalRepository`, `UpsertCommand`, `ConnectivityMonitor`, `SyncManager`) contra os serviços reais, passando pelo Nginx. O banco local é simulado com `fake-indexeddb`.

```bash
cd client-app
# banco recém-criado (01_schema.sql + 02_seed.sql)
PGPASSWORD=medicalfield MF_API_URL=http://localhost/api npm run test:e2e
```
Saída esperada (resumo):
```
12. Cliente OFFLINE: registrar ocorrência (nova pessoa + prontuário + atendimento)
   ✔ com o simulador OFFLINE nenhuma requisição sai do dispositivo
   ✔ gravado localmente; Outbox = pessoa → prontuario → atendimento
13. Portal: listar prontuários e atendimentos — o novo cadastro NÃO aparece
   ✔ prontuário ausente no portal
   ✔ atendimento ausente no portal
14. Cliente ONLINE: o Observer dispara a sincronização automaticamente
   ✔ Outbox esvaziada — Conexão restabelecida: 3 enviado(s) • 3 log(s) offline enviado(s) • …
...
E1. Idempotência: reenviar as MESMAS operações (mesmo opId) não duplica
   ✔ DUPLICADO, DUPLICADO, DUPLICADO
E2. Conflito: prontuário editado no servidor E no dispositivo offline → Strategy MERGE
   ✔ nenhuma alergia perdida: "Penicilina, AAS, Iodo"
✅ Fluxo completo sem falhas
```

### Testes unitários das Strategies (sem banco nem rede)

```bash
cd services/clinical-service && mvn test
```
`ConflictStrategyTest` verifica cada estratégia isoladamente: LWW (o mais recente vence; empate mantém o servidor), Server-Wins, MERGE (alergias unidas sem duplicar, campo vazio usa o outro lado, medicamentos unidos por id) e a Factory (padrão por entidade).

## C. Validação das rotas (Postman / Insomnia / Newman)

1. Postman → **Import** → `postman/MedicalField.postman_collection.json`.
2. Na coleção, aba **Variables**: `baseUrl` = `http://IP-DA-VM/api`.
3. **Run collection**: as pastas 0 a 6 rodam em ordem; o login salva o token automaticamente.

Linha de comando: `npx newman run postman/MedicalField.postman_collection.json --env-var baseUrl=http://IP-DA-VM/api` → **33 requisições, 0 falhas**.
