# 2. Documentação das APIs

Base (via gateway): `http://IP-DA-VM/api`. Todas as rotas exigem o header `Authorization: Bearer <token>`, **exceto** `POST /auth/login`.

Headers opcionais aceitos por todos os serviços:

| Header | Uso |
|---|---|
| `X-Device-Id` | Identifica o dispositivo (vai para logs e auditoria) |
| `Idempotency-Key` | Em `POST /pessoa`, `/prontuario`, `/atendimento`: reenvio com a mesma chave devolve `DUPLICADO` |

Erros seguem sempre o formato `{"erro": "mensagem"}` com o status HTTP adequado (400, 401, 403, 404, 409, 500, 502, 503).

## 2.1 Visão geral das rotas

| Método | Rota (gateway) | Serviço | Auth | Descrição |
|---|---|---|---|---|
| POST | `/auth/login` | auth (Node) | **Não** | Autentica o profissional e retorna o token |
| GET | `/auth/me` | auth (Node) | Sim | Dados do token atual |
| GET | `/auth/profissional` | auth (Node) | ADMIN | Lista profissionais (ativos e inativos) |
| POST | `/auth/profissional` | auth (Node) | ADMIN | Cadastra profissional |
| PUT | `/auth/profissional/{id}` | auth (Node) | ADMIN | Altera dados, redefine senha, inativa/reativa |
| GET | `/medicamento` | clinical (Java) | Sim | Lista medicamentos ativos (`?todos=true` inclui inativos, só ADMIN) |
| POST | `/medicamento` | clinical (Java) | ADMIN | Cadastra medicamento |
| PUT | `/medicamento/{id}` | clinical (Java) | ADMIN | Altera ou inativa/reativa medicamento |
| GET | `/pessoa` | clinical (Java) | Sim | Lista pessoas (com total de atendimentos) |
| GET | `/pessoa/{id}` | clinical (Java) | Sim | Uma pessoa |
| POST | `/pessoa` | clinical (Java) | Sim | Cadastra/atualiza pessoa (idempotente) |
| GET | `/prontuario` | clinical (Java) | Sim | Prontuários de todas as pessoas |
| GET | `/prontuario/{id}` | clinical (Java) | Sim | Prontuário de uma pessoa (`{id}` = id da pessoa ou do prontuário) + atendimentos |
| POST | `/prontuario` | clinical (Java) | Sim | Cadastra/atualiza prontuário (idempotente) |
| GET | `/atendimento` | clinical (Java) | Sim | Todos os atendimentos (resumo) |
| GET | `/atendimento/{id}` | clinical (Java) | Sim | Atendimentos de uma pessoa (`{id}` = id da pessoa) |
| GET | `/atendimento/detalhe/{id}` | clinical (Java) | Sim | Ficha completa: atendimento, pessoa, prontuário, profissional, medicamentos |
| POST | `/atendimento` | clinical (Java) | Sim | Cadastra atendimento com medicamentos administrados |
| GET | `/sync/pull?desde=ISO` | clinical (Java) | Sim | Servidor → cliente: tudo que mudou desde `desde` |
| POST | `/sync/push` | clinical (Java) | Sim | Cliente → servidor: lote da Outbox |
| POST | `/log` | clinical (Java) | Sim | Recebe logs gravados no dispositivo durante o modo offline |
| GET | `/log?limite=N` | clinical (Java) | ADMIN | Logs de acesso de todos os serviços |
| GET | `/auditoria?entidadeId=&limite=` | clinical (Java) | ADMIN | Trilha de auditoria de alterações |
| GET | `/documento/atendimento/{id}/pdf` | document (Python) | Sim | Gera a Ficha de Atendimento em PDF |
| POST | `/documento/atendimento/{id}/email` | document (Python) | Sim | Gera o PDF e envia por e-mail como anexo |

> O Swagger automático do FastAPI (`/docs`, `/openapi.json`) está **desativado**: ele responderia sem token e quebraria a regra "todas as rotas, exceto o login, exigem autenticação".

Portas internas (sem o gateway): auth `3001`, clinical `8080`, document `8000`. No acesso direto, remova o prefixo `/api`.

## 2.2 Autenticação

### `POST /auth/login`
```json
{ "tipoRegistro": "CRM", "registro": "12345", "senha": "senha123" }
```
`tipoRegistro`: `CRM` (médico), `COREN` (enfermagem), `SOC` (socorrista), `ADM` (administrador do portal).

