/**
 * Teste ponta a ponta do fluxo offline-first (as 17 etapas de docs/05_ROTEIRO_DE_TESTES.md) usando o CÓDIGO REAL
 * do app cliente (IndexedDB/Dexie, Outbox, Commands, Observer, SyncManager)
 * contra os microsserviços, passando pelo gateway Nginx.
 *
 *   cd client-app
 *   MF_API_URL=http://localhost/api MF_DB_PSQL="psql -h localhost -U medicalfield -d medicalfield" npm run test:e2e
 *
 * Requer: serviços no ar, banco com os dados iniciais (02_seed.sql) e PGPASSWORD definido para o passo 9.
 */
import 'fake-indexeddb/auto';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------- ambiente de navegador mínimo
const armazenamento = new Map();
globalThis.localStorage = {
  getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
  setItem: (k, v) => armazenamento.set(k, String(v)),
  removeItem: (k) => armazenamento.delete(k),
};
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.MF_API_URL = process.env.MF_API_URL ?? 'http://localhost/api';
const API = globalThis.MF_API_URL;

const { connectivity } = await import('../src/net/ConnectivityMonitor.js');
const { sessao } = await import('../src/services/sessao.js');
const { syncManager } = await import('../src/sync/SyncManager.js');
const { registrarOcorrencia, login, iniciarSessao, sair } = await import('../src/services/AtendimentoService.js');
const { LocalRepository: local } = await import('../src/repositories/LocalRepository.js');
const { RemoteRepository: remoto } = await import('../src/repositories/RemoteRepository.js');
const { OfflineError, SessaoExpiradaError } = await import('../src/net/apiClient.js');
const { db } = await import('../src/db/localDb.js');

