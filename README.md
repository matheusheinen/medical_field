# MedicalField

**Prontuário eletrônico de emergência para equipes de atendimento pré-hospitalar, pensado para funcionar sem sinal.**

No local da ocorrência a equipe registra o paciente, os sinais vitais, a escala de Glasgow, a classificação de Manchester e os medicamentos aplicados, **com ou sem internet**. Os registros ficam no próprio aparelho e vão para o servidor central assim que a conexão volta: sem duplicar, sem perder alterações concorrentes e com trilha completa de auditoria. A central acompanha tudo pelo portal administrativo, gera a ficha em **PDF** e a envia por **e-mail** para o familiar ou o hospital de destino.

![Arquitetura](docs/arquitetura.svg)

## O que o sistema faz

**App da equipe (`/app/`)**: PWA para celular, tablet ou notebook
- Registro de ocorrência com busca de paciente, cadastro rápido de paciente novo e alerta de dose acima da máxima.
- Funciona offline: banco local (IndexedDB) e fila de envio (*Outbox*). A sincronização dispara sozinha quando a rede volta.
- Ficha em PDF direto do aparelho.

**Portal administrativo (`/admin/`)**
- Visão geral, atendimentos e prontuários consolidados.
- Cadastros de pacientes/prontuários, medicamentos e profissionais. Nada é apagado: registros são **inativados** e o histórico fica preservado.
- Auditoria (dados antes/depois de cada alteração e conflito) e logs de acesso de todos os serviços.

**Sincronização**
- Identificadores gerados no aparelho e um `opId` por operação: reenviar a mesma operação nunca cria registro duplicado.
- Controle de versão com resolução de conflitos por entidade: *Last-Write-Wins*, *Merge* de campos clínicos ou *Server-Wins*.

## Componentes

| Componente | Tecnologia | Pasta |
|---|---|---|
| auth-service | Node.js 22 + TypeScript (Express, JWT, bcrypt) | `services/auth-service` |
| clinical-service | Java 21 (HttpServer do JDK, JDBC, Jackson) | `services/clinical-service` |
| document-service | Python 3 + FastAPI (ReportLab, SMTP) | `services/document-service` |
| Banco central | PostgreSQL | `database/` |
| App da equipe | React + Vite, PWA, IndexedDB (Dexie) | `client-app/` |
| Portal administrativo | React + Vite | `admin-portal/` |
| API Gateway | Nginx | `deploy/nginx/` |

## Como rodar

**Servidor Ubuntu (instalação completa):**
```bash
sudo ./scripts/install_vm.sh             # dependências, build, Nginx e systemd
sudo ./scripts/install_vm.sh --reset-db  # recria o banco com os dados de exemplo
```
Portal em `http://SERVIDOR/admin/` e app em `http://SERVIDOR/app/`. Desenvolvimento local: [docs/06_DEPLOY_VM.md](docs/06_DEPLOY_VM.md) §6.6.

**Testes:**
```bash
cd client-app && PGPASSWORD=medicalfield MF_API_URL=http://localhost/api npm run test:e2e   # fluxo completo
npx newman run postman/MedicalField.postman_collection.json --env-var baseUrl=http://localhost/api  # 33 requisições
```

### Acessos dos dados de exemplo

Válidos apenas com o seed (`database/02_seed.sql`). Troque as senhas antes de qualquer uso real.

| Uso | Tipo | Registro | Senha |
|---|---|---|---|
| Portal administrativo | ADM | `admin` | `senha123` |
| App da equipe | CRM | `12345` | `senha123` |
| App da equipe | COREN | `54321` | `senha123` |
| App da equipe | SOC | `SOC-0001` | `senha123` |

## Documentação

| Assunto | Documento |
|---|---|
| Requisitos × evidências (onde cada exigência foi atendida) | [docs/00_REQUISITOS_E_EVIDENCIAS.md](docs/00_REQUISITOS_E_EVIDENCIAS.md) |
| Arquitetura e tecnologias | [docs/01_ARQUITETURA.md](docs/01_ARQUITETURA.md) |
| APIs | [docs/02_API.md](docs/02_API.md) · [coleção Postman](postman/MedicalField.postman_collection.json) |
| Bancos de dados (central e local) | [docs/03_BANCO_DE_DADOS.md](docs/03_BANCO_DE_DADOS.md) |
| Padrões de projeto | [docs/04_PADROES_DE_PROJETO.md](docs/04_PADROES_DE_PROJETO.md) |
| Roteiro de testes | [docs/05_ROTEIRO_DE_TESTES.md](docs/05_ROTEIRO_DE_TESTES.md) |
| Implantação | [docs/06_DEPLOY_VM.md](docs/06_DEPLOY_VM.md) |

---

<sub>Desenvolvido como trabalho final de Arquiteturas de Software (Univates, 2026/B). A matriz de requisitos do enunciado está em <a href="docs/00_REQUISITOS_E_EVIDENCIAS.md">docs/00</a>.</sub>
