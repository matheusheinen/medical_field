# 0. Requisitos do enunciado × evidências

Este documento percorre **cada exigência** do enunciado (*Trabalho Final – MedicalField*, 4815206 – Arquiteturas de Software, 2026/B) e indica como ela foi atendida, onde está no código e como demonstrá-la. Serve de índice para as três entregas e de guia para a apresentação.

Legenda: ✅ atendido · ⚠️ atendido com ressalva · ⏳ pendente.

## 0.1 Entregas obrigatórias

| # | Entrega (enunciado) | Documento |
|---|---|---|
| 1 | Modelo de arquitetura: desenho + tecnologias utilizadas | [01_ARQUITETURA.md](01_ARQUITETURA.md) · [arquitetura.svg](arquitetura.svg) |
| 2 | Documentação das APIs e seus endpoints | [02_API.md](02_API.md) · [coleção Postman](../postman/MedicalField.postman_collection.json) |
| 2 | Modelagem dos bancos de dados | [03_BANCO_DE_DADOS.md](03_BANCO_DE_DADOS.md) · [01_schema.sql](../database/01_schema.sql) |
| 3 | Roteiro de testes | [05_ROTEIRO_DE_TESTES.md](05_ROTEIRO_DE_TESTES.md) |

Documentos de apoio: [04_PADROES_DE_PROJETO.md](04_PADROES_DE_PROJETO.md) (os seis padrões) e [06_DEPLOY_VM.md](06_DEPLOY_VM.md) (implantação na VM).

## 0.2 Requisitos gerais e arquiteturais (enunciado, seção 2.1)

| Requisito | Situação | Como foi atendido | Evidência no código | Como demonstrar |
|---|---|---|---|---|
| Mínimo de três serviços/APIs autônomos em linguagens diferentes | ✅ | `auth-service` (Node.js + TypeScript), `clinical-service` (Java 21), `document-service` (Python + FastAPI). Cada um é um processo próprio (systemd), com porta própria, e valida o JWT sozinho | `services/*`, `deploy/systemd/*.service` | `systemctl status medicalfield-auth medicalfield-clinical medicalfield-document` |
| Banco central (servidor) | ✅ | PostgreSQL: dados clínicos, idempotência, auditoria e logs | `database/01_schema.sql` | `psql` → `\dt` |
| Banco local embarcado no cliente | ✅ | IndexedDB (via Dexie) no dispositivo: dados clínicos, Outbox, logs offline, histórico | `client-app/src/db/localDb.js` | F12 → Application → IndexedDB → `medicalfield` |
| Execução na VM da Univates (sem contêineres) | ✅ | Instalação nativa por script: pacotes do sistema, Nginx e systemd | `scripts/install_vm.sh`, `deploy/` | Acessar `http://IP-DA-VM/admin/` e `/app/` |
| Todas as rotas autenticadas, exceto o login | ✅ | JWT obrigatório nos três serviços; `POST /auth/login` é a única rota pública. O Swagger automático do FastAPI foi desativado para não haver rota aberta | `auth-service/src/middleware/auth.ts`, `clinical-service/.../http/AuthFilter.java`, `document-service/app/security.py` | Postman: "Rota protegida SEM token (401)" |
| Autenticação associada às credenciais do profissional (CRM, COREN ou ID de socorrista) | ✅ | Login por `tipoRegistro` (`CRM`, `COREN`, `SOC`, `ADM`) + `registro` + senha (bcrypt). O token carrega id, nome, tipo, registro e perfil | `auth-service/src/index.ts`, tabela `profissional` | Login no cliente com CRM `12345`, COREN `54321` ou `SOC-0001` |
| Middleware/interceptor de log de acesso em todos os serviços | ✅ | Um interceptor por serviço grava no console e na tabela `log_acesso`. Detalhe dos campos em 0.3 | `auth-service/src/middleware/accessLog.ts`, `clinical-service/.../http/AccessLogFilter.java`, `document-service/app/access_log.py` | Portal → **Logs de acesso**; `journalctl -u medicalfield-clinical -f` |
| Interface do cliente para preencher a ficha de atendimento | ✅ | PWA React: nova ocorrência (pessoa, prontuário, sinais vitais, Glasgow, Manchester, START, medicamentos), listas de pacientes, medicamentos e atendimentos | `client-app/src/components/` | Roteiro, passos 5–7 e 12 |
| Chave "Simular Conectividade (Online / Offline)" | ✅ | Chave no cabeçalho do cliente. Em OFFLINE, o cliente HTTP recusa qualquer requisição (`OfflineError`) | `client-app/src/components/Cabecalho.jsx`, `net/ConnectivityMonitor.js`, `net/apiClient.js` | Roteiro, passos 12 e 14 |
| Interface administrativa: autenticar, ver atendimentos e cadastros de apoio | ✅ | Portal React: Visão geral, Atendimentos, Prontuários, Auditoria, Logs de acesso e **cadastros** de pacientes/prontuários, medicamentos e profissionais (criar, editar e inativar; nada é apagado). Medicamentos e profissionais são auditados com origem `PORTAL`; pacientes e prontuários usam a mesma API dos dispositivos (origem `API_DIRETA`, com controle de versão e conflito) | `admin-portal/src/App.jsx`, `admin-portal/src/paginas/` | Roteiro, passos 1–4 e extras E6, E7 e E10 |
| Inserções manuais via banco de dados | ✅ | Script pronto para o passo 9 | `database/03_novos_medicamentos.sql` | Roteiro, passo 9 |
| Ficha de Atendimento em PDF para download | ✅ | `GET /documento/atendimento/{id}/pdf` (ReportLab) | `document-service/app/pdf_builder.py`, `main.py` | Roteiro, passo 16 |
| Envio da ficha anexada por e-mail (paciente ou familiar) | ⏳ | `POST /documento/atendimento/{id}/email` implementado e testado. Sem SMTP configurado, o e-mail é gravado em arquivo `.eml`; **falta configurar o SMTP real na VM** | `document-service/app/email_sender.py`, `main.py` | Roteiro, passo 17 |

