import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Icone from './Icone';

/** Carrega uma ou mais rotas da API em paralelo. Retorna { dados, erro, carregar, carregando, quando }. */
export function useDados(caminhos) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [quando, setQuando] = useState(null);
  const chave = caminhos.join('|');
  const carregar = useCallback(async () => {
    setErro(null);
    setCarregando(true);
    try {
      setDados(await Promise.all(caminhos.map((c) => api(c))));
      setQuando(new Date());
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => { carregar(); }, [carregar]);
  return { dados, erro, carregar, carregando, quando };
}

/** Título da página, descrição e ações (botões/filtros). */
export function CabecalhoPagina({ titulo, descricao, carregar, carregando, quando, children }) {
  return (
    <header className="cabecalho-pagina">
      <div>
        <h1>{titulo}</h1>
        {descricao && <p>{descricao}</p>}
      </div>
      <div className="acoes">
        {children}
        {carregar && (
          <button className="btn btn-secundario" onClick={carregar} disabled={carregando}
                  title={quando ? `Atualizado às ${quando.toLocaleTimeString('pt-BR')}` : undefined}>
            <Icone nome="atualizar" className={carregando ? 'girando' : ''} /> Atualizar
          </button>
        )}
      </div>
    </header>
  );
}

export function Alerta({ tipo = 'info', children, aoFechar }) {
  if (!children) return null;
  const icone = { erro: 'alerta', sucesso: 'check', aviso: 'alerta', info: 'nuvem' }[tipo];
  return (
    <div className={`alerta alerta-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <Icone nome={icone} />
      <div>{children}</div>
      {aoFechar && <button className="btn-icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" tamanho={16} /></button>}
    </div>
  );
}

/** Estado vazio de uma tabela. */
export function LinhaVazia({ colunas, children, carregando }) {
  return (
    <tr><td colSpan={colunas} className="vazio">{carregando ? 'Carregando…' : children}</td></tr>
  );
}

export function CampoBusca({ valor, aoMudar, placeholder = 'Buscar…' }) {
  return (
    <label className="busca">
      <Icone nome="busca" tamanho={16} />
      <input value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

const modaisAbertos = [];   // pilha: o Esc fecha só o modal do topo

export function Modal({ titulo, subtitulo, largura = 'media', aoFechar, children, rodape }) {
  useEffect(() => {
    const eu = {};
    modaisAbertos.push(eu);
    const esc = (e) => e.key === 'Escape' && modaisAbertos.at(-1) === eu && aoFechar();
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); modaisAbertos.splice(modaisAbertos.indexOf(eu), 1); };
  }, [aoFechar]);
  return (
    <div className="modal-fundo" onMouseDown={aoFechar}>
      <div className={`modal modal-${largura}`} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-cabecalho">
          <div><h2>{titulo}</h2>{subtitulo && <p>{subtitulo}</p>}</div>
          <button className="btn-icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </header>
        <div className="modal-corpo">{children}</div>
        {rodape && <footer className="modal-rodape">{rodape}</footer>}
      </div>
    </div>
  );
}

/** Campo de formulário com rótulo. `largo` ocupa a linha inteira. */
export function Campo({ rotulo, dica, largo, obrigatorio, children }) {
  return (
    <label className={`campo ${largo ? 'campo-largo' : ''}`}>
      <span className="campo-rotulo">{rotulo}{obrigatorio && <em> *</em>}</span>
      {children}
      {dica && <small className="campo-dica">{dica}</small>}
    </label>
  );
}

// ------------------------------------------------------------------ selos

export const Triagem = ({ cor }) => (cor ? <span className={`triagem triagem-${cor.toLowerCase()}`}>{cor}</span> : <span className="suave">—</span>);

export const Ativo = ({ ativo }) => (
  <span className={`selo ${ativo ? 'selo-sucesso' : 'selo-neutro'}`}>{ativo ? 'Ativo' : 'Inativo'}</span>
);

const CORES_OPERACAO = {
  INSERT: 'selo-sucesso', UPDATE: 'selo-info', UPDATE_SENHA: 'selo-info', CONFLITO: 'selo-roxo', INATIVACAO: 'selo-neutro',
  CRIADO: 'selo-sucesso', ATUALIZADO: 'selo-info', SEM_ALTERACAO: 'selo-neutro', DUPLICADO: 'selo-neutro', CONFLITO_RESOLVIDO: 'selo-roxo',
};
const ROTULOS_OPERACAO = {
  INSERT: 'Criação', UPDATE: 'Alteração', UPDATE_SENHA: 'Senha redefinida', CONFLITO: 'Conflito resolvido', INATIVACAO: 'Inativação',
};
export const Operacao = ({ valor }) => (
  <span className={`selo ${CORES_OPERACAO[valor] ?? 'selo-neutro'}`}>{ROTULOS_OPERACAO[valor] ?? valor}</span>
);
