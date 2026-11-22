# 4. Padrões de Projeto

Seis padrões exigidos: os três sugeridos (Repository, Strategy, Observer) e três escolhidos (Command, Facade, Builder).

| Padrão | Onde | Problema que resolve |
|---|---|---|
| **Repository** | `client-app/src/repositories/LocalRepository.js`, `RemoteRepository.js`; `clinical-service/.../data/ClinicalRepository.java`, `MedicamentoRepository.java`, `AuditRepository.java`, `LogRepository.java` | Telas não conhecem IndexedDB nem `fetch`; o serviço Java não mistura SQL com regra de negócio |
| **Strategy** | `clinical-service/.../sync/ConflictStrategy.java` → `LastWriteWinsStrategy`, `FieldMergeStrategy`, `ServerWinsStrategy` | Trocar o algoritmo de conflito por entidade sem mudar o fluxo de sincronização |
| **Observer** | `client-app/src/net/ConnectivityMonitor.js` (sujeito) → `SyncManager` e hooks React | Quando a conexão volta, a Outbox é enviada sozinha e a interface atualiza o indicador |
| **Command** | `client-app/src/sync/commands.js` (`UpsertCommand`) | Cada alteração vira um objeto serializável, guardado na Outbox e executado depois; o `opId` garante idempotência |
| **Facade** | `client-app/src/sync/SyncManager.js`; `clinical-service/.../service/SyncService.java` | A interface chama só `sincronizar()`; o servidor expõe só `pull`/`push`, escondendo transações, idempotência e auditoria |
| **Builder** | `document-service/app/pdf_builder.py` (`FichaPdfBuilder`) | Monta a ficha em PDF seção por seção, com API fluente |

Complementares: **Factory** (`ConflictStrategyFactory`, `criar_email_sender()`), **Adapter** (`SmtpEmailSender` / `ArquivoEmailSender`), **Singleton** (`Database.java`, `connectivity`, `syncManager`) e **Chain of Responsibility** (`AccessLogFilter → AuthFilter → Router` e middlewares).

## Exemplos

**Strategy:** o `UpsertService` só chama `estrategias.para(entidade).resolver(...)`.
- **LWW** (pessoa, atendimento): vence o `atualizadoEm` mais recente.
- **MERGE** (prontuário): alergias, comorbidades e medicamentos contínuos são unidos, porque perder uma alergia é risco clínico.
- A estratégia de cada entidade pode ser trocada no `.env`, por exemplo `CONFLICT_STRATEGY_ATENDIMENTO=SERVER_WINS`.

```java
public interface ConflictStrategy {
    String nome();
    Map<String, Object> resolver(EntityDef def, Map<String, Object> servidor, Map<String, Object> cliente);
}
```

**Observer:**
```js
connectivity.inscrever((ev) => {
  if (ev.online && !ev.anterior) this.sincronizar('Conexão restabelecida');
});
```

**Builder:**
```python
pdf = (FichaPdfBuilder(ficha)
       .cabecalho().paciente().prontuario().atendimento()
       .sinais_vitais().glasgow_e_triagem().medicamentos()
       .conduta().assinatura()
       .construir())
```