**200**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiraEm": "2026-11-11T02:30:00.000Z",
  "profissional": { "id": "0000...0002", "nome": "Dra. Ana Souza", "tipoRegistro": "CRM", "registro": "12345", "uf": "RS", "perfil": "SOCORRISTA" }
}
```
**400** campos ausentes · **401** credenciais inválidas.

Conteúdo do token (payload): `sub` (id), `nome`, `tipo`, `registro`, `perfil`, `iat`, `exp` (12 h).

## 2.3 Cadastros do portal (ADMIN)

Regras comuns: **nada é apagado**, só inativado (`ativo: false`), porque atendimentos antigos continuam apontando para o medicamento ou profissional. Toda criação/alteração de medicamento ou profissional gera uma linha em `auditoria_alteracao` com `origem = PORTAL`.

### `POST /medicamento` · `PUT /medicamento/{id}`
```json
{ "nome": "Cetamina", "principioAtivo": "Cloridrato de cetamina", "apresentacao": "Frasco 50 mg/mL",
  "viaPadrao": "IV", "doseMaxima": 100, "unidade": "mg", "ativo": true }
```
`nome` é obrigatório; se `doseMaxima` for informada, deve ser > 0 e vir com `unidade`. O `PUT` recebe o registro completo; `ativo: false` inativa (operação `INATIVACAO` na auditoria). Toda gravação atualiza `atualizado_em`, por isso a mudança chega aos dispositivos no próximo `GET /sync/pull`; o app esconde os inativos.

### `POST /auth/profissional`
```json
{ "nome": "Enf. Juliana Prates", "tipoRegistro": "COREN", "registro": "61904", "uf": "RS",
  "email": "juliana@example.com", "senha": "no mínimo 8 caracteres" }
