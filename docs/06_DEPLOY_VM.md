# 6. Implantação na VM da Univates

> **Situação atual:** o sistema foi instalado na VM da Univates em 22/10/2026, no endereço `177.44.248.79` (portal em `http://177.44.248.79/admin/`, cliente em `http://177.44.248.79/app/`, API em `http://177.44.248.79/api`). Falta configurar o SMTP (seção 6.4). As seções abaixo documentam o procedimento para reinstalar ou atualizar.

## 6.1 Primeiro acesso à VM

Você vai receber (do professor ou do suporte) o **endereço** da VM, o **usuário** e a **senha** ou chave SSH. Em muitas instituições a VM só é acessível pela rede interna ou por VPN; confirme isso.

```bash
# No seu computador (Windows: PowerShell ou Terminal; Linux/Mac: terminal)
ssh usuario@ENDERECO-DA-VM
# se a porta SSH não for a 22:
ssh -p PORTA usuario@ENDERECO-DA-VM
```

Já dentro da VM, rode estes comandos e guarde a saída (ajudam a diagnosticar qualquer problema):

```bash
lsb_release -a                 # versão do Ubuntu (22.04 ou 24.04 são suportadas)
sudo -v && echo "tenho sudo"   # precisa de sudo para instalar pacotes
hostname -I                    # IP da VM (para acessar /admin e /app)
psql --version; systemctl is-active postgresql   # PostgreSQL já instalado?
df -h / ; free -h              # espaço em disco e memória (recomendado: 2 GB RAM, 5 GB livres)
curl -sI https://registry.npmjs.org | head -1    # a VM tem acesso à internet?
sudo ss -tlnp | grep -E ':80 |:5432 '            # algo já usa a porta 80?
```

> Se a porta 80 estiver bloqueada ou ocupada, troque `listen 80` por outra (ex.: `listen 8088`) em `deploy/nginx/medicalfield.conf` e acesse `http://IP:8088/admin/`.

## 6.2 Enviar o projeto para a VM

**Opção 1 – Git (recomendado):** crie um repositório no GitHub (pode ser privado) e, na VM:
```bash
git clone https://github.com/SEU_USUARIO/medicalfield.git
cd medicalfield
```
**Opção 2 – Cópia direta** do seu computador:
```bash
scp medicalfield.zip usuario@ENDERECO-DA-VM:~
ssh usuario@ENDERECO-DA-VM
sudo apt install -y unzip && unzip medicalfield.zip && cd medicalfield
```

## 6.3 Instalação automática

```bash
chmod +x scripts/*.sh
sudo ./scripts/install_vm.sh
```
O script (pode ser executado de novo sem problemas):
1. instala PostgreSQL, Nginx, Java 21 + Maven, Python 3 e Node.js 22;
2. copia o projeto para `/opt/medicalfield` e cria o `.env` com um `JWT_SECRET` aleatório (obrigatório: sem ele, ou com o valor de exemplo antigo, os serviços não sobem; um `.env` antigo é corrigido automaticamente);
3. cria o usuário/banco `medicalfield` e carrega `01_schema.sql` + `02_seed.sql` (só se o banco estiver vazio);
4. compila os três serviços (`npm ci && tsc`, `mvn package`, `pip install`);
5. gera as interfaces (`npm run build`) e publica em `/var/www/medicalfield`;
6. configura o Nginx e cria três serviços **systemd** (sobem sozinhos quando a VM reinicia).

No fim, ele mostra os endereços:
```
Portal administrativo: http://IP/admin/   (admin / senha123)
Aplicação cliente:     http://IP/app/     (CRM 12345 / senha123)
API (Postman):         http://IP/api/...
```

Para atualizar depois de mudar o código: `git pull && sudo ./scripts/install_vm.sh`.
Para zerar os dados antes da apresentação: `sudo ./scripts/install_vm.sh --reset-db`.

## 6.4 Configurar o envio real de e-mail (passo 17)

Sem SMTP, os e-mails são gravados como `.eml` em `/opt/medicalfield/services/document-service/emails_enviados/` (abrem no Outlook/Thunderbird com o PDF anexo). Para enviar de verdade com o Gmail:

1. Na conta Google: **Segurança → Verificação em duas etapas** (ativar) → **Senhas de app** → criar uma senha para "MedicalField" (16 letras).
2. Editar `sudo nano /opt/medicalfield/.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=seu.email@gmail.com
   SMTP_PASSWORD=abcdefghijklmnop
   EMAIL_FROM="MedicalField <seu.email@gmail.com>"
   ```
3. `sudo systemctl restart medicalfield-document`

Alternativa sem conta real: [Mailtrap](https://mailtrap.io) (sandbox gratuita): copie host, porta, usuário e senha para o `.env`; os e-mails aparecem na caixa do Mailtrap, ótimo para mostrar na apresentação.

## 6.5 Operação e diagnóstico

| Ação | Comando |
|---|---|
| Ver status | `systemctl status medicalfield-auth medicalfield-clinical medicalfield-document` |
| Logs ao vivo (inclui os logs de acesso) | `journalctl -u medicalfield-clinical -f` (troque por `-auth` / `-document`) |
| Reiniciar um serviço | `sudo systemctl restart medicalfield-clinical` |
| Logs de acesso no banco | `psql -h localhost -U medicalfield -d medicalfield -c "SELECT servico, data_hora, ip_cliente, registro, metodo, rota, status_code, tempo_ms FROM log_acesso ORDER BY id DESC LIMIT 20;"` |
| Testar o gateway | `curl -s -X POST http://localhost/api/auth/login -H 'Content-Type: application/json' -d '{"tipoRegistro":"CRM","registro":"12345","senha":"senha123"}'` |
| Erro 502 no navegador | O serviço por trás está parado: ver `systemctl status` e `journalctl` |
| Nginx | `sudo nginx -t && sudo systemctl reload nginx`; logs em `/var/log/nginx/error.log` |

## 6.6 Desenvolvimento no seu computador

```bash
# PostgreSQL local com o banco "medicalfield" (usuário/senha medicalfield)
psql -U medicalfield -d medicalfield -f database/01_schema.sql -f database/02_seed.sql

cd services/auth-service && npm install && npx tsc && cd ../..
cd services/clinical-service && mvn package && cd ../..
cd services/document-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ../..
./scripts/dev-start.sh            # sobe os 3 serviços (logs em ./logs)

cd client-app && npm install && npm run dev     # http://localhost:5173/app/
cd admin-portal && npm install && npm run dev   # http://localhost:5174/admin/
```
O Vite faz o papel do gateway em desenvolvimento (proxy `/api` para as portas 3001/8080/8000). Na primeira execução, o `dev-start.sh` cria o `.env` a partir do `.env.example` e gera o `JWT_SECRET` (sem ele os serviços não sobem). O `mvn package` também roda os testes unitários das Strategies.

### Rodar o cliente no notebook apontando para a VM (PWA completo)

Útil para demonstrar o app **abrindo sem rede** (o Service Worker exige HTTPS ou `localhost`):
```bash
cd client-app && npm run build
VITE_PROXY_TARGET=http://IP-DA-VM npm run preview   # http://localhost:4173/app/
```
Com o app aberto, desligue o Wi-Fi do notebook: o indicador muda para OFFLINE pela rede real, e mesmo recarregando a página o app continua funcionando.
