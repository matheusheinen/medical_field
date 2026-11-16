import { useState } from 'react';
import { api, sessao } from '../api';
import Icone from '../ui/Icone';
import { Alerta } from '../ui/componentes';

export default function Login({ aoEntrar }) {
  const [registro, setRegistro] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { tipoRegistro: 'ADM', registro, senha } });
      if (r.profissional.perfil !== 'ADMIN') throw new Error('Acesso restrito a administradores.');
      sessao.salvar(r);
      aoEntrar(r);
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="login">
      <section className="login-apresentacao">
        <img src="/admin/icon.svg" width="48" height="48" alt="" />
        <h1>MedicalField</h1>
        <p>Portal administrativo do prontuário de emergência pré-hospitalar.</p>
        <ul>
          <li><Icone nome="ambulancia" /> Atendimentos recebidos das equipes em campo, inclusive os registrados sem sinal</li>
          <li><Icone nome="escudo" /> Trilha de auditoria de cada alteração e log de todos os acessos</li>
          <li><Icone nome="documento" /> Ficha de atendimento em PDF e envio por e-mail ao paciente ou familiar</li>
        </ul>
      </section>
      <form className="login-cartao" onSubmit={entrar}>
        <h2>Acesso administrativo</h2>
        <p className="suave">Entre com seu usuário de administrador.</p>
        <label className="campo">
          <span className="campo-rotulo">Usuário</span>
          <input value={registro} onChange={(e) => setRegistro(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Senha</span>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        </label>
        <Alerta tipo="erro">{erro}</Alerta>
        <button className="btn btn-primario btn-bloco" disabled={entrando}>
          <Icone nome="cadeado" /> {entrando ? 'Entrando…' : 'Entrar'}
        </button>
        <small className="suave centro">Acesso registrado para fins de auditoria (LGPD).</small>
      </form>
    </div>
  );
}