```
O perfil é derivado do tipo: `ADM` → `ADMIN` (portal); `CRM`, `COREN`, `SOC` → `SOCORRISTA` (app). Tipo + registro repetidos → `409`.

### `PUT /auth/profissional/{id}`
```json
{ "nome": "...", "uf": "RS", "email": "...", "ativo": true, "senha": "opcional: redefine" }
```
`tipoRegistro` e `registro` não mudam (identificam o profissional nos logs). Inativado, o profissional não consegue mais fazer login; um token já emitido continua válido até expirar (JWT é *stateless*). O administrador não pode inativar a si mesmo. A senha nunca vai para a auditoria.

### Pacientes e prontuários
O portal edita pacientes e prontuários pelas **mesmas rotas** dos dispositivos (`POST /pessoa`, `POST /prontuario`, seção 2.4), enviando a `versao` que está sendo editada. Se uma equipe alterou o registro nesse meio-tempo, o servidor resolve o conflito pela Strategy da entidade, exatamente como numa sincronização.

## 2.4 Entidades clínicas

Os três `POST` usam a **mesma lógica idempotente** do push (ver 2.5) e respondem:

```json
{
  "opId": "9f1c0a8e-...",          // Idempotency-Key, se enviado
  "entidade": "pessoa",
  "id": "3333...",
  "status": "CRIADO",               // CRIADO | ATUALIZADO | SEM_ALTERACAO | DUPLICADO | CONFLITO_RESOLVIDO | VINCULADO
  "estrategia": null,               // LWW | SERVER_WINS | MERGE quando houve conflito (MERGE no vínculo)
  "idOrigem": "...",                // só no VINCULADO: o id enviado, que passou a apontar para "id"
  "registro": { ...registro final no servidor, com versao e atualizadoEm... }
}
```
Status HTTP: **201** quando `CRIADO`, **200** nos demais, **400** validação, **409** violação de integridade (ex.: alterar o CPF para um que já pertence a outra pessoa, pessoa inexistente).

Campos de controle aceitos em todas as entidades: `id` (UUID, **obrigatório, gerado pelo cliente**), `versao` (versão-base que o cliente conhecia; `0` para registro novo), `atualizadoEm` (ISO-8601, carimbo da edição), `criadoOffline` (boolean).

### `POST /pessoa`
```json
{
  "id": "44444444-4444-4444-4444-444444444444",
  "nome": "Maria Souza", "cpf": "111.222.333-44", "dataNascimento": "1990-03-15", "sexo": "F",
  "telefone": "(51) 99999-0000", "email": "maria@example.com",
  "contatoEmergenciaNome": "José Souza", "contatoEmergenciaEmail": "jose@example.com",
  "versao": 0
}
```
Obrigatórios: `id`, `nome`. `sexo`: `M`, `F` ou `O`.

### `POST /prontuario`
```json
{
  "id": "aaaaaaaa-4444-4444-4444-444444444444", "pessoaId": "44444444-4444-4444-4444-444444444444",
  "tipoSanguineo": "B+", "alergias": "Látex, Dipirona", "comorbidades": "Asma",
  "medicamentosContinuos": "Salbutamol", "observacoes": null, "versao": 0
}
```
Obrigatórios: `id`, `pessoaId`. Um prontuário por pessoa.

### `POST /atendimento`
```json
{
  "id": "bbbbbbbb-4444-4444-4444-444444444444",
  "prontuarioId": "aaaaaaaa-4444-4444-4444-444444444444",
  "pessoaId": "44444444-4444-4444-4444-444444444444",
  "dataHora": "2026-11-10T14:30:00.000Z",
  "localOcorrencia": "BR-386, km 350", "queixaPrincipal": "Queda de moto",
  "paSistolica": 120, "paDiastolica": 80, "freqCardiaca": 98, "freqRespiratoria": 18,
  "saturacaoO2": 96, "temperatura": 36.5, "glicemia": 110,
  "glasgowOcular": 3, "glasgowVerbal": 4, "glasgowMotora": 6, "glasgowTotal": 13,
  "triagemManchester": "AMARELO", "triagemStart": "VERDE",
  "procedimentos": "Imobilização", "observacoes": null, "destino": "HSC",
  "medicamentos": [
    { "medicamentoId": "<id de GET /medicamento>", "dose": 500, "unidade": "mg", "via": "IV", "horario": "2026-11-10T14:35:00.000Z" }
  ],
  "versao": 0
}
```
Obrigatórios: `id`, `prontuarioId`, `pessoaId`, `dataHora`. `profissionalId` é **sempre** o usuário do token (o valor enviado no corpo é ignorado); numa alteração, mantém o responsável original.
Domínios: Glasgow ocular 1–4, verbal 1–5, motora 1–6, total 3–15; Manchester `VERMELHO|LARANJA|AMARELO|VERDE|AZUL`; START `VERMELHO|AMARELO|VERDE|PRETO`.

### Consultas
- `GET /atendimento` → `[{ id, pessoaId, prontuarioId, dataHora, localOcorrencia, queixaPrincipal, triagemManchester, triagemStart, glasgowTotal, destino, versao, criadoOffline, atualizadoEm, sincronizadoEm, pessoaNome, profissionalNome, profissionalRegistro }]`
- `GET /atendimento/detalhe/{id}` → `{ atendimento: {...}, pessoa: {...}, prontuario: {...}, profissional: {...}, medicamentos: [{ nome, principioAtivo, apresentacao, dose, unidade, via, horario }] }`
- `GET /prontuario/{pessoaId}` → prontuário + `pessoaNome`, `pessoaCpf` + `atendimentos: [...]`

## 2.5 Sincronização

### `GET /sync/pull?desde=2026-11-10T14:00:00.000Z`
Sem `desde`, devolve tudo (carga inicial). Usa `sincronizado_em` (momento em que o registro chegou ao servidor), para que registros criados offline com data antiga também sejam entregues. Margem de 5 s para segurança; o cliente aplica por `id`, então repetição não duplica.
```json
{
  "servidorAgora": "2026-11-10T14:40:00.123Z",   // o cliente guarda e envia no próximo pull
  "desde": "2026-11-10T14:00:00.000Z",
  "medicamentos": [ ... ],
  "pessoas": [ ... ], "prontuarios": [ ... ],
  "atendimentos": [ { ..., "medicamentos": [ ... ] } ]
}
```

### `POST /sync/push`
```json
{
  "dispositivoId": "disp-1a2b3c4d",
  "operacoes": [
    { "opId": "0e000000-...-0001", "entidade": "pessoa",      "dados": { ...pessoa... } },
    { "opId": "0e000000-...-0002", "entidade": "prontuario",  "dados": { ...prontuário... } },
    { "opId": "0e000000-...-0003", "entidade": "atendimento", "dados": { ...atendimento... } }
  ]
}
```
As operações são processadas **na ordem**, cada uma em sua própria transação. Resposta:
```json
{
  "processadas": 3,
  "resultados": [
    { "opId": "...0001", "entidade": "pessoa", "id": "...", "status": "CRIADO", "estrategia": null, "registro": { ... } },
    { "opId": "...0002", "entidade": "prontuario", "status": "CONFLITO_RESOLVIDO", "estrategia": "MERGE", "registro": { "alergias": "Penicilina, Látex", "versao": 2, ... } },
    { "opId": "...0003", "entidade": "atendimento", "status": "ERRO", "mensagem": "Registro relacionado não encontrado no servidor" }
  ]
}
```

| Status | Significado |
|---|---|
| `CRIADO` | Registro novo inserido (versão 1) |
| `ATUALIZADO` | Versão-base igual à do servidor: alteração aplicada (versão + 1) |
| `SEM_ALTERACAO` | Conteúdo idêntico ao do servidor: nada gravado |
| `DUPLICADO` | `opId` já processado anteriormente: nada gravado |
| `CONFLITO_RESOLVIDO` | Versões divergentes: resolvido pela Strategy indicada em `estrategia` |
| `VINCULADO` | Cadastro novo de um dado que já existe: pessoa com o mesmo CPF (só os dígitos) ou segundo prontuário da mesma pessoa. O id enviado (`idOrigem`) é vinculado ao registro existente (`id`) e os dados são mesclados (MERGE) |
| `ERRO` | Operação recusada (validação/integridade). As demais seguem normalmente. A mensagem é sempre legível; o detalhe técnico fica só no log do servidor |

**Cadastro duplicado entre dispositivos offline.** Duas equipes sem sinal atendem a mesma paciente e cada uma a cadastra com seu próprio UUID. A primeira a sincronizar cria o registro. Quando a segunda chega, o servidor encontra o mesmo CPF e, em vez de recusar (o que travaria a Outbox para sempre), **vincula**: grava `id do dispositivo → id do servidor` na tabela `registro_vinculado`, mescla os dados (nenhuma alergia se perde) e responde `VINCULADO` com `idOrigem`. O prontuário e o atendimento que vêm em seguida, ainda com o id antigo, são redirecionados pela mesma tabela. O cliente, ao receber `idOrigem`, troca o id local pelo do servidor no registro, nas referências e nos comandos ainda na fila. Tudo fica na auditoria como `VINCULO`.

### `POST /log`
```json
{
  "dispositivoId": "disp-1a2b3c4d",
  "logs": [ { "id": "7a00...", "dataHora": "2026-11-10T14:31:00.000Z", "metodo": "POST", "rota": "/atendimento (offline)", "statusCode": 201, "tempoMs": 3.2 } ]
}
```
→ `{ "recebidos": 1, "gravados": 1, "duplicadosIgnorados": 0 }` (o `id` local evita duplicar logs reenviados).

## 2.6 Documentos

### `GET /documento/atendimento/{id}/pdf`
→ `200 application/pdf` (`Content-Disposition: inline; filename="ficha-atendimento-xxxxxxxx.pdf"`). **404** se o atendimento ainda não chegou ao servidor.

### `POST /documento/atendimento/{id}/email`
```json
{ "destinatario": "familiar@example.com", "mensagem": "Texto opcional" }
```
Sem `destinatario`, usa o e-mail do paciente e, na falta dele, o do contato de emergência.
```json
{ "enviado": true, "destinatario": "familiar@example.com", "anexo": "ficha-atendimento-bbbbbbbb.pdf",
  "tamanhoBytes": 4953, "via": "SMTP", "servidor": "smtp.gmail.com:587" }