// ---------------------------------------------------------------- utilitários do teste
let falhas = 0;
const ok = (cond, msg) => { console.log(`   ${cond ? '✔' : '✘'} ${msg}`); if (!cond) falhas++; };
const passo = (n, t) => console.log(`\n${String(n).padStart(2)}. ${t}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let tokenPortal;
async function portal(caminho, opcoes = {}) {
  const r = await fetch(API + caminho, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(tokenPortal && { Authorization: `Bearer ${tokenPortal}` }), ...opcoes.headers },
  });
  return { status: r.status, corpo: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() };
}

// ================================================================= ROTEIRO
passo(1, 'Portal: autenticar');
const semToken = await portal('/atendimento');
ok(semToken.status === 401, `rota sem token é recusada (${semToken.status})`);
const lp = await portal('/auth/login', { method: 'POST', body: JSON.stringify({ tipoRegistro: 'ADM', registro: 'admin', senha: 'senha123' }) });
tokenPortal = lp.corpo.token;
ok(lp.status === 200 && lp.corpo.profissional.perfil === 'ADMIN', 'login do administrador retorna token');

passo(2, 'Portal: listar cadastros');
const pessoas0 = (await portal('/pessoa')).corpo;
const meds0 = (await portal('/medicamento')).corpo;
const profs = (await portal('/auth/profissional')).corpo;
ok(pessoas0.length >= 2 && meds0.length >= 7 && profs.length >= 4, `${pessoas0.length} pessoas, ${meds0.length} medicamentos, ${profs.length} profissionais`);

passo(3, 'Portal: listar prontuários');
const pront0 = (await portal('/prontuario')).corpo;
ok(pront0.length >= 2, `${pront0.length} prontuários`);

passo(4, 'Portal: listar atendimentos');
const at0 = (await portal('/atendimento')).corpo;
ok(at0.length >= 1, `${at0.length} atendimento(s)`);

passo(5, 'Cliente: autenticar (CRM 12345)');
const sess = await login('CRM', '12345', 'senha123');
sessao.salvar(sess);
ok(!!sessao.obter()?.token, `sessão salva no dispositivo para ${sess.profissional.nome}`);

passo(6, 'Cliente: receber dados do portal');
const r6 = await syncManager.receberDados();
ok((await db.medicamentos.count()) === meds0.length, `medicamentos locais = ${await db.medicamentos.count()}`);
ok((await db.pessoas.count()) === pessoas0.length, `pessoas locais = ${await db.pessoas.count()}`);
ok((await db.atendimentos.count()) === at0.length, `atendimentos locais = ${await db.atendimentos.count()}`);

passo(7, 'Cliente ONLINE: registrar atendimento (paciente existente João da Silva)');
const joao = (await local.listarPessoas()).find((p) => p.nome === 'João da Silva');
const prJoao = await local.prontuarioDaPessoa(joao.id);
const adrenalina = (await local.listarMedicamentos()).find((m) => m.nome === 'Adrenalina');
const r7 = await registrarOcorrencia({
  pessoa: joao, prontuario: prJoao, profissionalId: sess.profissional.id,
  atendimento: {
    dataHora: new Date().toISOString(), localOcorrencia: 'Av. Independência, 1000 - Santa Cruz do Sul', queixaPrincipal: 'Reação alérgica',
    paSistolica: 90, paDiastolica: 60, freqCardiaca: 120, saturacaoO2: 92, glasgowOcular: 4, glasgowVerbal: 5, glasgowMotora: 6, glasgowTotal: 15,
    triagemManchester: 'LARANJA', medicamentos: [{ medicamentoId: adrenalina.id, dose: 0.5, unidade: 'mg', via: 'IM' }],
  },
});
ok(r7.online && r7.envio?.enviados >= 1 && (await db.outbox.count()) === 0, `enviado na hora (outbox vazia; ${JSON.stringify(r7.envio.porStatus)})`);

passo(8, 'Portal: listar atendimentos — o registrado online aparece');
const at8 = (await portal('/atendimento')).corpo;
ok(at8.some((a) => a.id === r7.atendimentoId), `atendimento ${r7.atendimentoId.slice(0, 8)} presente (${at8.length} no total)`);

passo(9, 'Portal: inserir novos medicamentos via banco de dados');
execSync(`${process.env.MF_DB_PSQL ?? 'psql -h localhost -U medicalfield -d medicalfield'} -q -f ../database/03_novos_medicamentos.sql`, { stdio: 'ignore' });
const meds9 = (await portal('/medicamento')).corpo;
ok(meds9.length === meds0.length + 3, `${meds9.length} medicamentos no servidor`);

passo(10, 'Portal: listar atendimentos');
ok((await portal('/atendimento')).corpo.length === at8.length, 'lista consistente');

passo(11, 'Cliente: receber dados do portal (novos medicamentos)');
await esperar(50);
const r11 = await syncManager.receberDados();
ok(r11.recebidos.medicamentos >= 3 && (await db.medicamentos.count()) === meds9.length, `recebidos ${r11.recebidos.medicamentos} medicamento(s) (incremental); locais = ${await db.medicamentos.count()}`);

passo(12, 'Cliente OFFLINE: registrar ocorrência (nova pessoa + prontuário + atendimento)');
connectivity.ligarChave(false);
let bloqueado = false;
try { await remoto.pull(); } catch (e) { bloqueado = e instanceof OfflineError; }
ok(bloqueado, 'com o simulador OFFLINE nenhuma requisição sai do dispositivo');
const morfina = (await local.listarMedicamentos()).find((m) => m.nome === 'Morfina');
const r12 = await registrarOcorrencia({
  pessoa: { nome: 'Maria Offline Teste', cpf: '111.222.333-44', sexo: 'F', email: 'maria.offline@example.com', contatoEmergenciaEmail: 'familia.maria@example.com' },
  prontuario: { tipoSanguineo: 'B+', alergias: 'Látex' },
  profissionalId: sess.profissional.id,
  atendimento: {
    dataHora: new Date().toISOString(), localOcorrencia: 'BR-471, km 120 (sem sinal)', queixaPrincipal: 'Fratura exposta em MID',
    freqCardiaca: 105, glasgowOcular: 4, glasgowVerbal: 4, glasgowMotora: 6, glasgowTotal: 14, triagemManchester: 'VERMELHO', triagemStart: 'AMARELO',
    medicamentos: [{ medicamentoId: morfina.id, dose: 4, unidade: 'mg', via: 'IV' }],
  },
});
const outbox12 = await local.listarOutbox();
ok(!r12.online && outbox12.length === 3, `gravado localmente; Outbox = ${outbox12.map((o) => o.entidade).join(' → ')}`);
ok((await db.logs.filter((l) => !l.enviado).count()) === 3, '3 logs locais aguardando POST /log');

passo(13, 'Portal: listar prontuários e atendimentos — o novo cadastro NÃO aparece');
ok(!(await portal('/prontuario')).corpo.some((p) => p.pessoaId === r12.pessoaId), 'prontuário ausente no portal');
ok(!(await portal('/atendimento')).corpo.some((a) => a.id === r12.atendimentoId), 'atendimento ausente no portal');

passo(14, 'Cliente ONLINE: o Observer dispara a sincronização automaticamente');
connectivity.ligarChave(true);         // nenhum outro comando: quem sincroniza é o observer
for (let i = 0; i < 50 && ((await db.outbox.count()) > 0 || syncManager.estado.sincronizando); i++) await esperar(100);
ok((await db.outbox.count()) === 0, `Outbox esvaziada — ${syncManager.estado.mensagem}`);
ok((await db.atendimentos.get(r12.atendimentoId)).syncStatus === 'SINCRONIZADO', 'registro local marcado como SINCRONIZADO');

passo(15, 'Portal: listar prontuários e atendimentos — o novo cadastro APARECE');
const at15 = (await portal('/atendimento')).corpo.find((a) => a.id === r12.atendimentoId);
ok(!!at15 && at15.criadoOffline === true, 'atendimento presente e marcado como criado offline');
ok((await portal('/prontuario')).corpo.some((p) => p.pessoaId === r12.pessoaId), 'prontuário presente');
const logs15 = (await portal('/log?limite=500')).corpo.filter((l) => l.origem === 'CLIENTE_OFFLINE' && l.dispositivoId?.startsWith('disp-'));
ok(logs15.length >= 3, `logs offline recebidos no servidor: ${logs15.length}`);

passo(16, 'Gerar a Ficha de Atendimento em PDF');
const pdf = await portal(`/documento/atendimento/${r12.atendimentoId}/pdf`);
ok(pdf.status === 200 && Buffer.from(pdf.corpo).subarray(0, 4).toString() === '%PDF', `PDF gerado (${pdf.corpo.byteLength} bytes)`);

passo(17, 'Enviar e-mail com a ficha anexada (familiar)');
const em = await portal(`/documento/atendimento/${r12.atendimentoId}/email`, { method: 'POST', body: JSON.stringify({}) });
ok(em.status === 200 && em.corpo.enviado, `enviado para ${em.corpo.destinatario} via ${em.corpo.via}`);

// ================================================================= testes extras
passo('E1', 'Idempotência: reenviar as MESMAS operações (mesmo opId) não duplica');
const ops = outbox12.map((o) => ({ opId: o.opId, entidade: o.entidade, dados: o.dados }));
const reenvio = await remoto.push('teste-reenvio', ops);
ok(reenvio.resultados.every((r) => r.status === 'DUPLICADO'), reenvio.resultados.map((r) => r.status).join(', '));
ok((await portal('/atendimento')).corpo.filter((a) => a.id === r12.atendimentoId).length === 1, 'continua existindo um único atendimento');

passo('E2', 'Conflito: prontuário editado no servidor E no dispositivo offline → Strategy MERGE');
execSync(`${process.env.MF_DB_PSQL ?? 'psql -h localhost -U medicalfield -d medicalfield'} -q -c "UPDATE prontuario SET alergias = alergias || ', AAS', versao = versao + 1, atualizado_em = now(), sincronizado_em = now() WHERE id = '${prJoao.id}'"`, { stdio: 'ignore' });
connectivity.ligarChave(false);
const prLocal = await local.prontuarioDaPessoa(joao.id);
await registrarOcorrencia({
  pessoa: joao, prontuario: { ...prLocal, alergias: `${prLocal.alergias}, Iodo` }, profissionalId: sess.profissional.id,
  atendimento: { dataHora: new Date().toISOString(), queixaPrincipal: 'Retorno - dispneia', triagemManchester: 'AMARELO' },
});
connectivity.ligarChave(true);
for (let i = 0; i < 50 && ((await db.outbox.count()) > 0 || syncManager.estado.sincronizando); i++) await esperar(100);
const hist = (await local.listarHistorico())[0];
const prFinal = (await portal(`/prontuario/${joao.id}`)).corpo;
ok(hist.conflitos?.some((c) => c.estrategia === 'MERGE'), 'servidor reportou CONFLITO_RESOLVIDO com estratégia MERGE');
ok(['AAS', 'Iodo', 'Penicilina'].every((x) => prFinal.alergias.includes(x)), `nenhuma alergia perdida: "${prFinal.alergias}"`);
const aud = (await portal(`/auditoria?entidadeId=${prJoao.id}`)).corpo;
ok(aud.some((a) => a.operacao === 'CONFLITO'), 'conflito registrado na auditoria com dados antes/depois');

passo('E6', 'Portal: cadastrar e inativar medicamento → refletido no dispositivo');
const nomeMed = `Cetamina teste ${Date.now()}`;
const novoMed = await portal('/medicamento', { method: 'POST', body: JSON.stringify({ nome: nomeMed, apresentacao: 'Frasco 50 mg/mL', viaPadrao: 'IV', doseMaxima: 100, unidade: 'mg' }) });
ok(novoMed.status === 201 && novoMed.corpo.ativo === true, `medicamento criado pelo portal (${novoMed.status})`);
await esperar(50);
await syncManager.receberDados();
ok((await local.listarMedicamentos()).some((m) => m.nome === nomeMed), 'novo medicamento disponível no dispositivo após o pull');
const inativado = await portal(`/medicamento/${novoMed.corpo.id}`, { method: 'PUT', body: JSON.stringify({ ...novoMed.corpo, ativo: false }) });
await esperar(50);
await syncManager.receberDados();
ok(inativado.corpo.ativo === false && !(await local.listarMedicamentos()).some((m) => m.nome === nomeMed), 'inativado no portal → sai da lista do dispositivo');
const semAdmin = await fetch(`${API}/medicamento`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.token}` }, body: '{"nome":"x"}' });
ok(semAdmin.status === 403, `socorrista não pode cadastrar medicamento (${semAdmin.status})`);

