# 4. Padrões de Projeto

O trabalho exige seis padrões: os três sugeridos (Repository, Strategy, Observer) e mais três de livre escolha. Foram usados **Command, Facade e Builder** como os três escolhidos; Factory, Adapter, Singleton e Chain of Responsibility aparecem como complementares.

| # | Padrão | Onde | Problema que resolve |
|---|---|---|---|
| 1 | **Repository** (sugerido) | `client-app/src/repositories/LocalRepository.js`, `RemoteRepository.js`; `clinical-service/.../data/ClinicalRepository.java` | A interface não conhece IndexedDB nem `fetch`; o serviço Java não mistura SQL com regra de negócio |
| 2 | **Strategy** (sugerido) | `clinical-service/.../sync/ConflictStrategy.java` + `LastWriteWinsStrategy`, `ServerWinsStrategy`, `FieldMergeStrategy` | Trocar o algoritmo de resolução de conflito por entidade sem alterar o fluxo de sincronização |
| 3 | **Observer** (sugerido) | `client-app/src/net/ConnectivityMonitor.js` (Subject); `SyncManager` e componentes React (observadores) | Quando a conexão volta, a Outbox é enviada automaticamente, e a interface atualiza o indicador Online/Offline |
| 4 | **Command** (escolhido) | `client-app/src/sync/commands.js` (`UpsertCommand`) | Cada alteração vira um objeto serializável, guardado na Outbox e executado depois no servidor; o `opId` garante idempotência |
| 5 | **Facade** (escolhido) | `client-app/src/sync/SyncManager.js`; `clinical-service/.../service/SyncService.java` | A interface chama só `sincronizar()`; o servidor expõe só `pull`/`push`, escondendo transações, Outbox, idempotência e auditoria |
| 6 | **Builder** (escolhido) | `document-service/app/pdf_builder.py` (`FichaPdfBuilder`) | Montar a ficha em PDF seção por seção, com uma API fluente e ordem definida por um "diretor" (`gerar_ficha_pdf`) |
| + | Factory | `ConflictStrategyFactory.java`, `Comandos` (commands.js), `criar_email_sender()` | Escolher a Strategy por entidade (configurável por variável de ambiente) e o tipo de envio de e-mail |
| + | Adapter | `document-service/app/email_sender.py` (`SmtpEmailSender`, `ArquivoEmailSender`) | Mesma interface para SMTP real ou gravação em arquivo `.eml` |
| + | Singleton | `Database.java`, `db.ts` (pool), `connectivity`, `syncManager` | Uma única instância de conexão/monitor por processo |
| + | Chain of Responsibility | Filtros do HttpServer Java: `AccessLogFilter → AuthFilter → Router`; middlewares Express/FastAPI | Log de acesso e autenticação como etapas independentes antes da rota |

---

## 4.1 Repository

```js
// client-app/src/components/NovaOcorrencia.jsx — a tela só conhece o repositório
const pessoas = useLiveQuery(() => local.listarPessoas(), [], []);
const pr = await local.prontuarioDaPessoa(p.id);
```
```js
// LocalRepository.js — o único lugar que conhece o Dexie/IndexedDB
listarPessoas: () => db.pessoas.orderBy('nome').toArray(),
async salvarComOutbox(comando) { /* grava PENDENTE + enfileira na Outbox */ }
```
O `RemoteRepository` concentra as chamadas REST (`login`, `pull`, `push`, `enviarLogs`, `baixarFichaPdf`, `enviarFichaPorEmail`). No Java, `ClinicalRepository` oferece `buscar/inserir/atualizar` genéricos, guiados por `EntityDef`, para as três entidades.

## 4.2 Strategy

```java
public interface ConflictStrategy {
    String nome();
    Map<String, Object> resolver(EntityDef def, Map<String, Object> servidor, Map<String, Object> cliente);
}
```
- **LWW** (pessoa, atendimento): vence o lado com `atualizadoEm` mais recente (sugestão do enunciado).
- **MERGE** (prontuário): campo vazio pega o valor do outro lado; **alergias, comorbidades e medicamentos contínuos são unidos** (perder uma alergia é risco clínico); os demais seguem o LWW.
- **SERVER_WINS**: mantém o servidor; a versão do cliente fica registrada na auditoria.

O `UpsertService` só chama `estrategias.para(entidade).resolver(...)` e grava o resultado. Para trocar: `CONFLICT_STRATEGY_ATENDIMENTO=SERVER_WINS` no `.env`.

## 4.3 Observer

```js
// ConnectivityMonitor (Subject)
definirSimulado(online) { const antes = this.online; this.#simuladoOnline = online; this.#notificar(antes); }
inscrever(observador) { this.#observadores.add(observador); return () => this.#observadores.delete(observador); }

// SyncManager (Observer)
connectivity.inscrever((ev) => {
  if (ev.online && !ev.anterior) this.sincronizar('Conexão restabelecida');
});
```
O estado observado combina a rede real (`online`/`offline` do navegador) e a chave da interface. O hook `useConectividade()` também é um observador e atualiza o cabeçalho.

## 4.4 Command

```js
export class UpsertCommand {
  constructor({ opId = uuid(), entidade, entidadeId, dados, criadoEm = agoraIso() }) { ... }
  paraOperacao() { return { opId: this.opId, entidade: this.entidade, dados: this.dados }; }
  serializar() { ... }                 // guardado na Outbox (IndexedDB)
  static desserializar(linha) { ... }  // reconstruído no momento do envio
}
```
O comando é criado no momento da ação (talvez offline) e executado mais tarde pelo `clinical-service`. O `opId` é a chave de idempotência gravada em `sync_operacao`.

## 4.5 Facade

```js
syncManager.sincronizar();     // logs offline → push da Outbox → pull incremental
syncManager.enviarPendentes(); // após registrar online
syncManager.receberDados();    // passos 6 e 11 do roteiro
```
No servidor, `SyncService` expõe `pull(desde)`, `push(usuario, corpo)` e `gravarDireto(...)`, escondendo transações por operação, idempotência, Strategy e auditoria.

## 4.6 Builder

```python
pdf = (FichaPdfBuilder(ficha)
       .cabecalho().paciente().prontuario().atendimento()
       .sinais_vitais().glasgow_e_triagem().medicamentos()
       .conduta().assinatura()
       .construir())
```
Cada etapa adiciona uma seção ao documento; `construir()` gera os bytes do PDF. Uma versão resumida da ficha seria outro "diretor" usando as mesmas etapas.