```
Sem SMTP configurado, `via` = `ARQUIVO` e `arquivo` indica o `.eml` gravado (abre no Thunderbird/Outlook com o PDF anexado).

## 2.7 Logs de acesso e auditoria

### `GET /log?limite=N` (ADMIN)
Lista os registros de `log_acesso`, do mais recente para o mais antigo (padrão 200, máximo 2000). Cada registro traz: data/hora, IP do cliente, profissional autenticado, método, rota, status e tempo em ms, além do serviço que registrou, da origem (`SERVIDOR` ou `CLIENTE_OFFLINE`) e do dispositivo. A descrição de cada campo está em [00_REQUISITOS_E_EVIDENCIAS.md](00_REQUISITOS_E_EVIDENCIAS.md), seção 0.3, e as colunas em [03_BANCO_DE_DADOS.md](03_BANCO_DE_DADOS.md).

### `GET /auditoria?entidadeId=UUID&limite=N` (ADMIN)
Lista a trilha de `auditoria_alteracao`. Sem `entidadeId`, devolve as últimas alterações de todas as entidades; com ele, o histórico de um registro (operação, origem, estratégia de conflito, profissional, dispositivo, `opId` e os dados antes/depois).

## 2.8 Validação com Postman

Importe `postman/MedicalField.postman_collection.json`, ajuste a variável `baseUrl` para `http://IP-DA-VM/api` e execute a coleção no **Collection Runner**: são 33 requisições com testes automáticos (login, 401 sem token, cadastros, 403 sem perfil ADMIN, idempotência, conflito MERGE, logs, PDF, e-mail, auditoria).