passo('E7', 'Portal: cadastrar e inativar profissional → perde o acesso');
const reg = `T${Date.now() % 1e8}`;
const novoProf = await portal('/auth/profissional', { method: 'POST', body: JSON.stringify({ nome: 'Profissional de Teste', tipoRegistro: 'SOC', registro: reg, uf: 'RS', senha: 'senhaForte1' }) });
ok(novoProf.status === 201 && novoProf.corpo.perfil === 'SOCORRISTA', `profissional criado (${novoProf.status})`);
const loginNovo = await portal('/auth/login', { method: 'POST', body: JSON.stringify({ tipoRegistro: 'SOC', registro: reg, senha: 'senhaForte1' }) });
ok(loginNovo.status === 200, 'consegue fazer login');
await portal(`/auth/profissional/${novoProf.corpo.id}`, { method: 'PUT', body: JSON.stringify({ nome: 'Profissional de Teste', uf: 'RS', ativo: false }) });
const loginInativo = await portal('/auth/login', { method: 'POST', body: JSON.stringify({ tipoRegistro: 'SOC', registro: reg, senha: 'senhaForte1' }) });
ok(loginInativo.status === 401, `inativado não consegue mais fazer login (${loginInativo.status})`);
const audProf = await portal(`/auditoria?entidadeId=${novoProf.corpo.id}`);
ok(audProf.corpo.some((a) => a.operacao === 'INATIVACAO') && !JSON.stringify(audProf.corpo).includes('senha'), 'auditoria registra a inativação, sem a senha');

