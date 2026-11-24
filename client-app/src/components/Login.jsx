import { useState } from 'react';
import { login, iniciarSessao } from '../services/AtendimentoService';
import { connectivity } from '../net/ConnectivityMonitor';
import { syncManager } from '../sync/SyncManager';
import { useConectividade } from '../hooks';
import Icone from './Icone';

const TIPOS = [['CRM', 'CRM'], ['COREN', 'COREN'], ['SOC', 'ID Socorrista']];

/**
 * Primeiro acesso no aparelho ou, com `reautenticar`, renovação do token vencido:
 * nesse caso o profissional é o mesmo da sessão e só a senha é pedida.
 */
export default function Login({ reautenticar = null, aoCancelar }) {
  const [tipo, setTipo] = useState(reautenticar?.tipoRegistro ?? 'CRM');
  const [registro, setRegistro] = useState(reautenticar?.registro ?? '');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const { online } = useConectividade();

  async function entrar(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const r = await login(tipo, registro, senha);
      if (r.profissional.perfil === 'ADMIN') {
        throw new Error('Administradores devem usar o portal administrativo.');
      }
      await iniciarSessao(r);
      if (reautenticar) {
        aoCancelar?.();
        syncManager.sincronizar('Sessão renovada').catch(() => {});
      } else {
        // primeira carga: medicamentos, pacientes e atendimentos do servidor central
        syncManager.receberDados('Carga inicial').catch(() => {});
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-fundo">
      <form className="login-cartao" onSubmit={entrar}>
        <div className="marca">
          <img src="/app/icon.svg" alt="" width="46" height="46" />
          <div>
            <h1>MedicalField</h1>
            <p>Registro de atendimento pré-hospitalar</p>
          </div>
        </div>

        {reautenticar ? (
          <div className="alerta aviso">
            <Icone nome="cadeado" tamanho={16} />
            <span>A sessão de <b>{reautenticar.nome}</b> ({reautenticar.tipoRegistro} {reautenticar.registro}) expirou.
              Digite a senha para voltar a sincronizar; nada do que está no aparelho foi perdido.</span>
          </div>
        ) : (
          <>
            <fieldset className="segmentado" aria-label="Tipo de credencial">
              {TIPOS.map(([v, r]) => (
                <label key={v} className={tipo === v ? 'ativo' : ''}>
                  <input type="radio" name="tipo" value={v} checked={tipo === v} onChange={() => setTipo(v)} /> {r}
                </label>
              ))}
            </fieldset>
            <label>Número do registro
              <input value={registro} onChange={(e) => setRegistro(e.target.value)} autoComplete="username" required autoFocus />
            </label>
          </>
        )}
        <label>Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required autoFocus={!!reautenticar} />
        </label>

        {erro && <div className="alerta erro"><Icone nome="alerta" tamanho={16} /> {erro}</div>}
        {!online && (
          <div className="alerta aviso">
            <Icone nome="semSinal" tamanho={16} />
            <span>{reautenticar ? 'Para renovar a sessão é preciso conexão.' : 'Entrar precisa de conexão; depois o app funciona offline até você sair.'}{' '}
              <button type="button" className="link" onClick={() => connectivity.ligarChave(true)}>Voltar ao modo online</button>
            </span>
          </div>
        )}
        <button className="primario grande" disabled={carregando || !online}>{carregando ? 'Entrando…' : 'Entrar'}</button>
        {reautenticar
          ? <button type="button" className="discreto" onClick={aoCancelar}>Continuar sem sincronizar</button>
          : <p className="dica centro">Depois de entrar, o app funciona mesmo sem sinal.</p>}
      </form>
    </div>
  );
}
