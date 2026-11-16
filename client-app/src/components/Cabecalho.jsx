import { useState } from 'react';
import { connectivity } from '../net/ConnectivityMonitor';
import { syncManager } from '../sync/SyncManager';
import { sessao } from '../services/sessao';
import { pendenciasLocais, sair } from '../services/AtendimentoService';
import { useConectividade, useSync } from '../hooks';
import Icone from './Icone';

export default function Cabecalho({ s, pendentes, aoReautenticar, aoVerSincronizacao }) {
  const { online, simulado, rede } = useConectividade();
  const sync = useSync();
  const [saida, setSaida] = useState(null);   // pendências mostradas no diálogo de saída
  const profissional = s.profissional;
  const tokenValido = sessao.tokenValido(s);

  const executar = (fn) => fn().catch(() => {}); // o erro já aparece na barra de status

  async function pedirSaida() {
    const p = await pendenciasLocais();
    // Sem conexão não dá para entrar de novo: mesmo sem pendências, pede confirmação
    if (p.total || !online) setSaida(p);
    else await sair();
  }

  let status;
  if (sync.sincronizando) status = { tipo: 'andamento', icone: 'sincronizar', texto: `${sync.mensagem}…` };
  else if (!tokenValido) status = { tipo: 'erro', icone: 'cadeado', texto: 'Sessão expirada: o app continua funcionando, mas é preciso entrar de novo para sincronizar.' };
  else if (sync.erro) status = { tipo: 'erro', icone: 'alerta', texto: sync.erro };
  else if (!online) status = { tipo: 'offline', icone: 'semSinal', texto: 'Sem conexão: os registros ficam no dispositivo e são enviados quando a conexão voltar.' };
  else if (sync.mensagem) status = { tipo: 'ok', icone: 'check', texto: sync.mensagem };
  else status = { tipo: 'ok', icone: 'nuvem', texto: 'Conectado ao servidor central.' };

  return (
    <header className="cabecalho">
      <div className="topo">
        <div className="marca">
          <img src="/app/icon.svg" alt="" width="34" height="34" />
          <div>
            <strong>MedicalField</strong>
            <span className="sub">{profissional.nome} · {profissional.tipoRegistro} {profissional.registro}</span>
          </div>
        </div>

        {/* Chave "Simular conectividade": corta a rede do app para demonstrar o modo offline */}
        <div className={`simulador ${online ? 'on' : 'off'}`}>
          <Icone nome={online ? 'sinal' : 'semSinal'} />
          <div className="simulador-texto">
            <strong>{online ? 'Online' : 'Offline'}</strong>
            <span>{!rede ? 'sem rede no aparelho' : 'Simular conectividade'}</span>
          </div>
          <button role="switch" aria-checked={simulado} aria-label="Simular conectividade (online/offline)" className="chave"
                  onClick={() => connectivity.definirSimulado(!simulado)}>
            <span className="bolinha" />
          </button>
        </div>

        <div className="acoes-topo">
          {tokenValido ? (
            <>
              <button onClick={() => executar(() => syncManager.receberDados())} disabled={!online || sync.sincronizando}
                      title="Baixa do servidor central os cadastros e atendimentos novos">
                <Icone nome="baixar" /> Receber dados
              </button>
              <button className="primario" onClick={() => executar(() => syncManager.sincronizar())} disabled={!online || sync.sincronizando}
                      title="Envia os registros pendentes e recebe as novidades do servidor">
                <Icone nome="sincronizar" className={sync.sincronizando ? 'girando' : ''} /> Sincronizar
                {pendentes > 0 && <span className="contador">{pendentes}</span>}
              </button>
            </>
          ) : (
            <button className="primario" onClick={aoReautenticar} disabled={!online} title="Renova a sessão para voltar a sincronizar">
              <Icone nome="cadeado" /> Entrar novamente
              {pendentes > 0 && <span className="contador">{pendentes}</span>}
            </button>
          )}
          <button className="discreto" onClick={pedirSaida} title="Sair" aria-label="Sair"><Icone nome="sair" /></button>
        </div>
      </div>

      <div className={`barra-status ${status.tipo}`} role="status">
        <span className="barra-texto"><Icone nome={status.icone} tamanho={16} className={status.tipo === 'andamento' ? 'girando' : ''} /> {status.texto}</span>
        <span className="pendentes">{pendentes ? `${pendentes} registro(s) aguardando envio` : 'Tudo sincronizado'}</span>
      </div>

      {saida && (
        <DialogoSaida p={saida} conectado={online} podeSincronizar={online && tokenValido} aoFechar={() => setSaida(null)}
                      aoVerSincronizacao={() => { setSaida(null); aoVerSincronizacao(); }} />
      )}
    </header>
  );
}