## 0.3 Campos do log de acesso

Exigidos pelo enunciado e gravados pelos três serviços na tabela `log_acesso`:

| Campo exigido | Coluna | Origem |
|---|---|---|
| Data e hora | `data_hora` | Início da requisição (UTC) |
| IP do cliente | `ip_cliente` | Cabeçalho `X-Real-IP` definido pelo Nginx (ou `X-Forwarded-For`, ou o endereço da conexão) |
| ID do profissional autenticado | `profissional_id` + `registro` (ex.: `CRM 12345`) | Payload do JWT |
| Método HTTP | `metodo` | Requisição |
| Rota | `rota` | Caminho com a query string |
| Status code | `status_code` | Resposta |
| Tempo de processamento (ms) | `tempo_ms` | Relógio de alta resolução do serviço |

Além disso: `servico` (qual serviço registrou), `origem` (`SERVIDOR` ou `CLIENTE_OFFLINE`) e `dispositivo_id`.

Formato no console (mesmos campos nos três serviços):

```
[2026-11-10T14:31:02.118Z] clinical-service ip=10.0.0.15 prof=CRM 12345 POST /sync/push 200 41.7ms
```

O interceptor de log é o primeiro da cadeia, por isso também registra as requisições recusadas com 401.

## 0.4 Offline-first e sincronização (enunciado, seção 1)

| Requisito | Situação | Como foi atendido | Evidência |
|---|---|---|---|
| Operação local irrestrita | ✅ | Toda gravação vai primeiro para o IndexedDB; a rede só é usada para sincronizar. Token vencido não bloqueia o app: só pede a senha de novo para sincronizar | `client-app/src/services/AtendimentoService.js`, `repositories/LocalRepository.js` |
| Consulta local no modo offline | ✅ | As listas do cliente leem sempre do banco local | `client-app/src/components/Lista*.jsx` |
| Envio dos pendentes quando a conexão voltar | ✅ | Outbox (fila de comandos) enviada automaticamente pelo Observer, ou pelo botão "Sincronizar" | `client-app/src/sync/SyncManager.js` |
| Sincronização nos dois sentidos | ✅ | `GET /sync/pull` (servidor → cliente, incremental) e `POST /sync/push` (cliente → servidor) | `clinical-service/.../service/SyncService.java` |
| Idempotência | ✅ | UUID gerado no cliente + `opId` por comando registrado em `sync_operacao`. Reenvio devolve `DUPLICADO`. O mesmo paciente cadastrado em dois aparelhos offline (mesmo CPF) é `VINCULADO` ao cadastro existente, sem duplicar nem travar a Outbox | `clinical-service/.../service/UpsertService.java`, tabelas `sync_operacao` e `registro_vinculado`; teste e2e E8 |
| Tratamento de conflitos | ✅ | Controle otimista por `versao`. Divergência resolvida pela Strategy da entidade: LWW (pessoa, atendimento) ou MERGE (prontuário) | `clinical-service/.../sync/*Strategy.java`; testes unitários `src/test/.../ConflictStrategyTest.java` (`mvn test`) |
| Rastreabilidade auditável | ✅ | `auditoria_alteracao` guarda operação, origem, estratégia, profissional, dispositivo, `opId` e o JSON antes/depois | `clinical-service/.../data/AuditRepository.java`; Portal → **Auditoria** |
| Logs do período offline | ✅ | Operações offline ficam na store `logs` e sobem por `POST /log` na sincronização | `LocalRepository.registrarLog`, `App.java` (`receberLogs`) |
| Regras de segurança clínica disponíveis offline | ✅ | Alerta de dose acima da máxima cadastrada, calculado com os medicamentos do banco local | `client-app/src/components/NovaOcorrencia.jsx` |

