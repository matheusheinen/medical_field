import { useState } from 'react';
import { fmt } from '../api';
import { Alerta, CabecalhoPagina, LinhaVazia, useDados } from '../ui/componentes';

const SERVICOS = ['auth-service', 'clinical-service', 'document-service', 'client-app'];

export default function Logs() {
  const { dados, erro, carregar, carregando, quando } = useDados(['/log?limite=500']);
  const [servico, setServico] = useState('');
  const [somenteErros, setSomenteErros] = useState(false);
  const lista = (dados?.[0] ?? [])
    .filter((l) => !servico || l.servico === servico)
    .filter((l) => !somenteErros || l.statusCode >= 400);

  return (
    <>
      <CabecalhoPagina titulo="Logs de acesso" descricao="Toda requisição recebida pelos serviços, inclusive as recusadas, e as operações feitas sem conexão nos dispositivos."
                       carregar={carregar} carregando={carregando} quando={quando}>
        <select value={servico} onChange={(e) => setServico(e.target.value)} aria-label="Serviço">
          <option value="">Todos os serviços</option>
          {SERVICOS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="alternar"><input type="checkbox" checked={somenteErros} onChange={(e) => setSomenteErros(e.target.checked)} /> Só erros</label>
      </CabecalhoPagina>
      <Alerta tipo="erro">{erro}</Alerta>
      <section className="painel painel-tabela">
        <div className="tabela-rolagem">
          <table className="tabela-compacta">
            <thead><tr><th>Data/hora</th><th>Serviço</th><th>IP</th><th>Profissional</th><th>Requisição</th><th className="num">Status</th><th className="num">Tempo</th><th>Origem</th></tr></thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{fmt(l.dataHora)}</td>
                  <td>{l.servico}</td>
                  <td className="mono">{l.ipCliente}</td>
                  <td>{l.registro ?? <span className="suave">anônimo</span>}</td>
                  <td className="mono rota"><strong>{l.metodo}</strong> {l.rota}</td>
                  <td className="num"><span className={`status status-${String(l.statusCode)[0]}xx`}>{l.statusCode}</span></td>
                  <td className="num nowrap">{l.tempoMs} ms</td>
                  <td>{l.origem === 'CLIENTE_OFFLINE'
                    ? <span className="selo selo-aviso">Dispositivo offline</span>
                    : <span className="suave">Servidor</span>}</td>
                </tr>
              ))}
              {!lista.length && <LinhaVazia colunas={8} carregando={carregando}>Nenhum acesso registrado.</LinhaVazia>}
            </tbody>
          </table>
        </div>
        <p className="rodape-tabela">{lista.length} acesso(s) exibidos (últimos 500)</p>
      </section>
    </>
  );
}
