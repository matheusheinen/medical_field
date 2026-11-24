# 4. Padrões de Projeto

Seis padrões exigidos: os três sugeridos (Repository, Strategy, Observer) e três escolhidos (Command, Facade, Builder). Cada um tem a tabela de **papéis**: qual parte do código faz cada papel do padrão.

| Padrão | Onde | Problema que resolve |
|---|---|---|
| **Repository** | `client-app/src/repositories/LocalRepository.js`, `RemoteRepository.js`; `clinical-service/.../data/ClinicalRepository.java`, `MedicamentoRepository.java`, `AuditRepository.java`, `LogRepository.java`, `SyncOperacaoRepository.java` | No app, só o `LocalRepository` conhece o Dexie/IndexedDB e as chamadas à API passam pelo `RemoteRepository` (telas, serviços e `SyncManager` usam os dois); no Java, os services não têm SQL |
| **Strategy** | `clinical-service/.../sync/ConflictStrategy.java` → `LastWriteWinsStrategy`, `FieldMergeStrategy`, `ServerWinsStrategy` | Trocar o algoritmo de conflito por entidade sem mudar o fluxo de sincronização |
| **Observer** | Sujeitos: `client-app/src/net/ConnectivityMonitor.js` (principal), `SyncManager.js` e `services/sessao.js`. Observadores: `SyncManager` e os hooks de `hooks.js` | Quando a conexão volta, a Outbox é enviada sozinha e a interface atualiza o indicador, sem o monitor conhecer quem o observa |
| **Command** | `client-app/src/sync/commands.js` (`UpsertCommand`) | Cada alteração vira um objeto serializável, guardado na Outbox e executado depois no servidor; o `opId` garante idempotência |
| **Facade** | `client-app/src/sync/SyncManager.js`; `clinical-service/.../service/SyncService.java` | A interface chama só `sincronizar()`; o servidor expõe só `pull`/`push`, escondendo transações, idempotência e auditoria |
| **Builder** | `document-service/app/pdf_builder.py` (`FichaPdfBuilder`) | Monta a ficha em PDF seção por seção, com API fluente |

**Complementares:**
- **Singleton:** `Database.java` (construtor privado + `INSTANCE` + `get()`) e, no app, as instâncias únicas de módulo `connectivity` e `syncManager`.
- **Chain of Responsibility:** `AccessLogFilter → AuthFilter → Router` (`App.java:86-87`). O `AccessLogFilter` sempre repassa e mede o tempo em volta; quem **interrompe** a cadeia é o `AuthFilter`, com 401. No auth-service e no document-service, o mesmo papel é feito pelos middlewares do Express e do FastAPI.
- **Simple Factory** (não é um padrão GoF): `ConflictStrategyFactory` escolhe a Strategy pela configuração; `criar_email_sender()` escolhe o envio de e-mail.
- **Strategy + Adapter no e-mail:** a rota depende só da interface `EmailSender`. O `SmtpEmailSender` adapta a biblioteca `smtplib` (SSL ou STARTTLS, login); o `ArquivoEmailSender` é a alternativa sem servidor, que grava um `.eml`.

## Repository

| Papel | No código |
|---|---|
| Repositório local | `LocalRepository.js`: único arquivo que usa o Dexie (consultas, Outbox, logs, transação) |
| Repositório remoto | `RemoteRepository.js`, sobre o cliente HTTP único `net/apiClient.js` |
| Repositórios do servidor | `ClinicalRepository` (genérico para pessoa, prontuário e atendimento), `MedicamentoRepository`, `AuditRepository`, `LogRepository`, `SyncOperacaoRepository` |
| Quem usa | telas (`components/`), `AtendimentoService.js`, `SyncManager.js`; no Java, `UpsertService`, `SyncService`, `MedicamentoService` |

O auth-service é pequeno (login e cadastro de profissionais) e mantém o SQL nas próprias rotas, de propósito.

## Strategy

| Papel | No código |
|---|---|
| Interface (Strategy) | `ConflictStrategy.java:15` (`resolver(def, servidor, cliente)`) |
| Estratégias concretas | `LastWriteWinsStrategy`, `FieldMergeStrategy`, `ServerWinsStrategy` |
| Contexto (quem usa) | `UpsertService.java`, no caso "versões divergentes" (`estrategias.para(def.nome()).resolver(...)`) |
| Quem escolhe | `ConflictStrategyFactory.para(entidade)`, a partir do `.env` |

- **LWW** (pessoa, atendimento): vence o `atualizadoEm` mais recente.
- **MERGE** (prontuário): alergias, comorbidades e medicamentos contínuos são unidos, porque perder uma alergia é risco clínico.
- A estratégia de cada entidade pode ser trocada no `.env`, por exemplo `CONFLICT_STRATEGY_ATENDIMENTO=SERVER_WINS`. Um valor inválido impede o serviço de subir.
- Testes: `clinical-service/src/test/.../ConflictStrategyTest.java`.