## 0.5 Padrões de projeto (enunciado, seção 2.2)

| Padrão | Tipo | Onde |
|---|---|---|
| Repository | sugerido | `LocalRepository.js`, `RemoteRepository.js`, `ClinicalRepository.java` |
| Strategy | sugerido | `ConflictStrategy.java` + `LastWriteWinsStrategy`, `FieldMergeStrategy`, `ServerWinsStrategy` |
| Observer | sugerido | `ConnectivityMonitor.js` (sujeito) → `SyncManager.js` e hooks React (observadores) |
| Command | livre escolha | `client-app/src/sync/commands.js` (`UpsertCommand`, guardado na Outbox) |
| Facade | livre escolha | `SyncManager.js` (cliente) e `SyncService.java` (servidor) |
| Builder | livre escolha | `document-service/app/pdf_builder.py` (`FichaPdfBuilder`) |

Complementares: Factory, Adapter, Singleton e Chain of Responsibility. Detalhes e trechos de código em [04_PADROES_DE_PROJETO.md](04_PADROES_DE_PROJETO.md).

## 0.6 Endpoints sugeridos × implementados (enunciado, seção 2.3)

| Sugerido | Autenticada | Implementado | Serviço |
|---|---|---|---|
| `POST /auth/login` | Não | ✅ | auth (Node) |
| `GET /medicamento` | Sim | ✅ | clinical (Java) |
| `GET /prontuario` | Sim | ✅ | clinical (Java) |
| `GET /prontuario/{id}` | Sim | ✅ (`{id}` = id da pessoa ou do prontuário) | clinical (Java) |
| `POST /pessoa` | Sim | ✅ | clinical (Java) |
| `GET /atendimento/{id}` | Sim | ✅ (`{id}` = id da pessoa) | clinical (Java) |
| `POST /prontuario` | Sim | ✅ | clinical (Java) |
| `POST /atendimento` | Sim | ✅ | clinical (Java) |
| `POST /log` | Sim | ✅ | clinical (Java) |
| Geração do PDF | Sim | ✅ `GET /documento/atendimento/{id}/pdf` | document (Python) |
| Envio do e-mail | Sim | ✅ `POST /documento/atendimento/{id}/email` | document (Python) |

Rotas adicionais: `GET /auth/me`, `GET /auth/profissional`, `GET /pessoa`, `GET /pessoa/{id}`, `GET /atendimento`, `GET /atendimento/detalhe/{id}`, `GET /sync/pull`, `POST /sync/push`, `GET /log`, `GET /auditoria`. Tabela completa em [02_API.md](02_API.md).

## 0.7 Requisitos técnicos (enunciado, última página)

| Requisito | Situação | Observação |
|---|---|---|
| Mais de uma linguagem nos serviços | ✅ | TypeScript, Java e Python |
| Execução na VM da Univates | ✅ | Instalado em 22/10/2026. O roteiro completo pela interface na VM ainda precisa ser ensaiado |
| Rotas autenticadas | ✅ | Só `POST /auth/login` é pública |
| Logs dos acessos de cada rota | ✅ | Ver 0.3 |
| Rotas validáveis por Postman/Insomnia | ✅ | Coleção com 33 requisições e testes automáticos (inclui cadastros e 403 sem perfil ADMIN) |
| Interface gráfica para validar o roteiro | ✅ | Todos os 17 passos são feitos no portal e no cliente (o passo 9 usa o `psql`, como pede o enunciado) |

### Segurança e privacidade no aparelho

- **Segredo do JWT obrigatório:** os três serviços se recusam a subir sem um `JWT_SECRET` de 32+ caracteres (o valor de exemplo antigo é rejeitado). O `install_vm.sh` e o `dev-start.sh` geram um automaticamente.
- **Logout limpa o aparelho:** ao sair, o banco local é apagado, para que o próximo profissional não veja os pacientes do anterior. A saída é bloqueada enquanto houver registros não enviados, e a Outbox de um profissional nunca é enviada com o token de outro.
- **Limitação conhecida:** inativar um profissional no portal impede novos logins, mas um token já emitido vale até expirar (12 h), pois o JWT é *stateless*.

### Pendências conhecidas

1. **SMTP real na VM** para o passo 17 — instruções em [06_DEPLOY_VM.md](06_DEPLOY_VM.md), seção 6.4.
2. **Ensaio do roteiro completo na VM** e execução da coleção Postman com `baseUrl = http://IP-DA-VM/api`.
