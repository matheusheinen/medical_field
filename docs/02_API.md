# 2. Documentação das APIs

Base (via gateway): `http://177.44.248.79/api` (VM) ou `http://localhost:5173/api` (local). Todas as rotas exigem `Authorization: Bearer <token>`, **exceto** `POST /auth/login`.

Os exemplos completos de requisição e resposta estão no **Swagger** ([`ferramentas/openapi.yaml`](../ferramentas/openapi.yaml)): rode `python -m http.server 5500 --directory ferramentas` e abra `http://localhost:5500/`. O login feito pelo Swagger já preenche o token. O Swagger automático do FastAPI foi desativado para não deixar uma rota aberta.

Erros seguem o formato `{"erro": "mensagem"}`. Headers opcionais: `X-Device-Id` (vai para logs e auditoria) e `Idempotency-Key` (nos `POST` clínicos).

## 2.1 Rotas

| Método | Rota | Serviço | Auth | Descrição |
|---|---|---|---|---|
| POST | `/auth/login` | auth (Node) | **Não** | Autentica e retorna o token |
| GET | `/auth/me` | auth | Sim | Dados do token atual |
| GET · POST | `/auth/profissional` | auth | ADMIN | Lista / cadastra profissionais |
| PUT | `/auth/profissional/{id}` | auth | ADMIN | Altera, redefine senha, inativa |
| GET | `/medicamento` | clinical (Java) | Sim | Medicamentos ativos (`?todos=true` só para ADMIN) |
| POST · PUT | `/medicamento`, `/medicamento/{id}` | clinical | ADMIN | Cadastra / altera / inativa |
| GET | `/pessoa`, `/pessoa/{id}` | clinical | Sim | Pessoas |
| POST | `/pessoa` | clinical | Sim | Cadastra/atualiza pessoa (idempotente) |
| GET | `/prontuario`, `/prontuario/{id}` | clinical | Sim | Prontuários (`{id}` = pessoa ou prontuário) com atendimentos |
| POST | `/prontuario` | clinical | Sim | Cadastra/atualiza prontuário (idempotente) |
| GET | `/atendimento` | clinical | Sim | Todos os atendimentos (resumo) |
| GET | `/atendimento/{id}` | clinical | Sim | Atendimentos de uma pessoa |
| GET | `/atendimento/detalhe/{id}` | clinical | Sim | Ficha completa |
| POST | `/atendimento` | clinical | Sim | Cadastra atendimento com medicamentos |
| GET | `/sync/pull?desde=ISO` | clinical | Sim | Servidor → cliente: o que mudou desde `desde` |
| POST | `/sync/push` | clinical | Sim | Cliente → servidor: lote da Outbox |
| POST | `/log` | clinical | Sim | Logs gravados offline no aparelho |
| GET | `/log?limite=N` | clinical | ADMIN | Logs de acesso dos três serviços |
| GET | `/auditoria?entidadeId=&limite=` | clinical | ADMIN | Trilha de auditoria |
| GET | `/documento/atendimento/{id}/pdf` | document (Python) | Sim | Ficha de Atendimento em PDF |
| POST | `/documento/atendimento/{id}/email` | document | Sim | Envia a ficha por e-mail como anexo |

Portas internas: auth `3001`, clinical `8080`, document `8000`.

## 2.2 Autenticação

```json
POST /auth/login
{ "tipoRegistro": "CRM", "registro": "12345", "senha": "senha123" }
→ 200 { "token": "eyJ...", "expiraEm": "...", "profissional": { "id", "nome", "tipoRegistro", "registro", "perfil" } }
```
`tipoRegistro`: `CRM`, `COREN`, `SOC` (perfil SOCORRISTA, usam o app) ou `ADM` (perfil ADMIN, usa o portal). Respostas de erro: **400** campos ausentes, **401** credenciais inválidas. O token vale 12 h.

## 2.3 Entidades clínicas

`POST /pessoa`, `/prontuario` e `/atendimento` recebem o registro completo com `id` (UUID **gerado pelo cliente**) e `versao` (versão-base; `0` se for novo). Usam a mesma lógica idempotente do push e respondem:

```json
{ "entidade": "pessoa", "id": "...", "status": "CRIADO", "estrategia": null, "registro": { ... } }
```

- **Obrigatórios:** pessoa `id`, `nome` · prontuário `id`, `pessoaId` (um por pessoa) · atendimento `id`, `prontuarioId`, `pessoaId`, `dataHora`.
- O `profissionalId` do atendimento é sempre o usuário do token.
- **Domínios:** Glasgow ocular 1–4, verbal 1–5, motora 1–6, total 3–15; Manchester `VERMELHO|LARANJA|AMARELO|VERDE|AZUL`; START `VERMELHO|AMARELO|VERDE|PRETO`.
- Nada é apagado: medicamentos e profissionais são inativados (`ativo: false`) e auditados com origem `PORTAL`.

## 2.4 Sincronização

`POST /sync/push` recebe `{ dispositivoId, operacoes: [{ opId, entidade, dados }] }` e processa as operações **em ordem**, cada uma em sua própria transação. Cada operação recebe um status:

| Status | Significado |
|---|---|
| `CRIADO` | Registro novo (versão 1) |
| `ATUALIZADO` | Versão-base igual à do servidor: alteração aplicada |
| `SEM_ALTERACAO` | Conteúdo idêntico: nada gravado |
| `DUPLICADO` | `opId` já processado: nada gravado |
| `CONFLITO_RESOLVIDO` | Versões divergentes, resolvidas pela Strategy (`LWW` ou `MERGE`) |
| `VINCULADO` | Mesmo CPF já cadastrado por outro aparelho: o id enviado passa a apontar para o existente, com dados mesclados |
| `ERRO` | Operação recusada; as demais seguem normalmente |

`GET /sync/pull?desde=` devolve medicamentos, pessoas, prontuários e atendimentos alterados desde a data informada, mais `servidorAgora`, que o cliente envia no próximo pull.

## 2.5 Documentos

- `GET /documento/atendimento/{id}/pdf` → `application/pdf` (**404** se o atendimento ainda não chegou ao servidor).
- `POST /documento/atendimento/{id}/email` com `{ "destinatario": "...", "mensagem": "opcional" }`. Sem destinatário, usa o e-mail do paciente e, na falta dele, o do contato de emergência.

## 2.6 Postman

Importe `postman/MedicalField.postman_collection.json` e o ambiente **MedicalField - VM** ou **MedicalField - local**, e rode no Collection Runner. São 33 requisições com testes: login, 401, 403, idempotência, conflito, PDF, e-mail e auditoria.
