# 0. Requisitos do enunciado × evidências

Como cada exigência do enunciado (*Trabalho Final – MedicalField*, Arquiteturas de Software, 2026/B) foi atendida e onde está no código.

## 0.1 Entregas

| # | Entrega | Onde |
|---|---|---|
| 1 | Modelo de arquitetura e tecnologias | [01_ARQUITETURA.md](01_ARQUITETURA.md) · [diagrama](arquitetura_software_medicalfield.png) |
| 2 | APIs e endpoints | [02_API.md](02_API.md) · [Swagger / OpenAPI](../ferramentas/openapi.yaml) · [Postman](../postman/) |
| 2 | Modelagem dos bancos | [03_BANCO_DE_DADOS.md](03_BANCO_DE_DADOS.md) · [modelo ER](modelo_er_medicalfield.png) · [01_schema.sql](../database/01_schema.sql) |
| 3 | Roteiro de testes | Os 17 passos rodam pelo portal e pelo app; automatizados em `client-app/tests/e2e.mjs` |

## 0.2 Requisitos gerais e técnicos

| Requisito | Como foi atendido | Onde |
|---|---|---|
| 3+ serviços autônomos em linguagens diferentes | auth (Node + TypeScript), clinical (Java 21), document (Python + FastAPI); processos, portas e validação de JWT próprios | `services/*`, `deploy/systemd/` |
| Banco central | PostgreSQL | `database/01_schema.sql` |
| Banco local embarcado | IndexedDB (Dexie) no aparelho | `client-app/src/db/localDb.js` |
| Execução na VM, sem contêineres | Instalação nativa (Nginx + systemd) em `177.44.248.79` | `scripts/install_vm.sh`, `deploy/` |
| Rotas autenticadas, exceto o login | JWT obrigatório nos três serviços; só `POST /auth/login` é pública (as 25 rotas sem token respondem 401). Rotas de administração exigem perfil ADMIN (403) | `auth.ts`, `AuthFilter.java`, `security.py` |
| Login por CRM, COREN ou ID de socorrista | `tipoRegistro` + `registro` + senha (bcrypt) | `auth-service/src/index.ts` |
| Log de acesso em todos os serviços | Interceptor em cada serviço → console + tabela `log_acesso` (ver 0.3) | `accessLog.ts`, `AccessLogFilter.java`, `access_log.py` |
| Interface do cliente + chave "Simular Conectividade" | PWA React com ficha completa; chave no cabeçalho bloqueia toda requisição em OFFLINE. Layout para celular | `client-app/src/components/`, `net/ConnectivityMonitor.js` |
| Interface administrativa | Atendimentos, prontuários, auditoria, logs e cadastros (pacientes, medicamentos, profissionais; inativação em vez de exclusão) | `admin-portal/src/paginas/` |
| Inserção manual pelo banco | Script do passo 9 | `database/03_novos_medicamentos.sql` |
| Ficha em PDF | `GET /documento/atendimento/{id}/pdf` (ReportLab) | `document-service/app/pdf_builder.py` |
| Envio da ficha por e-mail | `POST /documento/atendimento/{id}/email` via SMTP do Gmail, ativo na VM. Destinatário sugerido: paciente, depois contato de emergência | `document-service/app/email_sender.py` |
| Rotas validáveis por Postman/Insomnia | Coleção com 33 requisições e testes, ambientes local e VM, e Swagger UI | `postman/`, `ferramentas/` |

## 0.3 Campos do log de acesso

| Exigido | Coluna |
|---|---|
| Data e hora | `data_hora` |
| IP do cliente | `ip_cliente` (`X-Real-IP` do Nginx) |
| Profissional autenticado | `profissional_id` + `registro` (ex.: `CRM 12345`) |
| Método / rota / status | `metodo`, `rota`, `status_code` |
| Tempo de processamento | `tempo_ms` |

Também: `servico`, `origem` (`SERVIDOR` ou `CLIENTE_OFFLINE`) e `dispositivo_id`. O interceptor é o primeiro da cadeia, por isso registra também as requisições recusadas (401).

## 0.4 Offline-first e sincronização

| Requisito | Como foi atendido |
|---|---|
| Operação e consulta local irrestritas | Toda gravação e leitura usa o IndexedDB; token vencido não bloqueia o app |
| Envio quando a conexão volta | Outbox enviada automaticamente pelo Observer ou pelo botão "Sincronizar" |
| Sincronização nos dois sentidos | `GET /sync/pull` (incremental) e `POST /sync/push` |
| Idempotência | UUID gerado no cliente + `opId` por comando (`sync_operacao`). Mesmo CPF cadastrado em dois aparelhos é `VINCULADO`, sem duplicar |
| Conflitos | Controle otimista por `versao` + Strategy: LWW (pessoa, atendimento), MERGE (prontuário) |
| Rastreabilidade | `auditoria_alteracao` com origem, estratégia, profissional, dispositivo e JSON antes/depois |
| Logs do período offline | Store `logs`, enviada por `POST /log` |
| Segurança clínica offline | Alerta de dose acima da máxima, com os medicamentos do banco local |

## 0.5 Padrões de projeto

Repository, Strategy e Observer (sugeridos) + Command, Facade e Builder (escolhidos). Detalhes em [04_PADROES_DE_PROJETO.md](04_PADROES_DE_PROJETO.md).

## 0.6 Endpoints sugeridos

Todos os endpoints sugeridos pelo enunciado foram implementados, além de rotas extras (sync, auditoria, cadastros). Lista completa em [02_API.md](02_API.md).

## 0.7 Segurança e privacidade

- Os serviços não sobem sem um `JWT_SECRET` forte; os scripts geram um automaticamente.
- Ao sair, o banco local do aparelho é apagado. A saída fica bloqueada enquanto houver registros não enviados.
- O clinical-service isola o profissional autenticado por requisição (validado com 400 chamadas simultâneas de perfis diferentes).
- Profissional inativado não faz mais login; um token já emitido vale até expirar (12 h), pois o JWT é *stateless*.