```java
public interface ConflictStrategy {
    String nome();
    Map<String, Object> resolver(EntityDef def, Map<String, Object> servidor, Map<String, Object> cliente);
}
```

## Observer

| Papel | No código |
|---|---|
| Sujeito | `ConnectivityMonitor.js`: lista `#observadores` (`Set`), `inscrever()`, `#notificar()` |
| Estado | Duas fontes: `#chaveLigada` (chave "Simular conectividade") e `#temRede` (rede real). `online` = as duas permitem |
| Mudança de estado | `ligarChave()` (clique na chave, `Cabecalho.jsx`) e `#redeMudou()` (eventos `online`/`offline` do navegador). As duas passam por `#mudar()`, que anota o estado anterior, aplica a mudança e chama `#notificar()` |
| Observadores | `SyncManager` (sincroniza quando a conexão volta) e `useConectividade` em `hooks.js` (redesenha as telas) |
| Sujeitos com a mesma forma | `SyncManager` (estado da sincronização → `useSync`) e `sessao.js` (sessão → `useSessao`) |

Os três sujeitos seguem a mesma forma: uma lista `observadores`, `inscrever()` (que devolve a função de sair) e `notificar()`, que protege cada observador com `try/catch` para que um observador com erro não impeça os outros de serem notificados.

```js
// SyncManager.js: o observador decide o que fazer com o aviso
connectivity.inscrever((ev) => {
  if (ev.online && !ev.anterior && sessao.tokenValido()) {
    this.sincronizar('Conexão restabelecida').catch(() => {});
  }
});
```

## Command

| Papel | No código |
|---|---|
| Comando | `UpsertCommand` (`commands.js`), serializado na Outbox |
| Cliente (cria os comandos) | `Comandos.salvarPessoa/salvarProntuario/registrarAtendimento`, chamados em `AtendimentoService.js` |
| Invocador (dispara sem saber o que fazem) | `SyncManager.#push`: envia a Outbox em ordem para `POST /sync/push` |
| Receptor (executa de fato) | o servidor: `UpsertService.executar` |

É um Command **serializado**: como o comando atravessa a rede, ele não tem um método `execute()` próprio. A execução acontece no servidor, e o `opId` faz com que um reenvio seja reconhecido como `DUPLICADO`.

## Facade

| Fachada | Esconde |
|---|---|
| `SyncManager.js`: `sincronizar()`, `enviarPendentes()`, `receberDados()` | Outbox, comandos, logs offline, pull incremental, troca de ids vinculados |
| `SyncService.java`: `pull()`, `push()`, `gravarDireto()` | transação por operação, idempotência, Strategy de conflito, auditoria |

O `SyncManager` concentra o ciclo de sincronização: além de fachada, é observador do `ConnectivityMonitor`, sujeito da barra de status e garante um envio por vez (`#exclusivo`).

## Builder

| Papel | No código |
|---|---|
| Builder | `FichaPdfBuilder` (`pdf_builder.py`): cada etapa (`cabecalho()`, `paciente()`, …) acrescenta uma seção e devolve `self` |
| Resultado | `construir()` gera os bytes do PDF |
| Diretor | `gerar_ficha_pdf()`: define a ordem das seções |

```python
pdf = (FichaPdfBuilder(ficha)
       .cabecalho().paciente().prontuario().atendimento()
       .sinais_vitais().glasgow_e_triagem().medicamentos()
       .conduta().assinatura()
       .construir())
```

## Padrões de arquitetura do offline-first

Não são padrões GoF, mas são o que faz a sincronização funcionar:

| Padrão | No projeto |
|---|---|
| **Transactional Outbox** | O registro e o comando são gravados na mesma transação local (`AtendimentoService.registrarOcorrencia` → `LocalRepository.emTransacao`); o envio acontece depois, pelo `SyncManager` |
| **Idempotency Key** | `opId` gerado no aparelho e registrado em `sync_operacao` (`SyncOperacaoRepository`); o id dos registros também nasce no aparelho |
| **Controle de concorrência otimista** | Coluna `versao`: versão-base igual à do servidor → `ATUALIZADO`; diferente → conflito resolvido pela Strategy |
| **Metadata Mapping** | `EntityDef` + `Entities.java` descrevem as tabelas, por isso um único `ClinicalRepository` atende as três entidades |
| **Estados da Outbox** | `PENDENTE → ENVIANDO →` removido (aceito) ou `ERRO` (recusado); comandos com `ERRO` são reenviados na próxima sincronização, e os `ENVIANDO` de um app fechado no meio do envio voltam para `PENDENTE` |
| **API Gateway** | Nginx roteia `/api/*` para os três serviços |
| **Banco central compartilhado** | Exigência do enunciado. O document-service não lê tabelas clínicas: busca a ficha no clinical-service por HTTP |