/**
 * Sair apaga os dados do aparelho. Por isso, com registros ainda não enviados a saída é
 * bloqueada (só sincronizando); os recusados pelo servidor podem ser descartados com confirmação.
 * Sem conexão, avisa que entrar de novo só será possível quando a conexão voltar.
 */
function DialogoSaida({ p: inicial, conectado, podeSincronizar, aoFechar, aoVerSincronizacao }) {
  const [p, setP] = useState(inicial);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const bloqueado = p.naFila > 0 || p.logs > 0;
  const avisoSemConexao = (
    <p>
      <b>Você está sem conexão.</b> Para entrar de novo é preciso conexão com o servidor: se sair agora,
      o app fica bloqueado até a conexão voltar.
    </p>
  );

  if (!p.total) {
    return (
      <div className="dialogo-fundo" role="presentation" onClick={aoFechar}>
        <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-saida" onClick={(e) => e.stopPropagation()}>
          <h2 id="titulo-saida"><Icone nome="semSinal" /> Sair sem conexão?</h2>
          {avisoSemConexao}
          <div className="dialogo-acoes">
            <button onClick={() => sair()}>Sair mesmo assim</button>
            <button className="primario" onClick={aoFechar} autoFocus>Continuar no app</button>
          </div>
        </div>
      </div>
    );
  }

  async function sincronizarESair() {
    setOcupado(true);
    setErro(null);
    try {
      await syncManager.sincronizar('Sincronizar antes de sair');
      await sair();
    } catch (e) {
      setErro(e.message);
      setP(await pendenciasLocais());   // pode ter sobrado só o que o servidor recusou
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="dialogo-fundo" role="presentation" onClick={aoFechar}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-saida" onClick={(e) => e.stopPropagation()}>
        <h2 id="titulo-saida"><Icone nome="alerta" /> Ainda há dados só neste aparelho</h2>
        {bloqueado ? (
          <p>
            Ainda não foram enviados: {[p.naFila && `${p.naFila} registro(s)`, p.logs && `${p.logs} log(s) de operações offline`].filter(Boolean).join(' e ')}.
            Ao sair, os dados do aparelho são apagados; por isso é preciso sincronizar antes.
          </p>
        ) : (
          <p>
            <b>{p.comErro}</b> registro(s) foram <b>recusados</b> pelo servidor (veja o motivo na aba Sincronização).
            Se sair agora, eles serão descartados.
          </p>
        )}
        {!bloqueado && !conectado && avisoSemConexao}
        {erro && <div className="alerta erro"><Icone nome="alerta" tamanho={16} /> {erro}</div>}
        <div className="dialogo-acoes">
          <button onClick={aoFechar}>Cancelar</button>
          {p.comErro > 0 && <button onClick={aoVerSincronizacao}>Ver registros</button>}
          {bloqueado
            ? <button className="primario" onClick={sincronizarESair} disabled={!podeSincronizar || ocupado}>
                <Icone nome="sincronizar" className={ocupado ? 'girando' : ''} /> {podeSincronizar ? 'Sincronizar e sair' : conectado ? 'Entre novamente para sincronizar' : 'Sem conexão para sincronizar'}
              </button>
            : <button className="perigo" onClick={() => sair({ descartarRecusados: true })}>Descartar e sair</button>}
        </div>
      </div>
    </div>
  );
}