passo('E8', 'Mesmo paciente cadastrado em dois aparelhos offline (mesmo CPF) → vinculado, sem duplicar');
const digitos = String(Date.now()).slice(-11);
const cpfOutro = digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
// "outro aparelho" já enviou o cadastro com o CPF formatado, telefone e uma alergia
const idOutro = crypto.randomUUID();
await portal('/pessoa', { method: 'POST', body: JSON.stringify({ id: idOutro, nome: 'Carla Mendes', cpf: cpfOutro, telefone: '(51) 99876-5432' }) });
await portal('/prontuario', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), pessoaId: idOutro, alergias: 'Látex' }) });
// este aparelho, offline, cadastra a mesma paciente (CPF só com dígitos) com outra alergia
connectivity.ligarChave(false);
const r8 = await registrarOcorrencia({
  pessoa: { nome: 'Carla Mendes', cpf: digitos }, prontuario: { alergias: 'Dipirona' }, profissionalId: sess.profissional.id,
  atendimento: { dataHora: new Date().toISOString(), queixaPrincipal: 'Queda de bicicleta', triagemManchester: 'VERDE' },
});
ok(r8.pessoaId !== idOutro, 'o aparelho gerou outro id para a paciente');
connectivity.ligarChave(true);
for (let i = 0; i < 50 && ((await db.outbox.count()) > 0 || syncManager.estado.sincronizando); i++) await esperar(100);
const h8 = (await local.listarHistorico())[0];
ok(h8.vinculados?.length === 2 && !h8.erros?.length, `pessoa e prontuário VINCULADOS ao cadastro existente (${JSON.stringify(h8.porStatus)})`);
const comCpf = (await portal('/pessoa')).corpo.filter((p) => String(p.cpf ?? '').replace(/\D/g, '') === digitos);
ok(comCpf.length === 1 && comCpf[0].id === idOutro && !!comCpf[0].telefone, 'uma única paciente no servidor, com o telefone do primeiro cadastro');
const pr8 = (await portal(`/prontuario/${idOutro}`)).corpo;
ok(['Látex', 'Dipirona'].every((x) => pr8.alergias?.includes(x)), `alergias mescladas: "${pr8.alergias}"`);
const at8b = await db.atendimentos.get(r8.atendimentoId);
ok(at8b?.pessoaId === idOutro && !(await db.pessoas.get(r8.pessoaId)) && !!(await db.pessoas.get(idOutro)), 'no aparelho, o id local foi trocado pelo do servidor');
ok((await portal('/atendimento')).corpo.some((a) => a.id === r8.atendimentoId && a.pessoaId === idOutro), 'atendimento gravado no cadastro existente');
ok((await portal(`/auditoria?entidadeId=${idOutro}`)).corpo.some((a) => a.operacao === 'VINCULO'), 'vínculo registrado na auditoria');

