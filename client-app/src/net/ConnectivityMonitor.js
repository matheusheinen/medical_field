/**
 * Padrão OBSERVER (Sujeito) + Singleton.
 *
 * O app tem DUAS fontes de "offline", e só está online quando as duas permitem:
 *  1. a chave "Simular conectividade" da tela (exigida pelo enunciado para demonstrar o modo offline);
 *  2. a rede real do aparelho (eventos online/offline do navegador).
 * Quando o resultado muda, todos os observadores inscritos são notificados — o SyncManager
 * é um deles e dispara a sincronização da Outbox assim que a conexão volta.
 */
const CHAVE = 'mf.simuladorOnline';   // onde a posição da chave fica salva (sobrevive ao F5)

class ConnectivityMonitor {
  #observadores = new Set();
  #chaveLigada;   // fonte 1: chave da tela
  #temRede;       // fonte 2: rede real

  constructor() {
    let salvo = null;
    try { salvo = localStorage.getItem(CHAVE); } catch { /* sem storage */ }
    this.#chaveLigada = salvo === null ? true : salvo === 'true';
    this.#temRede = navigator.onLine;
    window.addEventListener('online', () => this.#redeMudou(true));
    window.addEventListener('offline', () => this.#redeMudou(false));
  }

  /** O app só fala com o servidor se a chave estiver ligada E houver rede. */
  get online() { return this.#chaveLigada && this.#temRede; }
  get chaveLigada() { return this.#chaveLigada; }
  get temRede() { return this.#temRede; }

  /** Fonte 1: o usuário clicou na chave "Simular conectividade" (Cabecalho.jsx). */
  ligarChave(ligada) {
    if (ligada === this.#chaveLigada) return;   // nada mudou: ninguém é notificado
    this.#mudar(() => {
      this.#chaveLigada = ligada;
      try { localStorage.setItem(CHAVE, String(ligada)); } catch { /* ignora */ }
    });
  }

  /** Fonte 2: o navegador avisou que a rede caiu ou voltou. */
  #redeMudou(temRede) {
    if (temRede === this.#temRede) return;      // evento repetido do navegador
    this.#mudar(() => { this.#temRede = temRede; });
  }

  /** Parte comum às duas fontes: anota como estava, aplica a mudança e notifica a lista. */
  #mudar(aplicar) {
    const antes = this.online;   // anota ANTES de mudar: os observadores precisam saber se houve transição
    aplicar();
    this.#notificar(antes);
  }

  inscrever(observador) {
    this.#observadores.add(observador);
    return () => this.#observadores.delete(observador);
  }

  #notificar(anterior) {
    const evento = { online: this.online, anterior, chaveLigada: this.#chaveLigada, temRede: this.#temRede };
    // Um observador com erro não pode impedir que os outros sejam notificados
    this.#observadores.forEach((fn) => {
      try { fn(evento); } catch (e) { console.error('[ConnectivityMonitor] observador falhou', e); }
    });
  }
}

export const connectivity = new ConnectivityMonitor();
