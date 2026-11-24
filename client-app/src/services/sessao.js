import { uuid } from '../util/uuid';

/**
 * Sessão do profissional guardada no dispositivo.
 *
 * São duas coisas diferentes:
 *  - a SESSÃO LOCAL, que libera o uso do app. Depois do primeiro login (online) ela vale até o
 *    profissional sair, mesmo sem sinal: uma equipe em campo nunca é bloqueada no meio do plantão;
 *  - o TOKEN (JWT), que só é exigido para falar com o servidor. Quando expira (12 h por padrão) ou
 *    é recusado (401), o app continua funcionando offline e pede um novo login apenas para sincronizar.
 */
const CHAVE = 'mf.sessao';
const observadores = new Set();   // Observer: quem quer saber da sessão (useSessao)

function ler(chave) { try { return localStorage.getItem(chave); } catch { return null; } }
function gravar(chave, v) { try { v === null ? localStorage.removeItem(chave) : localStorage.setItem(chave, v); } catch { /* */ } }
/** Notifica cada inscrito; um observador com erro não impede que os outros sejam notificados. */
function notificar(s) {
  observadores.forEach((f) => {
    try { f(s); } catch (e) { console.error('[sessao] observador falhou', e); }
  });
}

export const sessao = {
  /** Sessão local (independe da validade do token). */
  obter() {
    const s = ler(CHAVE);
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  },

  /** O token ainda serve para chamar o servidor? */
  tokenValido(s = this.obter()) {
    return !!s?.token && !s.tokenExpirado && new Date(s.expiraEm) > new Date();
  },

  salvar(dados) {
    const s = { ...dados, tokenExpirado: false };
    gravar(CHAVE, JSON.stringify(s));
    notificar(s);
  },

  /** O servidor recusou o token (401): mantém a sessão local, só marca que é preciso entrar de novo. */
  marcarTokenExpirado() {
    const s = this.obter();
    if (!s || s.tokenExpirado) return;
    const novo = { ...s, tokenExpirado: true };
    gravar(CHAVE, JSON.stringify(novo));
    notificar(novo);
  },

  /** Encerra a sessão local. Os dados do aparelho são limpos antes, em AtendimentoService.sair(). */
  encerrar() { gravar(CHAVE, null); notificar(null); },

  inscrever(f) { observadores.add(f); return () => observadores.delete(f); },
};

/** Identificador estável deste dispositivo (ambulância/tablet), enviado nos logs e no sync. */
export function dispositivoId() {
  let id = ler('mf.dispositivoId');
  if (!id) { id = `disp-${uuid().slice(0, 8)}`; gravar('mf.dispositivoId', id); }
  return id;
}