passo('E9', 'Token vencido: o app segue funcionando e só pede login para sincronizar; sair nunca perde dados');
sessao.salvar({ ...sess, expiraEm: new Date(Date.now() - 1000).toISOString() });
ok(!!sessao.obter() && !sessao.tokenValido(), 'sessão local continua aberta com o token vencido');
connectivity.ligarChave(false);
await registrarOcorrencia({
  pessoa: await local.obterPessoa(joao.id), prontuario: await local.prontuarioDaPessoa(joao.id), profissionalId: sess.profissional.id,
  atendimento: { dataHora: new Date().toISOString(), queixaPrincipal: 'Dor torácica', triagemManchester: 'LARANJA' },
});
connectivity.ligarChave(true);
let expirada = false;
try { await syncManager.sincronizar(); } catch (e) { expirada = e instanceof SessaoExpiradaError; }
ok(expirada && (await db.outbox.count()) > 0, 'sincronizar pede novo login; o atendimento continua na Outbox');
let saiu = true;
try { await sair(); } catch { saiu = false; }
ok(!saiu && !!sessao.obter(), 'sair é bloqueado enquanto há registros não enviados');
await iniciarSessao(await login('CRM', '12345', 'senha123'));
await syncManager.sincronizar('Sessão renovada');
ok(sessao.tokenValido() && (await db.outbox.count()) === 0, 'após entrar de novo, a Outbox é enviada');
await sair();
ok(!sessao.obter() && (await db.pessoas.count()) === 0 && (await db.atendimentos.count()) === 0, 'sair apaga os dados clínicos do aparelho');

console.log(`\n${falhas === 0 ? '✅ Fluxo completo sem falhas' : `❌ ${falhas} verificação(ões) falharam`}`);
process.exit(falhas ? 1 : 0);
